import { randomUUID } from 'node:crypto';

import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { loadReportImages } from '~/utils/domain/capabilities/report/inputs';
import {
  createReportSchema,
  orderedReportAssetIds,
  REPORT_APPLICATION_KEY,
  reportMimeType,
} from '~/utils/domain/capabilities/report/schema';
import { validateTemplateInput } from '~/utils/domain/capabilities/report/templates/renderer';
import { snapshotReportTemplate } from '~/utils/domain/capabilities/report/templates/repository';
import { getStarterTemplate } from '~/utils/domain/capabilities/report/templates/starters';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { getConfig } from '~/utils/infrastructure/config';
import { createNotification } from '~/utils/notifications';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { storeObject } from '~/utils/storage';
import { parseBody } from '~/utils/validation';

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
  let templateSnapshot = await snapshotReportTemplate(identity, input);
  if (!templateSnapshot && input.format !== 'md') {
    let starterKind: 'bid' | 'contract' | 'patent' | 'report' = 'report';
    if (input.reportType === 'contract') starterKind = 'contract';
    else if (input.reportType === 'patent-disclosure') starterKind = 'patent';
    else if (input.reportType === 'bid-response') starterKind = 'bid';
    const starter = await getStarterTemplate(input.format, starterKind);
    const objectKey = `${input.projectId}/report-templates/builtin/${starter.snapshot.sha256}.${input.format}`;
    await storeObject(objectKey, reportMimeType(input.format), starter.source);
    templateSnapshot = {
      ...starter.snapshot,
      projectId: input.projectId,
      objectKey,
    };
  }
  if (templateSnapshot) validateTemplateInput(templateSnapshot, input);
  let executionTemplateKey =
    input.generationMode === 'ai' ? config.reportAiTemplate : input.templateKey;
  if (templateSnapshot)
    executionTemplateKey = `uploaded:${templateSnapshot.id}:r${templateSnapshot.revision}`;

  const sql = useDatabase();
  const assetIds = orderedReportAssetIds(input);
  const assets = await loadReportImages(identity, assetIds);
  const inputBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);

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
        output_asset_id, object_key, template_snapshot
      ) VALUES (
        ${job.id}, ${input.format}, ${executionTemplateKey}, ${input.generationMode},
        ${outputAssetId}, ${objectKey}, ${templateSnapshot ? transaction.json(JSON.parse(JSON.stringify(templateSnapshot))) : null}
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
