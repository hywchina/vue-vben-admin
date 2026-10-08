import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { isUserPublicId } from '~/utils/identity/business-ids';
import { createNotification } from '~/utils/notifications';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:project:write');
  const projectId = getRouterParam(event, 'id');
  const userPublicId = getRouterParam(event, 'userPublicId')
    ?.trim()
    .toUpperCase();
  if (!projectId) {
    throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少项目编号');
  }
  if (!userPublicId || !isUserPublicId(userPublicId)) {
    throw new ApiError(
      400,
      'PROJECT_MEMBER_ID_INVALID',
      '成员用户 ID 格式不正确',
    );
  }
  await requireProjectAccess(identity, projectId, 'write');
  const sql = useDatabase();
  const removed = await sql.begin(async (transaction) => {
    const [project] = await transaction<{ name: string; ownerId: string }[]>`
      SELECT name, owner_id AS "ownerId"
      FROM projects
      WHERE id = ${projectId} AND archived_at IS NULL
      FOR UPDATE
    `;
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
    if (!hasAdministrativeRole(identity) && project.ownerId !== identity.id) {
      throw new ApiError(
        403,
        'PROJECT_MEMBER_REMOVE_FORBIDDEN',
        '只有项目创建者或平台管理员可以移除成员',
      );
    }
    const [member] = await transaction<
      { name: string; projectRole: string; publicId: string; userId: string }[]
    >`
      SELECT
        member.user_id AS "userId",
        member.project_role AS "projectRole",
        user_account.public_id AS "publicId",
        user_account.real_name AS name
      FROM project_members member
      JOIN users user_account ON user_account.id = member.user_id
      WHERE member.project_id = ${projectId}
        AND (user_account.public_id = ${userPublicId} OR user_account.id IN (SELECT entity_id FROM business_id_aliases WHERE entity_type = 'USR' AND legacy_id = ${userPublicId}))
      FOR UPDATE OF member
    `;
    if (!member) {
      throw new ApiError(404, 'PROJECT_MEMBER_NOT_FOUND', '该用户不是项目成员');
    }
    if (member.projectRole === 'owner' || member.userId === project.ownerId) {
      throw new ApiError(
        409,
        'PROJECT_OWNER_REMOVE_FORBIDDEN',
        '项目创建者不能从项目中移除',
      );
    }
    await transaction`
      DELETE FROM project_members
      WHERE project_id = ${projectId} AND user_id = ${member.userId}
    `;
    await transaction`
      DELETE FROM project_user_pins
      WHERE project_id = ${projectId} AND user_id = ${member.userId}
    `;
    await transaction`
      UPDATE user_preferences
      SET current_project_id = null, updated_at = now()
      WHERE user_id = ${member.userId} AND current_project_id = ${projectId}
    `;
    return { ...member, projectName: project.name };
  });
  await createNotification({
    link: '/projects',
    message: `你已被移出项目“${removed.projectName}”；已有业务记录仍会保留。`,
    preference: 'accountMessage',
    title: '项目成员关系已变更',
    type: 'project',
    userId: removed.userId,
  }).catch((error) => console.warn('创建项目移除通知失败', error));
  await writeAudit(event, {
    action: 'project.member.remove',
    actor: identity,
    details: {
      projectRole: removed.projectRole,
      userPublicId: removed.publicId,
    },
    module: 'project',
    targetId: projectId,
    targetType: 'project',
  });
  return {
    name: removed.name,
    projectId,
    removed: true as const,
    userPublicId: removed.publicId,
  };
});
