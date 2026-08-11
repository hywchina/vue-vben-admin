import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { CAPABILITY_ADAPTER_NOT_CONFIGURED } from '~/utils/domain/capabilities/adapter';
import { requireDesignConversation } from '~/utils/domain/design-conversations';
import { requireWorkflowWorkspaceInstance } from '~/utils/domain/workflows/instances';
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

const createJobSchema = z
  .object({
    appKey: z.string().trim().min(1).max(100),
    designConversationId: z.string().uuid().optional(),
    inputAssetIds: z.array(z.string().uuid()).max(100).default([]),
    inputTransferIds: z.array(z.string().uuid()).max(100).default([]),
    name: z.string().trim().min(1).max(200),
    parameters: z.record(z.string(), z.unknown()).default({}),
    projectId: z.string().uuid(),
    workspaceInstanceId: z.string().uuid().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.designConversationId) !==
      Boolean(value.workspaceInstanceId),
    '任务必须且只能属于一个设计会话或管理员调试实例',
  );

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, createJobSchema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const sql = useDatabase();
  const designConversation = input.designConversationId
    ? await requireDesignConversation({
        conversationId: input.designConversationId,
        projectId: input.projectId,
        userId: identity.id,
      })
    : undefined;
  const workspaceInstance = input.workspaceInstanceId
    ? await requireWorkflowWorkspaceInstance({
        appKey: input.appKey,
        instanceId: input.workspaceInstanceId,
        projectId: input.projectId,
        userId: identity.id,
      })
    : undefined;

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
    const executionContextId =
      input.designConversationId ?? input.workspaceInstanceId;
    if (!executionContextId) throw new Error('任务缺少执行上下文');
    const workspaceLockKey = executionContextId;
    await transaction`
      SELECT pg_advisory_xact_lock(hashtextextended(${workspaceLockKey}, 0))
    `;
    const [activeJob] = await transaction<{ id: string }[]>`
      SELECT id
      FROM jobs
      WHERE created_by = ${identity.id}
        AND (
          (${input.designConversationId ?? null}::uuid IS NOT NULL
            AND design_conversation_id = ${input.designConversationId ?? null})
          OR
          (${input.workspaceInstanceId ?? null}::uuid IS NOT NULL
            AND workspace_instance_id = ${input.workspaceInstanceId ?? null})
        )
        AND status IN ('queued', 'running', 'cancelling')
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (activeJob) {
      throw new ApiError(
        409,
        input.designConversationId
          ? 'DESIGN_CONVERSATION_JOB_ACTIVE'
          : 'WORKSPACE_INSTANCE_JOB_ACTIVE',
        input.designConversationId
          ? '当前设计会话已有进行中的任务，请等待完成或取消后再运行'
          : '当前调试实例已有进行中的任务，请等待完成或取消后再运行',
      );
    }
    if (
      new Set(input.inputTransferIds).size !== input.inputTransferIds.length
    ) {
      throw new ApiError(
        400,
        'INVALID_WORKFLOW_TRANSFERS',
        '工作流流转记录不能重复提交',
      );
    }
    if (input.inputTransferIds.length > 0 && !input.workspaceInstanceId) {
      throw new ApiError(
        400,
        'INVALID_WORKFLOW_TRANSFERS',
        '项目设计会话直接使用已登记资产，不接受旧应用实例流转记录',
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
              AND target_instance_id = ${input.workspaceInstanceId ?? null}
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
        error, completed_at, workflow_version_id, workspace_instance_id,
        design_conversation_id
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
        ${capability?.workflowVersionId ?? null},
        ${input.workspaceInstanceId ?? null},
        ${input.designConversationId ?? null}
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
    if (input.designConversationId) {
      await transaction`
        UPDATE design_conversations
        SET updated_at = now()
        WHERE id = ${input.designConversationId}
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
      designConversationId: input.designConversationId,
      workspaceInstanceId: input.workspaceInstanceId,
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
    inputs: orderedInputAssets.map((asset, position) => ({
      assetId: asset.id,
      kind: asset.kind,
      mimeType: '',
      name: '',
      position,
    })),
    name: input.name,
    ownedByCurrentUser: true,
    owner: identity.realName,
    outputs: [],
    parameters: input.parameters,
    progress: job.progress,
    projectId: input.projectId,
    createdBy: identity.id,
    designConversationId: designConversation?.id,
    designConversationTitle: designConversation?.title,
    workspaceInstanceId: workspaceInstance?.id,
    workspaceInstanceTitle: workspaceInstance?.title,
  };
});
