import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z
  .object({
    description: z.string().trim().max(2000).optional(),
    name: z.string().trim().min(1).max(160).optional(),
  })
  .refine(
    (input) => input.name !== undefined || input.description !== undefined,
    {
      message: '至少需要修改一个项目字段',
    },
  );

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:project:write');
  const projectId = getRouterParam(event, 'id');
  if (!projectId)
    throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少项目编号');
  const input = await parseBody(event, schema);
  const access = await requireProjectAccess(identity, projectId, 'write');
  if (!hasAdministrativeRole(identity) && access.projectRole !== 'owner') {
    throw new ApiError(
      403,
      'PROJECT_OWNER_REQUIRED',
      '只有项目负责人可以修改项目信息',
    );
  }
  const sql = useDatabase();
  const [project] = await sql<{ description: string; name: string }[]>`
    SELECT name, description FROM projects WHERE id = ${projectId} AND archived_at IS NULL
  `;
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
  await sql`
    UPDATE projects SET
      name = COALESCE(${input.name ?? null}, name),
      description = COALESCE(${input.description ?? null}, description),
      updated_at = now()
    WHERE id = ${projectId} AND archived_at IS NULL
  `;
  await writeAudit(event, {
    action: 'project.update',
    actor: identity,
    details: {
      after: {
        description: input.description ?? project.description,
        name: input.name ?? project.name,
      },
      before: project,
    },
    module: 'project',
    targetId: projectId,
    targetType: 'project',
  });
  return {
    description: input.description ?? project.description,
    id: projectId,
    name: input.name ?? project.name,
  };
});
