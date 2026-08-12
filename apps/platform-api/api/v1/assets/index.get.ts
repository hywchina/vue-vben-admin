import { z } from 'zod';
import { listAssetViews } from '~/utils/asset-repository';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  folderId: z.union([z.string().uuid(), z.literal('root')]).optional(),
  ownerId: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  sortBy: z.enum(['createdAt', 'name', 'owner', 'type']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const { folderId, ownerId, projectId, sortBy, sortOrder } = parseQuery(
    event,
    querySchema,
  );
  await requireProjectAccess(identity, projectId);
  return await listAssetViews(projectId, identity.id, {
    folderId,
    ownerId,
    sortBy,
    sortOrder,
  });
});
