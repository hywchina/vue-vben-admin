import type { ReportImageAsset } from './renderer';
import type { CreateReportInput } from './schema';

import { createHash, randomUUID } from 'node:crypto';
import process from 'node:process';

import { useDatabase } from '../../../database';
import { getConfig } from '../../../infrastructure/config';
import { deleteObject, readObject, storeObject } from '../../../storage';
import { writeSystemAudit } from '../../audit/writer';
import { createNotification } from '../../notifications/repository';
import { generateAiReportArtifact, ReportAiAdapterError } from './ai-adapter';
import { renderReportArtifact } from './renderer';
import { reportTypeLabels } from './schema';

const MAX_ATTEMPTS = 3;
const LEASE_SECONDS = 60;

interface ReportExecutionRow {
  attemptCount: number;
  createdAt: Date;
  createdBy: string;
  generationMode: 'ai' | 'template';
  inputAssets: Array<{
    filename: string;
    id: string;
    mimeType: 'image/jpeg' | 'image/png';
    name: string;
    objectKey: string;
  }>;
  jobId: string;
  jobName: string;
  objectKey: string;
  outputAssetId: string;
  parameters: CreateReportInput;
  projectId: string;
  projectName: string;
  requestedBy: string;
  status: string;
  templateKey: string;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error);
}

export class ReportGenerationWorker {
  #instanceId = `report-worker:${process.pid}:${randomUUID()}`;

