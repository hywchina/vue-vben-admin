import { randomUUID } from 'node:crypto';

import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { createLoraTrainingSchema } from '~/utils/domain/capabilities/lora/parameters';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { createNotification } from '~/utils/notifications';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, createLoraTrainingSchema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const config = getConfig();
  if (!config.loraApiUrl) {
    throw new ApiError(
      503,
      'ADAPTER_NOT_CONFIGURED',
      'LoRA 训练适配器尚未配置',
    );
  }

  const sql = useDatabase();
  const assetIds = input.items.map((item) => item.assetId);
  const assets = await sql<
    { id: string; objectKey: string; sizeBytes: number }[]
  >`
    SELECT
      asset.id,
      version.object_key AS "objectKey",
      version.size_bytes::float8 AS "sizeBytes"
    FROM assets asset
    JOIN asset_versions version
      ON version.asset_id = asset.id AND version.version = asset.current_version
    WHERE asset.id = ANY(${assetIds}::uuid[])
      AND asset.project_id = ${input.projectId}
      AND asset.kind = 'image'
      AND asset.status = 'available'
      AND asset.saved_at IS NOT NULL
      AND asset.deleted_at IS NULL
      AND version.status = 'available'
      AND version.storage_kind = 'object'
  `;
  if (assets.length !== assetIds.length) {
    throw new ApiError(
      400,
      'LORA_DATASET_ASSET_INVALID',
      '训练图片不存在、未加入资产或不属于当前项目',
    );
  }
  const datasetBytes = assets.reduce((sum, asset) => sum + asset.sizeBytes, 0);
  if (datasetBytes > config.loraMaxDatasetBytes) {
    throw new ApiError(
      413,
      'LORA_DATASET_TOO_LARGE',
      `训练数据集超过平台限制 ${config.loraMaxDatasetBytes} 字节`,
    );
  }

  const jobId = randomUUID();
  const datasetName = `rail_${jobId.replaceAll('-', '')}`;
  const parameters = {
    ...input.parameters,
    datasetItems: input.items,
    model: input.parameters.baseModel,
    totalSteps: input.parameters.steps,
  };
  const created = await sql.begin(async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${identity.id}:${input.projectId}:lora-training`}, 0)
      )
    `;
    let [instance] = await transaction<{ id: string }[]>`
      SELECT id
      FROM workflow_workspace_instances
      WHERE user_id = ${identity.id}
        AND project_id = ${input.projectId}
        AND app_key = 'lora-training'
      ORDER BY created_at
      LIMIT 1
    `;
    if (!instance) {
      [instance] = await transaction<{ id: string }[]>`
        INSERT INTO workflow_workspace_instances (
          user_id, project_id, app_key, title
        ) VALUES (
          ${identity.id}, ${input.projectId}, 'lora-training', 'LoRA 训练'
        )
        RETURNING id
      `;
    }
    if (!instance) throw new Error('创建 LoRA 训练会话失败');
    const [job] = await transaction<
      { createdAt: Date; id: string; publicId: string }[]
    >`
      INSERT INTO jobs (
        id, project_id, app_key, name, status, stage, parameters,
        created_by, workspace_instance_id
      ) VALUES (
        ${jobId}, ${input.projectId}, 'lora-training', ${input.name},
        'queued', '等待 LoRA Worker 准备训练数据集',
        ${transaction.json(parameters)}, ${identity.id}, ${instance.id}
      )
      RETURNING id, public_id AS "publicId", created_at AS "createdAt"
    `;
    if (!job) throw new Error('创建 LoRA 任务失败');
    for (const [position, assetId] of assetIds.entries()) {
      await transaction`
        INSERT INTO job_inputs (job_id, asset_id, position)
        VALUES (${job.id}, ${assetId}, ${position})
      `;
    }
    await transaction`
      INSERT INTO lora_training_executions (
        job_id, dataset_name, gpu_ids
      ) VALUES (${job.id}, ${datasetName}, ${config.loraGpuIds})
    `;
    return job;
  });

  await writeAudit(event, {
    action: 'lora.training.create',
    actor: identity,
    details: {
      datasetBytes,
      imageCount: input.items.length,
      model: input.parameters.baseModel,
      projectId: input.projectId,
      totalSteps: parameters.totalSteps,
    },
    module: 'training',
    targetId: created.id,
    targetType: 'job',
  });
  await createNotification({
    link: '/model-training',
    message: '训练任务已进入平台队列，LoRA Worker 将准备数据并提交 GPU 队列。',
    title: 'LoRA 训练已提交',
    type: 'job',
    userId: identity.id,
  });
  return {
    appKey: 'lora-training',
    createdAt: created.createdAt.toISOString(),
    id: created.id,
    name: input.name,
    progress: 0,
    publicId: created.publicId,
    stage: '等待 LoRA Worker 准备训练数据集',
    status: 'queued',
  };
});
