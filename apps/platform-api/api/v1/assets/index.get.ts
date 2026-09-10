import { listAssetViews } from '~/utils/asset-repository';
import { assetListQuerySchema } from '~/utils/domain/assets/query';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const { projectId, ...options } = parseQuery(event, assetListQuerySchema);
  await requireProjectAccess(identity, projectId);
  return await listAssetViews(projectId, identity.id, options);
});