  async runOnce() {
    await this.#heartbeat();
    const jobId = await this.#claim();
    if (!jobId) return false;
    const job = await this.#load(jobId);
    if (!job) return false;
    await (job.status === 'cancel_requested'
      ? this.#cancel(job)
      : this.#generate(job));
    return true;
  }

  async runUntil(shouldStop: () => boolean) {
    while (!shouldStop()) {
      const handled = await this.runOnce().catch((error) => {
        console.error('报告生成 Worker 执行失败', error);
        return false;
      });
      if (!handled) {
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    }
  }

  async #cancel(job: ReportExecutionRow) {
    const sql = useDatabase();
    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE report_generation_executions
        SET status = 'cancelled', completed_at = now(), lease_owner = null,
            lease_expires_at = null, updated_at = now()
        WHERE job_id = ${job.jobId}
      `;
      await transaction`
        UPDATE jobs
        SET status = 'cancelled', stage = '报告生成已取消',
            progress = LEAST(progress, 99), completed_at = now(), updated_at = now()
        WHERE id = ${job.jobId}
      `;
    });
    await writeSystemAudit({
      action: 'report.generation.cancelled',
      module: 'report',
      targetId: job.jobId,
      targetType: 'job',
    });
  }

  async #claim() {
    const sql = useDatabase();
    return await sql.begin(async (transaction) => {
      const [candidate] = await transaction<{ jobId: string }[]>`
        SELECT job_id AS "jobId"
        FROM report_generation_executions
        WHERE status IN ('pending', 'running', 'cancel_requested')
          AND next_attempt_at <= now()
          AND (lease_expires_at IS NULL OR lease_expires_at < now())
        ORDER BY next_attempt_at, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (!candidate) return null;
      await transaction`
        UPDATE report_generation_executions
        SET lease_owner = ${this.#instanceId},
            lease_expires_at = now() + ${LEASE_SECONDS} * interval '1 second',
            attempt_count = CASE WHEN status = 'cancel_requested'
              THEN attempt_count ELSE attempt_count + 1 END,
            updated_at = now()
        WHERE job_id = ${candidate.jobId}
      `;
      return candidate.jobId;
    });
  }

  async #fail(job: ReportExecutionRow, error: unknown) {
    const sql = useDatabase();
    const message = safeError(error);
    const code =
      error instanceof ReportAiAdapterError
        ? error.code
        : 'REPORT_GENERATION_FAILED';
    const attemptCount = job.attemptCount;
    if (attemptCount < MAX_ATTEMPTS) {
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE report_generation_executions
          SET status = 'pending', next_attempt_at = now() + interval '5 seconds',
              last_error = ${transaction.json({ code, message })},
              lease_owner = null, lease_expires_at = null, updated_at = now()
          WHERE job_id = ${job.jobId}
        `;
        await transaction`
          UPDATE jobs
          SET status = 'queued', stage = ${`报告生成失败，准备第 ${attemptCount + 1} 次尝试`},
              progress = LEAST(progress, 74), updated_at = now()
          WHERE id = ${job.jobId}
        `;
      });
      return;
    }

    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE report_generation_executions
        SET status = 'failed', completed_at = now(),
            last_error = ${transaction.json({ code, message })},
            lease_owner = null, lease_expires_at = null, updated_at = now()
        WHERE job_id = ${job.jobId}
      `;
      await transaction`
        UPDATE jobs
        SET status = 'failed', stage = '报告生成失败',
            error = ${transaction.json({ code, message })},
            completed_at = now(), updated_at = now()
        WHERE id = ${job.jobId}
      `;
    });
    await createNotification({
      link: '/report-generation',
      message: '报告生成失败，请检查输入图片后重试。',
      title: '报告生成失败',
      type: 'job',
      userId: job.createdBy,
    });
    await writeSystemAudit({
      action: 'report.generation.failed',
      details: { code, message },
      module: 'report',
      result: 'failed',
      targetId: job.jobId,
      targetType: 'job',
    });
  }

  async #generate(job: ReportExecutionRow) {
    const sql = useDatabase();
    const config = getConfig();
    const leaseSeconds =
      job.generationMode === 'ai'
        ? Math.ceil(config.reportAiTimeoutMs / 1000) + 60
        : LEASE_SECONDS;
    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE report_generation_executions
        SET status = 'running', started_at = COALESCE(started_at, now()),
            lease_expires_at = now() + ${leaseSeconds} * interval '1 second',
            updated_at = now()
        WHERE job_id = ${job.jobId}
      `;
      await transaction`
        UPDATE jobs
        SET status = 'running', progress = GREATEST(progress, 15),
            stage = ${
              job.generationMode === 'ai'
                ? '正在读取项目图片并准备 AI 报告'
                : '正在读取项目图片并编排模板报告'
            },
            started_at = COALESCE(started_at, now()), updated_at = now()
        WHERE id = ${job.jobId}
      `;
    });

    try {
      const assets = new Map<string, ReportImageAsset>();
      for (const asset of job.inputAssets) {
        assets.set(asset.id, {
          bytes: await readObject(asset.objectKey),
          filename: asset.filename,
          id: asset.id,
          mimeType: asset.mimeType,
          name: asset.name,
        });
      }
      await sql`
        UPDATE jobs
        SET progress = 45, stage = ${
          job.generationMode === 'ai'
            ? `AI 正在生成 ${job.parameters.format.toUpperCase()} 报告`
            : `正在使用平台模板生成 ${job.parameters.format.toUpperCase()} 报告`
        }, updated_at = now()
        WHERE id = ${job.jobId}
      `;
      const reportAiApiUrl = config.reportAiApiUrl ?? '';
      if (job.generationMode === 'ai' && !reportAiApiUrl) {
        throw new ReportAiAdapterError(
          'ADAPTER_NOT_CONFIGURED',
          'AI 报告生成服务尚未配置',
        );
      }
      const artifact =
        job.generationMode === 'ai'
          ? await generateAiReportArtifact({
              apiUrl: reportAiApiUrl,
              assets,
              maxOutputBytes: config.reportAiMaxOutputBytes,
              parameters: job.parameters,
              projectName: job.projectName,
              requestedBy: job.requestedBy,
              template: job.templateKey,
              timeoutMs: config.reportAiTimeoutMs,
            })
          : await renderReportArtifact({
              assets,
              createdAt: job.createdAt,
              parameters: job.parameters,
              projectName: job.projectName,
              requestedBy: job.requestedBy,
            });

      const [execution] = await sql<{ status: string }[]>`
        SELECT status FROM report_generation_executions WHERE job_id = ${job.jobId}
      `;
      if (execution?.status === 'cancel_requested') {
        await this.#cancel({ ...job, status: 'cancel_requested' });
        return;
      }

      await sql`
        UPDATE jobs
        SET progress = 75, stage = '正在保存报告到项目资产', updated_at = now()
        WHERE id = ${job.jobId}
      `;
      const stored = await storeObject(
        job.objectKey,
        artifact.mimeType,
        artifact.bytes,
      );
      const versionId = randomUUID();
      try {
        await sql.begin(async (transaction) => {
          await transaction`
            INSERT INTO assets (
              id, project_id, name, description, kind, source, source_app_key,
              source_job_id, owner_id, status, saved_at
            ) VALUES (
              ${job.outputAssetId}, ${job.projectId}, ${job.parameters.title},
              ${`由“${job.jobName}”通过${job.generationMode === 'ai' ? 'AI 服务' : '平台模板'}生成的${reportTypeLabels[job.parameters.reportType]}。`},
              ${job.parameters.format === 'md' ? 'text' : 'document'},
              'workflow', 'report-generator', ${job.jobId},
              ${job.createdBy}, 'available', now()
            )
            ON CONFLICT (id) DO NOTHING
          `;
          await transaction`
            INSERT INTO asset_versions (
              id, asset_id, version, storage_kind, object_key, original_filename,
              mime_type, size_bytes, sha256, storage_etag, status, metadata,
              created_by, completed_at
            ) VALUES (
              ${versionId}, ${job.outputAssetId}, 1, 'object', ${job.objectKey},
              ${artifact.filename}, ${artifact.mimeType}, ${artifact.bytes.byteLength},
              ${createHash('sha256').update(artifact.bytes).digest('hex')},
              ${stored.ETag?.replaceAll('"', '') ?? null}, 'available',
              ${transaction.json({
                format: job.parameters.format,
                generationMode: job.generationMode,
                imageCount: job.parameters.sections.reduce(
                  (count, section) => count + section.images.length,
                  0,
                ),
                reportType: job.parameters.reportType,
                sectionCount: job.parameters.sections.length,
                templateKey: job.templateKey,
              })},
              ${job.createdBy}, now()
            )
            ON CONFLICT (asset_id, version) DO NOTHING
          `;
          for (const tag of [
            'report',
            job.parameters.reportType,
            job.parameters.format,
            job.generationMode,
            job.templateKey,
          ]) {
            await transaction`
              INSERT INTO asset_tags (asset_id, tag)
              VALUES (${job.outputAssetId}, ${tag})
              ON CONFLICT DO NOTHING
            `;
          }
          await transaction`
            INSERT INTO job_outputs (job_id, asset_id, position)
            VALUES (${job.jobId}, ${job.outputAssetId}, 0)
            ON CONFLICT DO NOTHING
          `;
          await transaction`
            UPDATE report_generation_executions
            SET status = 'succeeded', completed_at = now(), last_error = null,
                lease_owner = null, lease_expires_at = null, updated_at = now()
            WHERE job_id = ${job.jobId}
          `;
          await transaction`
            UPDATE jobs
            SET status = 'succeeded', progress = 100, stage = '报告已生成并加入项目资产',
                completed_at = now(), updated_at = now()
            WHERE id = ${job.jobId}
          `;
        });
      } catch (error) {
        await deleteObject(job.objectKey).catch(() => undefined);
        throw error;
      }
      await createNotification({
        link: '/report-generation',
        message: `${artifact.filename} 已生成并加入当前项目资产。`,
        title: '报告生成完成',
        type: 'job',
        userId: job.createdBy,
      });
      await writeSystemAudit({
        action: 'report.generation.succeeded',
        details: {
          format: job.parameters.format,
          generationMode: job.generationMode,
          outputAssetId: job.outputAssetId,
          reportType: job.parameters.reportType,
        },
        module: 'report',
        targetId: job.jobId,
        targetType: 'job',
      });
    } catch (error) {
      await this.#fail(job, error);
    }
  }

  async #heartbeat() {
    const sql = useDatabase();
    await sql`
      INSERT INTO worker_heartbeats (instance_id, started_at, last_seen_at, metadata)
      VALUES (
        ${this.#instanceId}, now(), now(),
        ${sql.json({ pid: process.pid, role: 'report-generation' })}
      )
      ON CONFLICT (instance_id) DO UPDATE
      SET last_seen_at = now(), metadata = EXCLUDED.metadata
    `;
  }

  async #load(jobId: string) {
    const sql = useDatabase();
    const [row] = await sql<ReportExecutionRow[]>`
      SELECT
        job.id AS "jobId", job.project_id AS "projectId",
        job.name AS "jobName", job.parameters, job.created_at AS "createdAt",
        job.created_by AS "createdBy", project.name AS "projectName",
        user_account.real_name AS "requestedBy", execution.status,
        execution.attempt_count AS "attemptCount",
        execution.generation_mode AS "generationMode",
        execution.output_asset_id AS "outputAssetId",
        execution.object_key AS "objectKey",
        execution.template_key AS "templateKey",
        COALESCE((
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', asset.id, 'name', asset.name,
              'filename', version.original_filename,
              'mimeType', version.mime_type, 'objectKey', version.object_key
            ) ORDER BY input.position
          )
          FROM job_inputs input
          JOIN assets asset ON asset.id = input.asset_id
          JOIN asset_versions version
            ON version.asset_id = asset.id AND version.version = asset.current_version
          WHERE input.job_id = job.id
        ), '[]'::jsonb) AS "inputAssets"
      FROM report_generation_executions execution
      JOIN jobs job ON job.id = execution.job_id
      JOIN projects project ON project.id = job.project_id
      JOIN users user_account ON user_account.id = job.created_by
      WHERE execution.job_id = ${jobId}
    `;
    return row;
  }
}
