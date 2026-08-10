import { getRouterParam } from 'h3';
import { useDatabase } from '~/utils/database';
import {
  getCapabilityByCode,
  toPublicCapability,
} from '~/utils/domain/workflows/repository';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const code = getRouterParam(event, 'code');
  if (!code) {
    throw new ApiError(400, 'CAPABILITY_CODE_REQUIRED', '缺少能力编码');
  }
  const capability = await getCapabilityByCode(code);
  if (!capability) {
    throw new ApiError(404, 'CAPABILITY_NOT_FOUND', '能力不存在或尚未发布');
  }
  if (!hasAdministrativeRole(identity)) {
    const sql = useDatabase();
    const [application] = await sql<{ visible: boolean }[]>`
      SELECT visible FROM applications WHERE key = ${capability.appKey}
    `;
    if (!application?.visible) {
      throw new ApiError(404, 'CAPABILITY_NOT_FOUND', '能力不存在或尚未发布');
    }
  }
  return toPublicCapability(capability);
});
