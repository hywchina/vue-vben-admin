import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ pinned: z.boolean() });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const projectId = getRouterParam(event, 'id');
  if (!projectId)
    throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少项目编号');
  const { pinned } = await parseBody(event, schema);
  await requireProjectAccess(identity, projectId);
  const sql = useDatabase();
  await (pinned
    ? sql`
      INSERT INTO project_user_pins (project_id, user_id)
      VALUES (${projectId}, ${identity.id})
      ON CONFLICT (project_id, user_id) DO UPDATE SET pinned_at = now()
    `
    : sql`
      DELETE FROM project_user_pins
      WHERE project_id = ${projectId} AND user_id = ${identity.id}
    `);
  await writeAudit(event, {
    action: pinned ? 'project.pin' : 'project.unpin',
    actor: identity,
    module: 'project',
    targetId: projectId,
    targetType: 'project',
  });
  return { id: projectId, pinned };
});
