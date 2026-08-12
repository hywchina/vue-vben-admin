import { getRouterParam } from 'h3';
import { getAssetView } from '~/utils/asset-repository';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');

  const sql = useDatabase();
  const [asset] = await sql<{ projectId: string }[]>`
    SELECT project_id AS "projectId"
    FROM assets
    WHERE id = ${assetId} AND deleted_at IS NULL AND saved_at IS NOT NULL
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  await requireProjectAccess(identity, asset.projectId);

  const view = await getAssetView(assetId, identity.id);
  if (!view) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  return view;
});
