import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { deleteObject } from '~/utils/storage';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');

  const sql = useDatabase();
  const rows = await sql<
    { objectKey: null | string; projectId: string; status: string }[]
  >`
    SELECT
      a.project_id AS "projectId",
      a.status,
      av.object_key AS "objectKey"
    FROM assets a
    LEFT JOIN asset_versions av ON av.asset_id = a.id
    WHERE a.id = ${assetId} AND a.deleted_at IS NULL
  `;
  const asset = rows[0];
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  await requireProjectAccess(identity, asset.projectId, 'write');

  await sql.begin(async (transaction) => {
    await transaction`
      DELETE FROM asset_favorites WHERE asset_id = ${assetId}
    `;
    await transaction`
      UPDATE assets
      SET status = 'deleted', deleted_at = now(), updated_at = now()
      WHERE id = ${assetId} AND deleted_at IS NULL
    `;
  });

  const objectKeys = [
    ...new Set(rows.flatMap((row) => (row.objectKey ? [row.objectKey] : []))),
  ];
  const cleanup = await Promise.allSettled(
    objectKeys.map((objectKey) => deleteObject(objectKey)),
  );
  const cleanupFailures = cleanup.filter(
    (result) => result.status === 'rejected',
  ).length;
  await writeAudit(event, {
    action: 'asset.delete',
    actor: identity,
    details: { cleanupFailures, objectCount: objectKeys.length },
    module: 'asset',
    targetId: assetId,
    targetType: 'asset',
  });

  return { deleted: true, id: assetId };
});
