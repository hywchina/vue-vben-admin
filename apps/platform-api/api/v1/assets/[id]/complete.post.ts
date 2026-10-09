import { completeObjectVersion } from '~/utils/asset-versions';
import { getUuidParam } from '~/utils/http/resource-id';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getUuidParam(event);
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  return await completeObjectVersion(event, identity, assetId, 1);
});
