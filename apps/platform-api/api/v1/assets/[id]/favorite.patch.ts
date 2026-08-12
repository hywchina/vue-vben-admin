import { getRouterParam } from 'h3';
import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ favorite: z.boolean() });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  const { favorite } = await parseBody(event, schema);
  const sql = useDatabase();
  const [asset] = await sql<{ folderId: null | string; projectId: string }[]>`
    SELECT
      project_id AS "projectId",
      folder_id AS "folderId"
    FROM assets
    WHERE id = ${assetId} AND deleted_at IS NULL
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  await requireProjectAccess(identity, asset.projectId);

  let favoriteFolderId: null | string = null;
  if (favorite) {
    favoriteFolderId = await sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO asset_folders (
          project_id, parent_id, name, kind, created_by
        )
        VALUES (${asset.projectId}, null, '收藏', 'favorites', ${identity.id})
        ON CONFLICT DO NOTHING
      `;
      const [folder] = await transaction<{ id: string }[]>`
        SELECT id
        FROM asset_folders
        WHERE project_id = ${asset.projectId}
          AND parent_id IS NULL
          AND lower(name) = lower('收藏')
          AND kind = 'favorites'
          AND deleted_at IS NULL
        LIMIT 1
      `;
      if (!folder) throw new Error('创建收藏文件夹失败');
      await transaction`
        INSERT INTO asset_favorites (asset_id, user_id)
        VALUES (${assetId}, ${identity.id})
        ON CONFLICT DO NOTHING
      `;
      return folder.id;
    });
  } else {
    await sql`
        DELETE FROM asset_favorites
        WHERE asset_id = ${assetId} AND user_id = ${identity.id}
      `;
  }

  await writeAudit(event, {
    action: favorite ? 'asset.favorite' : 'asset.unfavorite',
    actor: identity,
    details: {
      favorite,
      favoriteFolderId,
      assetFolderId: asset.folderId,
      linkedToFavoriteFolder: favorite,
      projectId: asset.projectId,
    },
    module: 'asset',
    targetId: assetId,
    targetType: 'asset',
  });
  return await getAssetView(assetId, identity.id);
});
