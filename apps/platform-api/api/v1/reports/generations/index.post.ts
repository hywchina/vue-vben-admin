import { randomUUID } from 'node:crypto';

import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  createReportSchema,
  orderedReportAssetIds,
  REPORT_APPLICATION_KEY,
  REPORT_SUPPORTED_IMAGE_MIME_TYPES,
} from '~/utils/domain/capabilities/report/schema';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { getConfig } from '~/utils/infrastructure/config';
import { createNotification } from '~/utils/notifications';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const MAX_INPUT_BYTES = 100 * 1024 * 1024;

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, createReportSchema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const config = getConfig();
  if (input.generationMode === 'ai' && !config.reportAiApiUrl) {
    throw new ApiError(
      503,
      'ADAPTER_NOT_CONFIGURED',
      'AI 报告生成服务尚未配置',
    );
  }
  const executionTemplateKey =
    input.generationMode === 'ai' ? config.reportAiTemplate : input.templateKey;

  const sql = useDatabase();
  const assetIds = orderedReportAssetIds(input);
  const assets =
    assetIds.length > 0
      ? await sql<{ id: string; mimeType: string; sizeBytes: number }[]>`
        SELECT
          asset.id,
          version.mime_type AS "mimeType",
          version.size_bytes::float8 AS "sizeBytes"
        FROM assets asset
        JOIN asset_versions version
          ON version.asset_id = asset.id AND version.version = asset.current_version
        WHERE asset.id IN ${sql(assetIds)}
          AND asset.project_id = ${input.projectId}
          AND asset.kind = 'image'
          AND asset.status = 'available'
          AND asset.saved_at IS NOT NULL
          AND asset.deleted_at IS NULL
          AND version.status = 'available'
          AND version.storage_kind = 'object'
      `
      : [];
  if (assets.length !== assetIds.length) {
    throw new ApiError(
      400,
      'REPORT_IMAGE_ASSET_INVALID',
      '报告图片不存在、未加入资产或不属于当前项目',
    );
  }
  if (
    assets.some(
      (asset) =>
        !REPORT_SUPPORTED_IMAGE_MIME_TYPES.includes(
          asset.mimeType as (typeof REPORT_SUPPORTED_IMAGE_MIME_TYPES)[number],
        ),
    )
  ) {
    throw new ApiError(
      400,
      'REPORT_IMAGE_FORMAT_UNSUPPORTED',
      '报告当前仅支持 PNG 和 JPEG 图片',
    );
  }
  const inputBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
  if (inputBytes > MAX_INPUT_BYTES) {
    throw new ApiError(
      413,
      'REPORT_INPUT_TOO_LARGE',
      '报告图片总大小超过 100 MiB',
    );
  }

  const jobId = randomUUID();
  const outputAssetId = randomUUID();
  const outputVersionId = randomUUID();
  const objectKey = `${input.projectId}/${outputAssetId}/v1/${outputVersionId}.${input.format}`;
  const imageCount = input.sections.reduce(
    (count, section) => count + section.images.length,
    0,
  );

  const created = await sql.begin(async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${identity.id}:${input.projectId}:${REPORT_APPLICATION_KEY}`}, 0)
      )
    `;
    let [instance] = await transaction<{ id: string }[]>`
      SELECT id
      FROM workflow_workspace_instances
      WHERE user_id = ${identity.id}
        AND project_id = ${input.projectId}
        AND app_key = ${REPORT_APPLICATION_KEY}
      ORDER BY created_at
      LIMIT 1
    `;
    if (!instance) {
      [instance] = await transaction<{ id: string }[]>`
        INSERT INTO workflow_workspace_instances (
          user_id, project_id, app_key, title
        ) VALUES (
          ${identity.id}, ${input.projectId}, ${REPORT_APPLICATION_KEY}, '报告生成'
        )
        RETURNING id
      `;
    }
    if (!instance) throw new Error('创建报告生成工作区失败');
    const [job] = await transaction<
      { createdAt: Date; id: string; publicId: string }[]
    >`
      INSERT INTO jobs (
        id, project_id, app_key, name, status, progress, stage, parameters,
        created_by, workspace_instance_id
      ) VALUES (
        ${jobId}, ${input.projectId}, ${REPORT_APPLICATION_KEY}, ${input.name},
        'queued', 0, ${
          input.generationMode === 'ai'
            ? '等待 AI 报告 Worker 接收'
            : '等待模板报告 Worker 接收'
        },
        ${transaction.json(input)}, ${identity.id}, ${instance.id}
      )
      RETURNING id, public_id AS "publicId", created_at AS "createdAt"
    `;
    if (!job) throw new Error('创建报告生成任务失败');
    for (const [position, assetId] of assetIds.entries()) {
      await transaction`
        INSERT INTO job_inputs (job_id, asset_id, position)
        VALUES (${job.id}, ${assetId}, ${position})
      `;
    }
    await transaction`
      INSERT INTO report_generation_executions (
        job_id, output_format, template_key, generation_mode,
        output_asset_id, object_key
      ) VALUES (
        ${job.id}, ${input.format}, ${executionTemplateKey}, ${input.generationMode},
        ${outputAssetId}, ${objectKey}
      )
    `;
    return job;
  });

  await writeAudit(event, {
    action: 'report.generation.create',
    actor: identity,
    details: {
      format: input.format,
      generationMode: input.generationMode,
      imageCount,
      inputBytes,
      projectId: input.projectId,
      reportType: input.reportType,
      sectionCount: input.sections.length,
      templateKey: executionTemplateKey,
    },
    module: 'report',
    targetId: created.id,
    targetType: 'job',
  });
  await createNotification({
    link: '/report-generation',
    message: `${input.generationMode === 'ai' ? 'AI' : '模板'}报告任务已进入队列，将生成 ${input.format.toUpperCase()} 报告。`,
    title: '报告生成已提交',
    type: 'job',
    userId: identity.id,
  });
  return {
    appKey: REPORT_APPLICATION_KEY,
    createdAt: created.createdAt.toISOString(),
    id: created.id,
    name: input.name,
    progress: 0,
    publicId: created.publicId,
    stage:
      input.generationMode === 'ai'
        ? '等待 AI 报告 Worker 接收'
        : '等待模板报告 Worker 接收',
    status: 'queued',
  };
});
