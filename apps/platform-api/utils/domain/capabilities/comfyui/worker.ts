import type { WorkflowOutputDefinition } from '../../workflows/schema';
import type { ComfyExecutionSnapshot, ComfyOutputFile } from './client';

import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';

import { getConfig } from '../../../infrastructure/config';
import { useDatabase } from '../../../infrastructure/database';
import {
  deleteObject,
  readObject,
  storeObject,
} from '../../../infrastructure/storage';
import { validateFileForKind } from '../../assets/validation';
import { writeSystemAudit } from '../../audit/writer';
import { createNotification } from '../../notifications/repository';
import {
  materializeWorkflow,
  materializeWorkflowAssets,
  workflowOutputSchema,
  workflowParameterSchema,
  workflowValidationErrorMessage,
} from '../../workflows/schema';
import { ComfyUiClient } from './client';

interface ExecutionRow {
  apiJson: Record<string, unknown>;
  appKey: string;
  capabilityName: string;
  createdBy: string;
  externalJobId: null | string;
  inputAssets: Array<{
    filename: string;
    id: string;
    kind: string;
    mimeType: string;
    objectKey: string;
  }>;
  jobId: string;
  jobName: string;
  outputSchema: unknown;
  parameters: Record<string, unknown>;
  parameterSchema: unknown;
  projectId: string;
  status: string;
}

export interface ComfyMappedOutput {
  definition: WorkflowOutputDefinition;
  externalOutputKey: string;
  file: ComfyOutputFile;
  inline?: {
    bytes: Uint8Array;
    mimeType: string;
  };
}

