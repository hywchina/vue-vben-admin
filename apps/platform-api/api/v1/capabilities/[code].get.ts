import { getRouterParam } from 'h3';
import {
  getCapabilityByCode,
  toPublicCapability,
} from '~/utils/domain/workflows/repository';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  await requireIdentity(event);
  const code = getRouterParam(event, 'code');
  if (!code) {
    throw new ApiError(400, 'CAPABILITY_CODE_REQUIRED', '缺少能力编码');
  }
  const capability = await getCapabilityByCode(code);
  if (!capability) {
    throw new ApiError(404, 'CAPABILITY_NOT_FOUND', '能力不存在或尚未发布');
  }
  return toPublicCapability(capability);
});
