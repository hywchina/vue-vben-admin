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
  const folderId = getRouterParam(event, 'id');
  if (!folderId)
    throw new ApiError(400, 'ASSET_FOLDER_ID_REQUIRED', '缺少文件夹编号');
  const sql = useDatabase();
  const [folder] = await sql<
    { kind: 'favorites' | 'normal'; name: string; projectId: string }[]
  >`
    SELECT name, kind, project_id AS "projectId"
    FROM asset_folders
    WHERE id = ${folderId} AND deleted_at IS NULL
  `;
  if (!folder)
    throw new ApiError(404, 'ASSET_FOLDER_NOT_FOUND', '文件夹不存在');
  await requireProjectAccess(identity, folder.projectId, 'write');
  if (folder.kind === 'favorites') {
    throw new ApiError(
      400,
      'ASSET_FAVORITES_FOLDER_READ_ONLY',
      '收藏文件夹不能删除',
    );
  }
  const assets = await sql<Array<{ id: string; objectKey: null | string }>>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM asset_folders WHERE id = ${folderId} AND deleted_at IS NULL
      UNION ALL
      SELECT child.id
      FROM asset_folders child
      JOIN descendants parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT asset.id, version.object_key AS "objectKey"
    FROM assets asset
    JOIN descendants ON descendants.id = asset.folder_id
    LEFT JOIN asset_versions version ON version.asset_id = asset.id
    WHERE asset.deleted_at IS NULL
  `;
  const assetIds = [...new Set(assets.map((asset) => asset.id))];
  const folderCount = await sql.begin(async (transaction) => {
    if (assetIds.length > 0) {
      await transaction`DELETE FROM asset_favorites WHERE asset_id IN ${transaction(assetIds)}`;
      await transaction`
        UPDATE assets SET status = 'deleted', deleted_at = now(), updated_at = now()
        WHERE id IN ${transaction(assetIds)} AND deleted_at IS NULL
      `;
    }
    const updated = await transaction<{ id: string }[]>`
      WITH RECURSIVE descendants AS (
        SELECT id FROM asset_folders WHERE id = ${folderId} AND deleted_at IS NULL
        UNION ALL
        SELECT child.id FROM asset_folders child
        JOIN descendants parent ON child.parent_id = parent.id
        WHERE child.deleted_at IS NULL
      )
      UPDATE asset_folders SET deleted_at = now(), updated_at = now()
      WHERE id IN (SELECT id FROM descendants)
      RETURNING id
    `;
    return updated.length;
  });
  const objectKeys = [
    ...new Set(
      assets.flatMap((asset) => (asset.objectKey ? [asset.objectKey] : [])),
    ),
  ];
  const cleanup = await Promise.allSettled(
    objectKeys.map((objectKey) => deleteObject(objectKey)),
  );
  const cleanupFailures = cleanup.filter(
    (result) => result.status === 'rejected',
  ).length;
  await writeAudit(event, {
    action: 'asset.folder.delete',
    actor: identity,
    details: {
      assetCount: assetIds.length,
      cleanupFailures,
      folderCount,
      name: folder.name,
    },
    module: 'asset',
    targetId: folderId,
    targetType: 'asset_folder',
  });
  return {
    assetCount: assetIds.length,
    deleted: true,
    folderCount,
    id: folderId,
  };
});
