import type { LoraTrainingParameters } from './template';

import { createHash, randomUUID } from 'node:crypto';
import { extname, posix } from 'node:path';
import process from 'node:process';

import { getConfig } from '../../../config';
import { useDatabase } from '../../../database';
import { deleteObject, readObject, storeObject } from '../../../storage';
import { writeSystemAudit } from '../../audit/writer';
import { createNotification } from '../../notifications/repository';
import { AiToolkitClient, AiToolkitClientError } from './client';
import { buildLoraJobConfig } from './template';

interface LoraExecutionRow {
  createdBy: string;
  datasetName: string;
  externalJobId: null | string;
  gpuIds: string;
  inputAssets: Array<{
    filename: string;
    id: string;
    mimeType: string;
    objectKey: string;
    sizeBytes: number;
  }>;
  jobId: string;
  jobName: string;
  parameters: LoraTrainingParameters & {
    datasetItems: Array<{ assetId: string; caption: string }>;
    totalSteps: number;
  };
  projectId: string;
  publicId: string;
  status: string;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error);
}

function seconds(milliseconds: number) {
  return Math.max(1, Math.round(milliseconds / 1000));
}

function datasetFilename(index: number, filename: string) {
  const extension = extname(filename)
    .toLowerCase()
    .replaceAll(/[^.a-z0-9]/g, '');
  return `${String(index + 1).padStart(4, '0')}${extension || '.png'}`;
}

export class LoraTrainingWorker {
  #client?: AiToolkitClient;
  #instanceId = `lora-worker:${process.pid}:${randomUUID()}`;

  constructor(input: { client?: AiToolkitClient } = {}) {
    const config = getConfig();
    this.#client =
      input.client ??
      (config.loraApiUrl
        ? new AiToolkitClient({
            apiUrl: config.loraApiUrl,
            timeoutMs: config.loraTimeoutMs,
            token: config.loraApiToken,
          })
        : undefined);
  }