export function extractComfyOutputFiles(
  outputs: Record<string, Record<string, unknown>>,
  rawSchema: unknown,
) {
  const schema = workflowOutputSchema.array().parse(rawSchema);
  const mapped: ComfyMappedOutput[] = [];
  for (const definition of schema) {
    const value = outputs[definition.nodeId]?.[definition.field];
    const candidates: unknown[] = Array.isArray(value) ? value : [];
    if (!Array.isArray(value) && value) candidates.push(value);
    for (const candidate of candidates) {
      if (
        definition.kind === 'text' &&
        ['boolean', 'number', 'string'].includes(typeof candidate)
      ) {
        const content = String(candidate);
        const digest = createHash('sha256').update(content).digest('hex');
        mapped.push({
          definition,
          externalOutputKey: JSON.stringify([
            definition.nodeId,
            definition.field,
            digest,
          ]),
          file: {
            filename: `${definition.nodeId}-${definition.field}.txt`,
            type: 'inline',
          },
          inline: {
            bytes: new TextEncoder().encode(content),
            mimeType: 'text/plain',
          },
        });
        continue;
      }
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate) ||
        typeof (candidate as { filename?: unknown }).filename !== 'string'
      ) {
        continue;
      }
      const file = candidate as ComfyOutputFile;
      const externalOutputKey = JSON.stringify([
        definition.nodeId,
        definition.field,
        file.filename,
        file.subfolder ?? '',
        file.type ?? 'output',
      ]);
      mapped.push({ definition, externalOutputKey, file });
    }
  }
  return mapped;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 2000) : '未知错误';
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class ComfyUiWorker {
  readonly #client: ComfyUiClient | null;
  readonly #instanceId: string;

  constructor(options?: {
    client?: ComfyUiClient | null;
    instanceId?: string;
  }) {
    const config = getConfig();
    this.#instanceId = options?.instanceId ?? `comfyui-${randomUUID()}`;
    this.#client =
      options?.client ??
      (config.comfyuiApiUrl
        ? new ComfyUiClient({
            apiToken: config.comfyuiApiToken,
            apiUrl: config.comfyuiApiUrl,
            timeoutMs: config.comfyuiTimeoutMs,
          })
        : null);
  }

  async heartbeat() {
    const sql = useDatabase();
    await sql`
      INSERT INTO worker_heartbeats (
        instance_id, started_at, last_seen_at, metadata
      ) VALUES (
        ${this.#instanceId},
        now(),
        now(),
        ${sql.json({ adapter: 'comfyui', configured: Boolean(this.#client) })}
      )
      ON CONFLICT (instance_id) DO UPDATE SET
        last_seen_at = now(),
        metadata = EXCLUDED.metadata
    `;
  }

  async runOnce() {
    await this.heartbeat();
    const jobId = await this.#claimJob();
    if (!jobId) return false;
    const job = await this.#loadExecution(jobId);
    if (!job) return false;
    if (job.status === 'pending') await this.#submit(job);
    else if (job.status === 'submitting') {
      await this.#fail(
        job,
        'COMFYUI_SUBMIT_UNKNOWN',
        'Worker 在提交确认前中断；为避免重复执行，任务已停止，请重新提交',
      );
    } else if (job.status === 'cancel_requested') await this.#cancel(job);
    else await this.#poll(job);
    return true;
  }

  async runUntil(stopRequested: () => boolean) {
    while (!stopRequested()) {
      const handled = await this.runOnce();
      if (!handled) await wait(1000);
    }
  }

  async #cancel(job: ExecutionRow) {
    const sql = useDatabase();
    if (!job.externalJobId) {
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE job_executions
          SET
            status = 'cancelled',
            completed_at = now(),
            lease_owner = null,
            lease_expires_at = null,
            updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET
            status = 'cancelled',
            stage = '任务已取消',
            completed_at = now(),
            updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      return;
    }
    try {
      await this.#client?.cancel(job.externalJobId);
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE job_executions
          SET
            status = 'cancelled',
            completed_at = now(),
            lease_owner = null,
            lease_expires_at = null,
            updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET
            status = 'cancelled',
            stage = 'ComfyUI 任务已取消',
            completed_at = now(),
            updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      await writeSystemAudit({
        action: 'workflow.comfyui.cancelled',
        module: 'workflow',
        targetId: job.jobId,
        targetType: 'job',
      });
    } catch (error) {
      await this.#fail(
        job,
        'COMFYUI_CANCEL_FAILED',
        `取消 ComfyUI 任务失败：${safeError(error)}`,
      );
    }
  }

  async #claimJob() {
    if (!this.#client) return null;
    const sql = useDatabase();
    return await sql.begin(async (transaction) => {
      const [candidate] = await transaction<{ jobId: string }[]>`
        SELECT job_id AS "jobId"
        FROM job_executions
        WHERE status IN (
          'pending', 'submitting', 'queued', 'running', 'finalizing', 'cancel_requested'
        )
          AND next_poll_at <= now()
          AND (
            lease_expires_at IS NULL
            OR lease_expires_at < now()
            OR lease_owner = ${this.#instanceId}
          )
        ORDER BY next_poll_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (!candidate) return null;
      await transaction`
        UPDATE job_executions
        SET
          lease_owner = ${this.#instanceId},
          lease_expires_at =
            now() + ${getConfig().comfyuiLeaseSeconds} * interval '1 second',
          updated_at = now()
        WHERE job_id = ${candidate.jobId}
      `;
      return candidate.jobId;
    });
  }

  async #fail(job: ExecutionRow, code: string, message: string) {
    const sql = useDatabase();
    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE job_executions
        SET
          status = 'failed',
          last_error = ${transaction.json({ code, message })},
          lease_owner = null,
          lease_expires_at = null,
          completed_at = now(),
          updated_at = now()
        WHERE job_id = ${job.jobId}
      `;
      await transaction`
        UPDATE jobs
        SET
          status = 'failed',
          stage = ${message},
          error = ${transaction.json({ code, message })},
          completed_at = now(),
          updated_at = now()
        WHERE id = ${job.jobId}
      `;
    });
    await createNotification({
      link: '/jobs',
      message,
      title: '工作流任务执行失败',
      type: 'job',
      userId: job.createdBy,
    });
    await writeSystemAudit({
      action: 'workflow.job.failed',
      details: { code, message },
      module: 'workflow',
      result: 'failed',
      targetId: job.jobId,
      targetType: 'job',
    });
  }

  async #finalize(job: ExecutionRow, snapshot: ComfyExecutionSnapshot) {
    const mapped = extractComfyOutputFiles(
      snapshot.outputs ?? {},
      job.outputSchema,
    ).filter((output) => output.definition.role === 'primary');
    if (mapped.length === 0) {
      await this.#fail(
        job,
        'COMFYUI_OUTPUT_MISSING',
        'ComfyUI 已完成，但未返回已配置的主要输出',
      );
      return;
    }
    try {
      for (const output of mapped) {
        await this.#ingestOutput(job, output);
      }
      const sql = useDatabase();
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE job_executions
          SET
            status = 'succeeded',
            completed_at = now(),
            lease_owner = null,
            lease_expires_at = null,
            updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET
            status = 'succeeded',
            progress = 100,
            stage = '输出已登记为项目资产',
            error = null,
            completed_at = now(),
            updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      await createNotification({
        link: '/assets',
        message: 'ComfyUI 输出已写入对象存储并登记为项目资产。',
        title: `${job.capabilityName}任务已完成`,
        type: 'job',
        userId: job.createdBy,
      });
      await writeSystemAudit({
        action: 'workflow.output.registered',
        details: { outputCount: mapped.length },
        module: 'workflow',
        targetId: job.jobId,
        targetType: 'job',
      });
    } catch (error) {
      await this.#fail(
        job,
        'OUTPUT_REGISTRATION_FAILED',
        `工作流输出登记失败：${safeError(error)}`,
      );
    }
  }

  async #ingestOutput(job: ExecutionRow, output: ComfyMappedOutput) {
    if (!this.#client) throw new Error('ComfyUI 客户端未配置');
    const sql = useDatabase();
    const [receipt] = await sql<
      { assetId: null | string; objectKey: null | string; status: string }[]
    >`
      INSERT INTO job_output_receipts (
        job_id, external_output_key, node_id, filename, subfolder, output_type
      ) VALUES (
        ${job.jobId},
        ${output.externalOutputKey},
        ${output.definition.nodeId},
        ${output.file.filename},
        ${output.file.subfolder ?? ''},
        ${output.file.type ?? 'output'}
      )
      ON CONFLICT (job_id, external_output_key) DO UPDATE
      SET updated_at = now()
      RETURNING
        status,
        asset_id AS "assetId",
        object_key AS "objectKey"
    `;
    if (receipt?.status === 'available' && receipt.assetId) {
      return receipt.assetId;
    }

    const downloaded =
      output.inline ?? (await this.#client.download(output.file));
    const config = getConfig();
    if (downloaded.bytes.byteLength > config.comfyuiMaxOutputBytes) {
      throw new Error(
        `ComfyUI 输出超过最大限制 ${config.comfyuiMaxOutputBytes} 字节`,
      );
    }
    const filename = basename(output.file.filename).slice(0, 255);
    if (
      !validateFileForKind(
        output.definition.kind,
        downloaded.mimeType,
        filename,
      )
    ) {
      throw new Error(
        `ComfyUI 输出类型不匹配：${filename} / ${downloaded.mimeType}`,
      );
    }
    const assetId = randomUUID();
    const versionId = randomUUID();
    const extension = extname(filename)
      .toLowerCase()
      .replaceAll(/[^.\da-z]/g, '')
      .slice(0, 16);
    const objectKey = `${job.projectId}/${assetId}/v1/${versionId}${extension}`;
    const stored = await storeObject(
      objectKey,
      downloaded.mimeType,
      downloaded.bytes,
    );
    try {
      await sql.begin(async (transaction) => {
        await transaction`
          INSERT INTO assets (
            id, project_id, name, description, kind, source, source_app_key,
            source_job_id, owner_id, status, saved_at
          ) VALUES (
            ${assetId},
            ${job.projectId},
            ${`${job.capabilityName} · ${filename}`},
            ${`由 ${job.jobName} 生成，等待用户确认是否保存到资产中心。`},
            ${output.definition.kind},
            'workflow',
            ${job.appKey},
            ${job.jobId},
            ${job.createdBy},
            'available',
            NULL
          )
        `;
        await transaction`
          INSERT INTO asset_versions (
            id, asset_id, version, storage_kind, object_key,
            original_filename, mime_type, size_bytes, sha256, storage_etag,
            status, metadata, created_by, completed_at
          ) VALUES (
            ${versionId},
            ${assetId},
            1,
            'object',
            ${objectKey},
            ${filename},
            ${downloaded.mimeType},
            ${downloaded.bytes.byteLength},
            ${createHash('sha256').update(downloaded.bytes).digest('hex')},
            ${stored.ETag?.replaceAll('"', '') ?? null},
            'available',
            ${transaction.json({
              comfyui: {
                filename: output.file.filename,
                nodeId: output.definition.nodeId,
                subfolder: output.file.subfolder ?? '',
                type: output.file.type ?? 'output',
              },
            })},
            ${job.createdBy},
            now()
          )
        `;
        for (const tag of new Set(output.definition.tags)) {
          await transaction`
            INSERT INTO asset_tags (asset_id, tag)
            VALUES (${assetId}, ${tag})
            ON CONFLICT DO NOTHING
          `;
        }
        await transaction`
          INSERT INTO job_outputs (job_id, asset_id, position)
          VALUES (
            ${job.jobId},
            ${assetId},
            (
              SELECT count(*)::integer
              FROM job_outputs
              WHERE job_id = ${job.jobId}
            )
          )
          ON CONFLICT DO NOTHING
        `;
        await transaction`
          UPDATE job_output_receipts
          SET
            object_key = ${objectKey},
            asset_id = ${assetId},
            status = 'available',
            error = null,
            updated_at = now()
          WHERE
            job_id = ${job.jobId}
            AND external_output_key = ${output.externalOutputKey}
        `;
      });
      return assetId;
    } catch (error) {
      await deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async #loadExecution(jobId: string) {
    const sql = useDatabase();
    const [row] = await sql<ExecutionRow[]>`
      SELECT
        j.id AS "jobId",
        j.project_id AS "projectId",
        j.app_key AS "appKey",
        j.name AS "jobName",
        j.parameters,
        j.created_by AS "createdBy",
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', a.id,
              'kind', a.kind,
              'filename', av.original_filename,
              'mimeType', av.mime_type,
              'objectKey', av.object_key
            )
            ORDER BY ji.position
          )
          FROM job_inputs ji
          JOIN assets a ON a.id = ji.asset_id
          JOIN LATERAL (
            SELECT original_filename, mime_type, object_key
            FROM asset_versions
            WHERE asset_id = a.id AND status = 'available'
            ORDER BY version DESC
            LIMIT 1
          ) av ON true
          WHERE ji.job_id = j.id
        ), '[]'::jsonb) AS "inputAssets",
        je.status,
        je.external_job_id AS "externalJobId",
        wv.api_json AS "apiJson",
        wv.parameter_schema AS "parameterSchema",
        wv.output_schema AS "outputSchema",
        c.name AS "capabilityName"
      FROM job_executions je
      JOIN jobs j ON j.id = je.job_id
      JOIN workflow_versions wv ON wv.id = je.workflow_version_id
      JOIN capability_workflows cw
        ON cw.workflow_version_id = wv.id
      JOIN capabilities c ON c.code = cw.capability_code
      WHERE je.job_id = ${jobId}
      ORDER BY cw.active DESC
      LIMIT 1
    `;
    return row ?? null;
  }

  async #materializeInputAssets(
    job: ExecutionRow,
    prompt: Record<string, unknown>,
  ) {
    if (!this.#client) throw new Error('ComfyUI 客户端未配置');
    const definitions = workflowParameterSchema
      .array()
      .parse(job.parameterSchema);
    const media = definitions.filter((field) =>
      ['asset', 'capture', 'mask', 'region'].includes(field.type),
    );
    const values = new Map<
      number,
      { dataUrl: string; kind: string; uploadName: string }
    >();
    for (const field of media) {
      if (field.assetIndex === undefined || values.has(field.assetIndex)) {
        continue;
      }
      const asset = job.inputAssets[field.assetIndex];
      if (!asset) continue;
      const bytes = await readObject(asset.objectKey);
      const dataUrl = `data:${asset.mimeType};base64,${Buffer.from(bytes).toString('base64')}`;
      let uploadName = '';
      if (field.targets.some((target) => target.transport === 'upload')) {
        const uploaded = await this.#client.uploadInput({
          bytes,
          filename: basename(asset.filename).slice(0, 200),
          mimeType: asset.mimeType,
          subfolder: `rail-platform/${job.jobId}`,
        });
        uploadName = uploaded.value;
      }
      values.set(field.assetIndex, {
        dataUrl,
        kind: asset.kind,
        uploadName,
      });
    }
    return materializeWorkflowAssets(prompt, job.parameterSchema, values);
  }

  async #poll(job: ExecutionRow) {
    if (!this.#client || !job.externalJobId) {
      await this.#fail(
        job,
        'COMFYUI_EXTERNAL_ID_MISSING',
        '任务缺少 ComfyUI prompt_id',
      );
      return;
    }
    try {
      const snapshot = await this.#client.getStatus(job.externalJobId);
      if (snapshot.status === 'failed') {
        await this.#fail(
          job,
          snapshot.errorCode ?? 'COMFYUI_EXECUTION_FAILED',
          snapshot.errorMessage ?? 'ComfyUI 工作流执行失败',
        );
        return;
      }
      if (snapshot.status === 'succeeded') {
        const sql = useDatabase();
        await sql`
          UPDATE job_executions
          SET status = 'finalizing', updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await this.#finalize(job, snapshot);
        return;
      }
      const sql = useDatabase();
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE job_executions
          SET status = ${snapshot.status}, updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET
            status = 'running',
            progress = ${snapshot.progress},
            stage = ${
              snapshot.status === 'running'
                ? 'ComfyUI 正在执行工作流'
                : 'ComfyUI 队列等待中'
            },
            updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      await this.#schedule(
        job.jobId,
        Math.max(1, Math.round(getConfig().comfyuiPollIntervalMs / 1000)),
      );
    } catch (error) {
      await this.#retryStatus(job, error);
    }
  }

  async #retryStatus(job: ExecutionRow, error: unknown) {
    const sql = useDatabase();
    const message = `读取 ComfyUI 状态失败：${safeError(error)}`;
    const [result] = await sql<{ attempts: number }[]>`
      UPDATE job_executions
      SET
        attempt_count = attempt_count + 1,
        last_error = ${sql.json({ code: 'COMFYUI_STATUS_FAILED', message })},
        next_poll_at = now() + ${Math.max(
          1,
          Math.round(getConfig().comfyuiPollIntervalMs / 1000),
        )} * interval '1 second',
        lease_owner = null,
        lease_expires_at = null,
        updated_at = now()
      WHERE job_id = ${job.jobId}
      RETURNING attempt_count AS attempts
    `;
    if ((result?.attempts ?? 4) < 4) {
      await sql`
        UPDATE jobs
        SET
          stage = 'ComfyUI 暂时不可达，正在自动重试',
          updated_at = now()
        WHERE id = ${job.jobId}
      `;
      return;
    }
    await this.#fail(job, 'COMFYUI_STATUS_FAILED', message);
  }

  async #schedule(jobId: string, seconds: number) {
    const sql = useDatabase();
    await sql`
      UPDATE job_executions
      SET
        next_poll_at = now() + ${seconds} * interval '1 second',
        lease_owner = null,
        lease_expires_at = null,
        last_polled_at = now(),
        updated_at = now()
      WHERE job_id = ${jobId}
    `;
  }

  async #submit(job: ExecutionRow) {
    if (!this.#client) return;
    let prompt: Record<string, unknown>;
    try {
      prompt = materializeWorkflow(
        job.apiJson,
        job.parameterSchema,
        job.parameters,
      );
      prompt = await this.#materializeInputAssets(job, prompt);
    } catch (error) {
      await this.#fail(
        job,
        'WORKFLOW_PARAMETER_INVALID',
        workflowValidationErrorMessage(error),
      );
      return;
    }
    const sql = useDatabase();
    await sql`
      UPDATE job_executions
      SET
        status = 'submitting',
        attempt_count = attempt_count + 1,
        updated_at = now()
      WHERE job_id = ${job.jobId}
    `;
    try {
      const submitted = await this.#client.submit(prompt, job.jobId);
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE job_executions
          SET
            status = 'queued',
            external_job_id = ${submitted.externalJobId},
            submitted_at = now(),
            next_poll_at = now(),
            lease_owner = null,
            lease_expires_at = null,
            updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET
            status = 'running',
            progress = 5,
            stage = '已提交 ComfyUI，等待执行',
            external_reference = ${submitted.externalJobId},
            started_at = COALESCE(started_at, now()),
            updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      await writeSystemAudit({
        action: 'workflow.comfyui.submitted',
        details: { externalJobId: submitted.externalJobId },
        module: 'workflow',
        targetId: job.jobId,
        targetType: 'job',
      });
    } catch (error) {
      await this.#fail(
        job,
        'COMFYUI_SUBMIT_FAILED',
        `提交 ComfyUI 失败：${safeError(error)}`,
      );
    }
  }
}
