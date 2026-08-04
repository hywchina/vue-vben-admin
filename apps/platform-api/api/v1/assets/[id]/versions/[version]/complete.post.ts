import { getRouterParam } from 'h3';
import { completeObjectVersion } from '~/utils/asset-versions';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getRouterParam(event, 'id');
  const version = Number(getRouterParam(event, 'version'));
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new ApiError(400, 'INVALID_ASSET_VERSION', '资产版本编号无效');
  }
  return await completeObjectVersion(event, identity, assetId, version);
});
