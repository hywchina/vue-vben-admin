import { getRouterParam } from 'h3';
import { getAssetView } from '~/utils/asset-repository';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');

  const sql = useDatabase();
  const [asset] = await sql<
    {
      projectId: string;
      savedAt: Date | null;
      source: string;
      status: string;
    }[]
  >`
    SELECT
      project_id AS "projectId",
      saved_at AS "savedAt",
      source,
      status
    FROM assets
    WHERE id = ${assetId} AND deleted_at IS NULL
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '生成结果不存在');
  await requireProjectAccess(identity, asset.projectId, 'write');
  if (asset.source !== 'workflow' || asset.status !== 'available') {
    throw new ApiError(
      409,
      'WORKFLOW_OUTPUT_NOT_READY',
      '当前记录不是可加入资产的工作流结果',
    );
  }

  if (!asset.savedAt) {
    await sql`
      UPDATE assets
      SET
        saved_at = now(),
        description = regexp_replace(
          description,
          '，等待用户确认是否保存到资产中心。$',
          '，已由用户保存到资产中心。'
        ),
        updated_at = now()
      WHERE id = ${assetId} AND deleted_at IS NULL
    `;
    await writeAudit(event, {
      action: 'asset.workflow-output.save',
      actor: identity,
      details: { source: asset.source },
      module: 'asset',
      targetId: assetId,
      targetType: 'asset',
    });
  }

  return await getAssetView(assetId, identity.id);
});
