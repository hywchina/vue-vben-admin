import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireWorkflowWorkspaceInstance } from '~/utils/domain/workflows/instances';
import { getCapabilityByAppKey } from '~/utils/domain/workflows/repository';
import { workflowTransferCompatibleAssetIndexes } from '~/utils/domain/workflows/transfers';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const createTransferSchema = z.object({
  assetId: z.string().uuid(),
  targetAppKey: z.string().trim().min(1).max(100),
  targetAssetIndex: z.number().int().min(0).max(99),
  targetInstanceId: z.string().uuid(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, createTransferSchema);
  const sql = useDatabase();

  const [asset] = await sql<
    {
      id: string;
      kind: string;
      name: string;
      projectId: string;
      savedAt: Date | null;
      sourceJobId: null | string;
    }[]
  >`
    SELECT
      id,
      kind,
      name,
      project_id AS "projectId",
      saved_at AS "savedAt",
      source_job_id AS "sourceJobId"
    FROM assets
    WHERE id = ${input.assetId}
      AND status = 'available'
      AND deleted_at IS NULL
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  await requireProjectAccess(identity, asset.projectId, 'write');
  if (!asset.savedAt) {
    throw new ApiError(
      409,
      'WORKFLOW_OUTPUT_NOT_SAVED',
      '请先将生成结果加入项目资产，再流转到其他工作流',
    );
  }

  const [application] = await sql<{ visible: boolean }[]>`
    SELECT visible
    FROM applications
    WHERE key = ${input.targetAppKey}
  `;
  if (
    !application ||
    (!application.visible && !hasAdministrativeRole(identity))
  ) {
    throw new ApiError(404, 'APPLICATION_NOT_FOUND', '目标工作流不存在');
  }
  const capability = await getCapabilityByAppKey(input.targetAppKey);
  if (!capability) {
    throw new ApiError(409, 'WORKFLOW_NOT_READY', '目标工作流尚未就绪');
  }
  const targetInstance = await requireWorkflowWorkspaceInstance({
    appKey: input.targetAppKey,
    instanceId: input.targetInstanceId,
    projectId: asset.projectId,
    userId: identity.id,
  });

  const transfer = await sql.begin(async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(
        hashtext(${input.targetInstanceId}),
        hashtext(${identity.id})
      )
    `;
    const pending = await transaction<
      {
        assetId: string;
        id: string;
        targetAssetIndex: number;
      }[]
    >`
      SELECT
        id,
        asset_id AS "assetId",
        target_asset_index AS "targetAssetIndex"
      FROM workflow_asset_transfers
      WHERE created_by = ${identity.id}
        AND project_id = ${asset.projectId}
        AND target_app_key = ${input.targetAppKey}
        AND target_instance_id = ${input.targetInstanceId}
        AND status = 'pending'
      ORDER BY created_at
      FOR UPDATE
    `;
    const existing = pending.find(
      (item) =>
        item.assetId === asset.id &&
        item.targetAssetIndex === input.targetAssetIndex,
    );
    if (existing) return { ...existing, created: false };
    if (pending.some((item) => item.assetId === asset.id)) {
      throw new ApiError(
        409,
        'WORKFLOW_ASSET_ALREADY_ASSIGNED',
        '同一资产不能同时占用目标工作流的多个输入位',
      );
    }

    const compatibleIndexes = workflowTransferCompatibleAssetIndexes(
      capability.parameterSchema,
      asset.kind,
    );
    if (!compatibleIndexes.includes(input.targetAssetIndex)) {
      throw new ApiError(
        409,
        'WORKFLOW_INPUT_INCOMPATIBLE',
        '所选目标输入位与资产类型不兼容',
      );
    }
    if (
      pending.some((item) => item.targetAssetIndex === input.targetAssetIndex)
    ) {
      throw new ApiError(
        409,
        'WORKFLOW_INPUT_SLOT_OCCUPIED',
        '所选目标输入位已有待处理资产',
      );
    }

    const [created] = await transaction<
      { id: string; targetAssetIndex: number }[]
    >`
      INSERT INTO workflow_asset_transfers (
        project_id, asset_id, source_job_id, target_app_key,
        target_asset_index, target_instance_id, created_by
      ) VALUES (
        ${asset.projectId}, ${asset.id}, ${asset.sourceJobId},
        ${input.targetAppKey}, ${input.targetAssetIndex},
        ${input.targetInstanceId}, ${identity.id}
      )
      RETURNING id, target_asset_index AS "targetAssetIndex"
    `;
    if (!created) throw new Error('创建工作流资产流转记录失败');
    return { ...created, assetId: asset.id, created: true };
  });

  if (transfer.created) {
    await writeAudit(event, {
      action: 'workflow.asset.transfer',
      actor: identity,
      details: {
        assetId: asset.id,
        sourceJobId: asset.sourceJobId,
        targetAppKey: input.targetAppKey,
        targetAssetIndex: input.targetAssetIndex,
        targetInstanceId: input.targetInstanceId,
      },
      module: 'workflow',
      targetId: transfer.id,
      targetType: 'workflow_asset_transfer',
    });
  }

  return {
    assetId: asset.id,
    assetKind: asset.kind,
    assetName: asset.name,
    id: transfer.id,
    projectId: asset.projectId,
    sourceJobId: asset.sourceJobId ?? undefined,
    targetAppKey: input.targetAppKey,
    targetAssetIndex: transfer.targetAssetIndex,
    targetInstanceId: targetInstance.id,
  };
});
