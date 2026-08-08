import type { CurrentIdentity } from '../../identity';

import { useDatabase } from '../../database';
import { hasAdministrativeRole } from '../../identity';
import { ApiError } from '../../response';

export async function requireProjectAccess(
  identity: CurrentIdentity,
  projectId: string,
  mode: 'read' | 'write' = 'read',
) {
  const sql = useDatabase();
  if (hasAdministrativeRole(identity)) {
    const [project] = await sql<{ id: string }[]>`
      SELECT id FROM projects WHERE id = ${projectId} AND archived_at IS NULL
    `;
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
    return { projectId, projectRole: 'admin' };
  }

  const [membership] = await sql<{ projectRole: string }[]>`
    SELECT pm.project_role AS "projectRole"
    FROM project_members pm
    JOIN projects p ON p.id = pm.project_id
    WHERE pm.project_id = ${projectId}
      AND pm.user_id = ${identity.id}
      AND p.archived_at IS NULL
  `;
  if (!membership) {
    throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在或无权访问');
  }
  if (mode === 'write' && membership.projectRole === 'viewer') {
    throw new ApiError(403, 'PROJECT_READ_ONLY', '当前项目仅有查看权限');
  }
  return { projectId, projectRole: membership.projectRole };
}
