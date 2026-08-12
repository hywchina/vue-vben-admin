import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:project:write');
  const projectId = getRouterParam(event, 'id');
  if (!projectId) {
    throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少项目编号');
  }
  await requireProjectAccess(identity, projectId, 'write');
  const sql = useDatabase();
  const result = await sql.begin(async (transaction) => {
    const [project] = await transaction<
      { code: string; name: string; ownerId: string }[]
    >`
      SELECT code, name, owner_id AS "ownerId"
      FROM projects
      WHERE id = ${projectId} AND archived_at IS NULL
      FOR UPDATE
    `;
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
    if (!hasAdministrativeRole(identity) && project.ownerId !== identity.id) {
      throw new ApiError(
        403,
        'PROJECT_DELETE_FORBIDDEN',
        '只有项目创建者或平台管理员可以删除项目',
      );
    }
    const [activeJob] = await transaction<{ id: string }[]>`
      SELECT id FROM jobs
      WHERE project_id = ${projectId}
        AND status IN ('queued', 'running', 'cancelling')
      LIMIT 1
    `;
    if (activeJob) {
      throw new ApiError(
        409,
        'PROJECT_ACTIVE_JOB_EXISTS',
        '项目仍有运行中的任务，请先取消或等待任务完成',
      );
    }
    await transaction`
      UPDATE projects
      SET
        stage = 'archived',
        archived_at = now(),
        archived_by = ${identity.id},
        updated_at = now()
      WHERE id = ${projectId} AND archived_at IS NULL
    `;
    await transaction`
      DELETE FROM project_user_pins WHERE project_id = ${projectId}
    `;
    await transaction`
      UPDATE user_preferences
      SET current_project_id = null, updated_at = now()
      WHERE current_project_id = ${projectId}
    `;
    return project;
  });
  await writeAudit(event, {
    action: 'project.archive',
    actor: identity,
    details: { code: result.code, name: result.name },
    module: 'project',
    targetId: projectId,
    targetType: 'project',
  });
  return { archived: true, id: projectId };
});