  async runOnce() {
    if (!this.#client) return false;
    await this.#heartbeat();
    const jobId = await this.#claim();
    if (!jobId) return false;
    const job = await this.#load(jobId);
    if (!job) return false;
    if (job.status === 'cancel_requested') await this.#cancel(job);
    else if (['pending', 'submitting'].includes(job.status))
      await this.#submit(job);
    else if (job.status === 'finalizing') await this.#finalize(job);
    else await this.#poll(job);
    return true;
  }

  async runUntil(shouldStop: () => boolean) {
    while (!shouldStop()) {
      const handled = await this.runOnce().catch(async (error) => {
        console.error('LoRA Worker 执行失败', error);
        return false;
      });
      if (!handled) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000, getConfig().loraPollIntervalMs)),
        );
      }
    }
  }

  async #cancel(job: LoraExecutionRow) {
    if (!this.#client) return;
    try {
      if (job.externalJobId) {
        let external = await this.#client.getJob(job.externalJobId);
        if (
          !['completed', 'error', 'stopped', 'stopping'].includes(
            external.status,
          )
        ) {
          await this.#client.cancel(job.externalJobId);
          external = await this.#client.getJob(job.externalJobId);
        }
        if (external.status === 'completed') {
          const sql = useDatabase();
          await sql`
            UPDATE lora_training_executions
            SET status = 'finalizing', next_poll_at = now(), updated_at = now()
            WHERE job_id = ${job.jobId}
          `;
          await this.#finalize({ ...job, status: 'finalizing' });
          return;
        }
        if (external.status === 'error') {
          await this.#fail(
            job,
            'LORA_TRAINING_FAILED',
            external.info || 'AI Toolkit 训练失败',
          );
          return;
        }
        if (external.status !== 'stopped') {
          await this.#schedule(job.jobId, '正在等待训练进程安全停止');
          return;
        }
      }
      const sql = useDatabase();
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE lora_training_executions
          SET status = 'cancelled', completed_at = now(), lease_owner = null,
              lease_expires_at = null, updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET status = 'cancelled', stage = 'LoRA 训练已停止',
              completed_at = now(), updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      await writeSystemAudit({
        action: 'lora.training.cancelled',
        module: 'training',
        targetId: job.jobId,
        targetType: 'job',
      });
    } catch (error) {
      await this.#schedule(job.jobId, '正在等待训练进程安全停止');
      console.error('停止 LoRA 训练失败，将重试', error);
    }
  }

  async #claim() {
    const sql = useDatabase();
    return await sql.begin(async (transaction) => {
      const [candidate] = await transaction<{ jobId: string }[]>`
        SELECT job_id AS "jobId"
        FROM lora_training_executions
        WHERE status IN (
          'pending', 'submitting', 'queued', 'running', 'finalizing',
          'cancel_requested'
        )
          AND next_poll_at <= now()
          AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY next_poll_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (!candidate) return null;
      await transaction`
        UPDATE lora_training_executions
        SET
          lease_owner = ${this.#instanceId},
          lease_expires_at = now() + ${getConfig().loraWorkerLeaseSeconds} * interval '1 second',
          updated_at = now()
        WHERE job_id = ${candidate.jobId}
      `;
      return candidate.jobId;
    });
  }

  async #fail(job: LoraExecutionRow, code: string, message: string) {
    const sql = useDatabase();
    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE lora_training_executions
        SET status = 'failed', last_error = ${transaction.json({ code, message })},
            completed_at = now(), lease_owner = null, lease_expires_at = null,
            updated_at = now()
        WHERE job_id = ${job.jobId}
      `;
      await transaction`
        UPDATE jobs
        SET status = 'failed', stage = ${message},
            error = ${transaction.json({ code, message })},
            completed_at = now(), updated_at = now()
        WHERE id = ${job.jobId}
      `;
    });
    await createNotification({
      link: '/model-training',
      message,
      title: 'LoRA 训练失败',
      type: 'job',
      userId: job.createdBy,
    });
    await writeSystemAudit({
      action: 'lora.training.failed',
      details: { code, message },
      module: 'training',
      result: 'failed',
      targetId: job.jobId,
      targetType: 'job',
    });
  }

  async #finalize(job: LoraExecutionRow) {
    if (!this.#client || !job.externalJobId) {
      await this.#fail(
        job,
        'LORA_EXTERNAL_ID_MISSING',
        '任务缺少 AI Toolkit 任务编号',
      );
      return;
    }
    try {
      const files = await this.#client.getFiles(job.externalJobId);
      if (files.length === 0) {
        await this.#fail(
          job,
          'LORA_ARTIFACT_MISSING',
          '训练完成但没有返回 LoRA 模型产物',
        );
        return;
      }
      for (const file of files.slice(-4))
        await this.#ingest(job, file.path, file.size);
      const sql = useDatabase();
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE lora_training_executions
          SET status = 'succeeded', completed_at = now(), lease_owner = null,
              lease_expires_at = null, updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET status = 'succeeded', progress = 100,
              stage = 'LoRA 模型已登记为项目资产', error = null,
              completed_at = now(), updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      await createNotification({
        link: '/assets',
        message: `已登记 ${Math.min(files.length, 4)} 个 LoRA 模型资产。`,
        title: 'LoRA 训练完成',
        type: 'job',
        userId: job.createdBy,
      });
      await writeSystemAudit({
        action: 'lora.artifact.registered',
        details: { artifactCount: Math.min(files.length, 4) },
        module: 'training',
        targetId: job.jobId,
        targetType: 'job',
      });
    } catch (error) {
      await this.#fail(
        job,
        'LORA_ARTIFACT_REGISTRATION_FAILED',
        `LoRA 产物登记失败：${safeError(error)}`,
      );
    }
  }

  async #heartbeat() {
    const sql = useDatabase();
    await sql`
      INSERT INTO worker_heartbeats (instance_id, metadata)
      VALUES (${this.#instanceId}, ${sql.json({ provider: 'ai-toolkit' })})
      ON CONFLICT (instance_id) DO UPDATE
      SET last_seen_at = now(), metadata = EXCLUDED.metadata
    `;
  }

  async #ingest(
    job: LoraExecutionRow,
    externalPath: string,
    reportedSize: number,
  ) {
    if (!this.#client) throw new Error('AI Toolkit 客户端未配置');
    const config = getConfig();
    if (reportedSize > config.loraMaxOutputBytes) {
      throw new Error(
        `LoRA 产物超过最大限制 ${config.loraMaxOutputBytes} 字节`,
      );
    }
    const sql = useDatabase();
    const [receipt] = await sql<{ assetId: null | string; status: string }[]>`
      INSERT INTO lora_artifact_receipts (job_id, external_path)
      VALUES (${job.jobId}, ${externalPath})
      ON CONFLICT (job_id, external_path) DO UPDATE SET updated_at = now()
      RETURNING asset_id AS "assetId", status
    `;
    if (receipt?.status === 'available' && receipt.assetId)
      return receipt.assetId;

    const response = await this.#client.download(externalPath);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > config.loraMaxOutputBytes) {
      throw new Error(
        `LoRA 产物超过最大限制 ${config.loraMaxOutputBytes} 字节`,
      );
    }
    const originalFilename = posix.basename(externalPath);
    if (!originalFilename.toLowerCase().endsWith('.safetensors')) {
      throw new Error('AI Toolkit 返回了非 safetensors 产物');
    }
    const assetId = randomUUID();
    const versionId = randomUUID();
    const objectKey = `${job.projectId}/${assetId}/v1/${versionId}.safetensors`;
    const mimeType = 'application/octet-stream';
    const stored = await storeObject(objectKey, mimeType, bytes);
    try {
      await sql.begin(async (transaction) => {
        await transaction`
          INSERT INTO assets (
            id, project_id, name, description, kind, source, source_app_key,
            source_job_id, owner_id, status, saved_at
          ) VALUES (
            ${assetId}, ${job.projectId}, ${`LoRA · ${originalFilename}`},
            ${`由 ${job.jobName} 训练生成，可供同项目生成能力复用。`},
            'model', 'workflow', 'lora-training', ${job.jobId},
            ${job.createdBy}, 'available', now()
          )
        `;
        await transaction`
          INSERT INTO asset_versions (
            id, asset_id, version, storage_kind, object_key, original_filename,
            mime_type, size_bytes, sha256, storage_etag, status, metadata,
            created_by, completed_at
          ) VALUES (
            ${versionId}, ${assetId}, 1, 'object', ${objectKey},
            ${originalFilename}, ${mimeType}, ${bytes.byteLength},
            ${createHash('sha256').update(bytes).digest('hex')},
            ${stored.ETag?.replaceAll('"', '') ?? null}, 'available',
            ${transaction.json({ aiToolkitJobId: job.externalJobId, model: job.parameters.baseModel })},
            ${job.createdBy}, now()
          )
        `;
        for (const tag of ['lora', 'ai-toolkit', job.parameters.baseModel]) {
          await transaction`
            INSERT INTO asset_tags (asset_id, tag) VALUES (${assetId}, ${tag})
            ON CONFLICT DO NOTHING
          `;
        }
        await transaction`
          INSERT INTO job_outputs (job_id, asset_id, position)
          VALUES (
            ${job.jobId}, ${assetId},
            (SELECT count(*)::integer FROM job_outputs WHERE job_id = ${job.jobId})
          )
          ON CONFLICT DO NOTHING
        `;
        await transaction`
          UPDATE lora_artifact_receipts
          SET object_key = ${objectKey}, asset_id = ${assetId}, status = 'available',
              error = null, updated_at = now()
          WHERE job_id = ${job.jobId} AND external_path = ${externalPath}
        `;
      });
      return assetId;
    } catch (error) {
      await deleteObject(objectKey).catch(() => undefined);
      await sql`
        UPDATE lora_artifact_receipts
        SET status = 'failed', error = ${sql.json({ message: safeError(error) })},
            updated_at = now()
        WHERE job_id = ${job.jobId} AND external_path = ${externalPath}
      `;
      throw error;
    }
  }

  async #load(jobId: string) {
    const sql = useDatabase();
    const [row] = await sql<LoraExecutionRow[]>`
      SELECT
        job.id AS "jobId", job.public_id AS "publicId",
        job.project_id AS "projectId", job.name AS "jobName",
        job.parameters, job.created_by AS "createdBy",
        execution.status, execution.dataset_name AS "datasetName",
        execution.external_job_id AS "externalJobId",
        execution.gpu_ids AS "gpuIds",
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', asset.id, 'filename', version.original_filename,
              'mimeType', version.mime_type, 'objectKey', version.object_key,
              'sizeBytes', version.size_bytes::float8
            ) ORDER BY input.position
          )
          FROM job_inputs input
          JOIN assets asset ON asset.id = input.asset_id
          JOIN asset_versions version
            ON version.asset_id = asset.id AND version.version = asset.current_version
          WHERE input.job_id = job.id
        ), '[]'::jsonb) AS "inputAssets"
      FROM lora_training_executions execution
      JOIN jobs job ON job.id = execution.job_id
      WHERE execution.job_id = ${jobId}
    `;
    return row ?? null;
  }

  async #poll(job: LoraExecutionRow) {
    if (!this.#client || !job.externalJobId) {
      await this.#fail(
        job,
        'LORA_EXTERNAL_ID_MISSING',
        '任务缺少 AI Toolkit 任务编号',
      );
      return;
    }
    try {
      const external = await this.#client.getJob(job.externalJobId);
      if (external.status === 'error') {
        await this.#fail(
          job,
          'LORA_TRAINING_FAILED',
          external.info || 'AI Toolkit 训练失败',
        );
        return;
      }
      if (external.status === 'stopped') {
        await this.#fail(
          job,
          'LORA_TRAINING_STOPPED',
          external.info || 'AI Toolkit 训练已停止',
        );
        return;
      }
      if (external.status === 'completed') {
        const sql = useDatabase();
        await sql`
          UPDATE lora_training_executions
          SET status = 'finalizing', next_poll_at = now(), updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await this.#finalize({ ...job, status: 'finalizing' });
        return;
      }
      const step = Math.max(0, external.step ?? 0);
      const total = Math.max(
        0,
        external.total_steps ?? job.parameters.totalSteps,
      );
      const progress =
        total > 0 ? Math.min(99, Math.floor((step / total) * 100)) : 0;
      const running = external.status === 'running';
      const stage = running
        ? `LoRA 训练中 · ${step}/${total}${external.speed_string ? ` · ${external.speed_string}` : ''}`
        : 'AI Toolkit GPU 队列等待中';
      const sql = useDatabase();
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE lora_training_executions
          SET status = ${running ? 'running' : 'queued'}, attempt_count = 0,
              last_error = null, next_poll_at = now() + ${seconds(getConfig().loraPollIntervalMs)} * interval '1 second',
              lease_owner = null, lease_expires_at = null, last_polled_at = now(),
              updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET status = ${running ? 'running' : 'queued'}, progress = ${progress},
              stage = ${stage}, started_at = COALESCE(started_at, now()), updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
    } catch (error) {
      await this.#retry(
        job,
        'LORA_STATUS_FAILED',
        `读取 LoRA 训练状态失败：${safeError(error)}`,
      );
    }
  }

  async #retry(job: LoraExecutionRow, code: string, message: string) {
    const sql = useDatabase();
    const [result] = await sql<{ attempts: number }[]>`
      UPDATE lora_training_executions
      SET attempt_count = attempt_count + 1,
          last_error = ${sql.json({ code, message })},
          next_poll_at = now() + ${seconds(getConfig().loraPollIntervalMs)} * interval '1 second',
          lease_owner = null, lease_expires_at = null, updated_at = now()
      WHERE job_id = ${job.jobId}
      RETURNING attempt_count AS attempts
    `;
    if ((result?.attempts ?? 4) < 4) {
      await sql`
        UPDATE jobs SET stage = 'AI Toolkit 暂时不可达，正在自动重试', updated_at = now()
        WHERE id = ${job.jobId}
      `;
      return;
    }
    await this.#fail(job, code, message);
  }

  async #schedule(jobId: string, stage: string) {
    const sql = useDatabase();
    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE lora_training_executions
        SET next_poll_at = now() + ${seconds(getConfig().loraPollIntervalMs)} * interval '1 second',
            lease_owner = null, lease_expires_at = null, updated_at = now()
        WHERE job_id = ${jobId}
      `;
      await transaction`
        UPDATE jobs SET stage = ${stage}, updated_at = now() WHERE id = ${jobId}
      `;
    });
  }

  async #submit(job: LoraExecutionRow) {
    if (!this.#client) return;
    const sql = useDatabase();
    await sql`
      UPDATE lora_training_executions
      SET status = 'submitting', updated_at = now()
      WHERE job_id = ${job.jobId}
    `;
    try {
      let external = await this.#client
        .getJobByRef(job.publicId)
        .catch((error) => {
          if (error instanceof AiToolkitClientError && error.status === 404)
            return null;
          throw error;
        });
      if (!external) {
        const captions = new Map(
          job.parameters.datasetItems.map((item) => [
            item.assetId,
            item.caption,
          ]),
        );
        const files: Array<{
          bytes: Uint8Array;
          filename: string;
          mimeType: string;
        }> = [];
        for (const [index, asset] of job.inputAssets.entries()) {
          const filename = datasetFilename(index, asset.filename);
          const stem = filename.slice(0, -extname(filename).length);
          const caption = captions.get(asset.id);
          if (!caption) throw new Error(`训练图片 ${asset.id} 缺少 caption`);
          const normalizedCaption = caption.includes(job.parameters.triggerWord)
            ? caption
            : `${job.parameters.triggerWord}, ${caption}`;
          files.push(
            {
              bytes: await readObject(asset.objectKey),
              filename,
              mimeType: asset.mimeType,
            },
            {
              bytes: new TextEncoder().encode(normalizedCaption),
              filename: `${stem}.txt`,
              mimeType: 'text/plain;charset=utf-8',
            },
          );
        }
        const dataset = await this.#client.createDataset(job.datasetName);
        await this.#client.uploadDataset(dataset.name, files);
        const datasetRoot = await this.#client
          .getDatasetRoot()
          .catch(() => getConfig().loraDatasetsRoot);
        const externalName = `rail_lora_${job.publicId.toLowerCase().replaceAll('-', '_')}`;
        try {
          external = await this.#client.createJob({
            gpuIds: job.gpuIds,
            jobConfig: buildLoraJobConfig({
              datasetName: dataset.name,
              datasetRoot,
              imageCount: job.inputAssets.length,
              name: externalName,
              parameters: job.parameters,
            }),
            jobRef: job.publicId,
            name: externalName,
          });
        } catch (error) {
          if (!(error instanceof AiToolkitClientError) || error.status !== 409)
            throw error;
          external = await this.#client.getJobByRef(job.publicId);
          if (!external) throw error;
        }
      }
      if (external.status === 'error') {
        await this.#fail(
          job,
          'LORA_TRAINING_FAILED',
          external.info || 'AI Toolkit 训练失败',
        );
        return;
      }
      if (external.status === 'completed') {
        await sql`
          UPDATE lora_training_executions
          SET status = 'finalizing', external_job_id = ${external.id},
              submitted_at = COALESCE(submitted_at, now()), next_poll_at = now(),
              updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await sql`
          UPDATE jobs
          SET status = 'running', stage = '正在登记 LoRA 模型产物',
              external_reference = ${external.id}, updated_at = now()
          WHERE id = ${job.jobId}
        `;
        await this.#finalize({
          ...job,
          externalJobId: external.id,
          status: 'finalizing',
        });
        return;
      }
      if (external.status === 'stopping') {
        await this.#fail(
          job,
          'LORA_TRAINING_STOPPING',
          'AI Toolkit 任务正在停止，不能重新提交',
        );
        return;
      }
      if (external.status === 'stopped') {
        await this.#client.start(external.id, job.gpuIds);
      }
      const running = external.status === 'running';
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE lora_training_executions
          SET status = ${running ? 'running' : 'queued'}, external_job_id = ${external.id},
              attempt_count = 0, last_error = null, submitted_at = COALESCE(submitted_at, now()),
              next_poll_at = now() + ${seconds(getConfig().loraPollIntervalMs)} * interval '1 second',
              lease_owner = null, lease_expires_at = null, updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET status = ${running ? 'running' : 'queued'},
              stage = ${running ? 'AI Toolkit 正在执行 LoRA 训练' : '已提交 AI Toolkit GPU 队列'},
              external_reference = ${external.id}, started_at = COALESCE(started_at, now()),
              updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      await writeSystemAudit({
        action: 'lora.training.submitted',
        details: { gpuIds: job.gpuIds },
        module: 'training',
        targetId: job.jobId,
        targetType: 'job',
      });
    } catch (error) {
      await this.#retry(
        job,
        'LORA_SUBMISSION_FAILED',
        `提交 LoRA 训练失败：${safeError(error)}`,
      );
    }
  }
}
