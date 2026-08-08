import { getConfig } from '~/utils/config';
import { listWorkflowManagement } from '~/utils/domain/workflows/repository';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:workflow:read');
  const result = await listWorkflowManagement();
  const adapterConfigured = Boolean(getConfig().comfyuiApiUrl);
  return {
    ...result,
    capabilities: result.capabilities.map((capability) => ({
      ...capability,
      ready: capability.ready && adapterConfigured,
    })),
  };
});
