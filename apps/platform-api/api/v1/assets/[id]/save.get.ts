import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { useDatabase } from '~/utils/database';
import {
  applyAssetSaveJobContext,
  getAssetSaveScope,
} from '~/utils/domain/assets/category';
import { requireAssetContentAccess } from '~/utils/domain/assets/content-access';
import { getUuidParam } from '~/utils/http/resource-id';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getUuidParam(event);
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  const { jobId } = parseQuery(
    event,
    z.object({ jobId: z.string().uuid().optional() }),
  );
  const sql = useDatabase();
  const asset = await getAssetSaveScope(sql, assetId);
  await requireProjectAccess(identity, asset.projectId, 'write');
  await requireAssetContentAccess(assetId, identity.id);
  await applyAssetSaveJobContext(sql, asset, assetId, identity.id, jobId);
  const view = await getAssetView(assetId, identity.id);
  if (!view) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  return { ...view, generationCategory: asset.generationCategory ?? undefined };
});
