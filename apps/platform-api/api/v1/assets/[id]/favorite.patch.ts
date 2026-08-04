import { getRouterParam } from 'h3';
import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
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
  const [asset] = await sql<{ projectId: string }[]>`
    SELECT project_id AS "projectId" FROM assets
    WHERE id = ${assetId} AND deleted_at IS NULL
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  await requireProjectAccess(identity, asset.projectId);

  await (favorite
    ? sql`
        INSERT INTO asset_favorites (asset_id, user_id)
        VALUES (${assetId}, ${identity.id})
        ON CONFLICT DO NOTHING
      `
    : sql`
        DELETE FROM asset_favorites
        WHERE asset_id = ${assetId} AND user_id = ${identity.id}
      `);
  return await getAssetView(assetId, identity.id);
});
