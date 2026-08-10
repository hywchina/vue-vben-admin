import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { CAPABILITY_ADAPTER_NOT_CONFIGURED } from '~/utils/domain/capabilities/adapter';
import { getCapabilityByAppKey } from '~/utils/domain/workflows/repository';
import {
  materializeWorkflow,
  validateWorkflowAssetInputs,
  workflowValidationErrorMessage,
} from '~/utils/domain/workflows/schema';
import { assertWorkflowTransferSelections } from '~/utils/domain/workflows/transfers';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { createNotification } from '~/utils/notifications';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const createJobSchema = z.object({
  appKey: z.string().trim().min(1).max(100),
  inputAssetIds: z.array(z.string().uuid()).max(100).default([]),
  inputTransferIds: z.array(z.string().uuid()).max(100).default([]),
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
    { adapterConfigured: boolean; key: string; visible: boolean }[]
  >`
    SELECT
      key,
      visible,
      COALESCE((adapter_config ->> 'enabled')::boolean, false) AS "adapterConfigured"
    FROM applications
    WHERE key = ${input.appKey}
  `;
  if (!application) {
    throw new ApiError(404, 'APPLICATION_NOT_FOUND', '应用不存在');
  }
  if (!application.visible && !hasAdministrativeRole(identity)) {
    throw new ApiError(404, 'APPLICATION_NOT_FOUND', '应用不存在');
  }

  const capability = await getCapabilityByAppKey(input.appKey);
  if (capability) {
    try {
      materializeWorkflow(
        capability.apiJson,
        capability.parameterSchema,
        input.parameters,
      );
    } catch (error) {
      throw new ApiError(
        400,
        'WORKFLOW_PARAMETER_INVALID',
        workflowValidationErrorMessage(error),
      );
    }
  }
  const adapterConfigured = capability
    ? Boolean(getConfig().comfyuiApiUrl)
    : application.adapterConfigured;
  let initialStage = '外部能力适配器尚未配置';
  let notificationMessage = '任务记录已保存，但该应用尚未配置外部能力适配器。';
  if (adapterConfigured) {
    initialStage = '等待外部能力适配器接收';
    notificationMessage = '任务已进入队列，后续状态由能力适配器更新。';
  }
  if (adapterConfigured && capability) {
    initialStage = '等待 ComfyUI Worker 接收';
    notificationMessage = '任务已进入持久化队列，将由 ComfyUI Worker 执行。';
  }

  const orderedInputAssets: Array<{ id: string; kind: string }> = [];
  if (input.inputAssetIds.length > 0) {
    if (new Set(input.inputAssetIds).size !== input.inputAssetIds.length) {
      throw new ApiError(
        400,
        'INVALID_JOB_ASSETS',
        '同一资产不能重复占用多个输入位置',
      );
    }
    const rows = await sql<{ id: string; kind: string }[]>`
      SELECT id, kind
      FROM assets
      WHERE id IN ${sql(input.inputAssetIds)}
        AND project_id = ${input.projectId}
        AND status = 'available'
        AND saved_at IS NOT NULL
        AND deleted_at IS NULL
    `;
    const byId = new Map(rows.map((asset) => [asset.id, asset]));
    for (const assetId of input.inputAssetIds) {
      const asset = byId.get(assetId);
      if (asset) orderedInputAssets.push(asset);
    }
    if (orderedInputAssets.length !== input.inputAssetIds.length) {
      throw new ApiError(
        400,
        'INVALID_JOB_ASSETS',
        '输入资产不存在、未加入资产或不属于当前项目',
      );
    }
  }
  if (capability) {
    try {
      validateWorkflowAssetInputs(
        capability.parameterSchema,
        orderedInputAssets,
      );
    } catch (error) {
      throw new ApiError(
        400,
        'WORKFLOW_ASSET_INVALID',
        workflowValidationErrorMessage(error, '工作流输入资产无效'),
      );
    }
  }

  const job = await sql.begin(async (transaction) => {
    if (
      new Set(input.inputTransferIds).size !== input.inputTransferIds.length
    ) {
      throw new ApiError(
        400,
        'INVALID_WORKFLOW_TRANSFERS',
        '工作流流转记录不能重复提交',
      );
    }
    const transfers =
      input.inputTransferIds.length === 0
        ? []
        : await transaction<
            { assetId: string; id: string; targetAssetIndex: number }[]
          >`
            SELECT
              id,
              asset_id AS "assetId",
              target_asset_index AS "targetAssetIndex"
            FROM workflow_asset_transfers
            WHERE id IN ${transaction(input.inputTransferIds)}
              AND created_by = ${identity.id}
              AND project_id = ${input.projectId}
              AND target_app_key = ${input.appKey}
              AND status = 'pending'
            FOR UPDATE
          `;
    if (transfers.length !== input.inputTransferIds.length) {
      throw new ApiError(
        400,
        'INVALID_WORKFLOW_TRANSFERS',
        '工作流流转记录不存在、已消费或不属于当前用户',
      );
    }
    try {
      assertWorkflowTransferSelections(transfers, input.inputAssetIds);
    } catch (error) {
      throw new ApiError(
        400,
        'INVALID_WORKFLOW_TRANSFERS',
        error instanceof Error ? error.message : '工作流流转记录无效',
      );
    }

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
        error, completed_at, workflow_version_id
      ) VALUES (
        ${input.projectId},
        ${input.appKey},
        ${input.name},
        ${transaction.json(JSON.parse(JSON.stringify(input.parameters)))},
        ${identity.id},
        ${adapterConfigured ? 'queued' : 'failed'},
        ${initialStage},
        ${
          adapterConfigured
            ? null
            : transaction.json({
                code: CAPABILITY_ADAPTER_NOT_CONFIGURED,
                message: '该应用尚未配置外部能力适配器',
              })
        },
        ${adapterConfigured ? null : new Date()},
        ${capability?.workflowVersionId ?? null}
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
    if (adapterConfigured && capability) {
      await transaction`
        INSERT INTO job_executions (
          job_id, provider, workflow_version_id, status
        ) VALUES (
          ${created.id}, 'comfyui', ${capability.workflowVersionId}, 'pending'
        )
      `;
    }
    if (input.inputTransferIds.length > 0) {
      await transaction`
        UPDATE workflow_asset_transfers
        SET
          status = 'consumed',
          consumed_by_job_id = ${created.id},
          consumed_at = now(),
          updated_at = now()
        WHERE id IN ${transaction(input.inputTransferIds)}
      `;
    }
    return created;
  });

  await writeAudit(event, {
    action: 'job.create',
    actor: identity,
    details: {
      appKey: input.appKey,
      capabilityCode: capability?.code,
      inputTransferCount: input.inputTransferIds.length,
      workflowVersion: capability?.workflowVersion,
    },
    module: 'job',
    targetId: job.id,
    targetType: 'job',
  });
  await createNotification({
    link: '/jobs',
    message: notificationMessage,
    title: adapterConfigured ? '任务已提交' : '任务等待能力接入',
    type: 'job',
    userId: identity.id,
  });
  return {
    ...job,
    appKey: input.appKey,
    capabilityCode: capability?.code,
    createdAt: job.createdAt.toISOString(),
    error: adapterConfigured
      ? null
      : {
          code: CAPABILITY_ADAPTER_NOT_CONFIGURED,
          message: '该应用尚未配置外部能力适配器',
        },
    inputAssetIds: input.inputAssetIds,
    name: input.name,
    owner: identity.realName,
    progress: job.progress,
    projectId: input.projectId,
  };
});
