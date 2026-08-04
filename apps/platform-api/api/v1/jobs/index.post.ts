import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { createNotification } from '~/utils/notifications';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const createJobSchema = z.object({
  appKey: z.string().trim().min(1).max(100),
  inputAssetIds: z.array(z.string().uuid()).max(100).default([]),
  name: z.string().trim().min(1).max(200),
  parameters: z.record(z.string(), z.unknown()).default({}),
  projectId: z.string().uuid(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, createJobSchema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const sql = useDatabase();

  const [application] = await sql<
    { adapterConfigured: boolean; key: string }[]
  >`
    SELECT
      key,
      COALESCE((adapter_config ->> 'enabled')::boolean, false) AS "adapterConfigured"
    FROM applications
    WHERE key = ${input.appKey}
  `;
  if (!application) {
    throw new ApiError(404, 'APPLICATION_NOT_FOUND', '应用不存在');
  }

  if (input.inputAssetIds.length > 0) {
    const [count] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM assets
      WHERE id IN ${sql(input.inputAssetIds)}
        AND project_id = ${input.projectId}
        AND status = 'available'
        AND deleted_at IS NULL
    `;
    if (count?.count !== input.inputAssetIds.length) {
      throw new ApiError(
        400,
        'INVALID_JOB_ASSETS',
        '输入资产不存在或不属于当前项目',
      );
    }
  }

  const job = await sql.begin(async (transaction) => {
    const [created] = await transaction<
      {
        createdAt: Date;
        id: string;
        progress: number;
        stage: string;
        status: string;
      }[]
    >`
      INSERT INTO jobs (
        project_id, app_key, name, parameters, created_by, status, stage,
        error, completed_at
      ) VALUES (
        ${input.projectId},
        ${input.appKey},
        ${input.name},
        ${transaction.json(JSON.parse(JSON.stringify(input.parameters)))},
        ${identity.id},
        ${application.adapterConfigured ? 'queued' : 'failed'},
        ${
          application.adapterConfigured
            ? '等待外部能力适配器接收'
            : '外部能力适配器尚未配置'
        },
        ${
          application.adapterConfigured
            ? null
            : transaction.json({
                code: 'ADAPTER_NOT_CONFIGURED',
                message: '该应用尚未配置外部能力适配器',
              })
        },
        ${application.adapterConfigured ? null : new Date()}
      )
      RETURNING id, status, stage, progress, created_at AS "createdAt"
    `;
    if (!created) throw new Error('创建任务失败');

    for (const [position, assetId] of input.inputAssetIds.entries()) {
      await transaction`
        INSERT INTO job_inputs (job_id, asset_id, position)
        VALUES (${created.id}, ${assetId}, ${position})
      `;
    }
    return created;
  });

  await writeAudit(event, {
    action: 'job.create',
    actor: identity,
    details: { appKey: input.appKey },
    module: 'job',
    targetId: job.id,
    targetType: 'job',
  });
  await createNotification({
    link: '/jobs',
    message: application.adapterConfigured
      ? '任务已进入队列，后续状态由能力适配器更新。'
      : '任务记录已保存，但该应用尚未配置外部能力适配器。',
    title: application.adapterConfigured ? '任务已提交' : '任务等待能力接入',
    type: 'job',
    userId: identity.id,
  });
  return {
    ...job,
    appKey: input.appKey,
    createdAt: job.createdAt.toISOString(),
    inputAssetIds: input.inputAssetIds,
    name: input.name,
    owner: identity.realName,
    progress: job.progress,
    projectId: input.projectId,
  };
});
