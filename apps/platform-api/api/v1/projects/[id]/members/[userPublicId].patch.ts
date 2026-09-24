import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { createNotification } from '~/utils/notifications';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ projectRole: z.enum(['editor', 'viewer']) });

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
  if (!userPublicId || !/^USR-\d{6}$/.test(userPublicId)) {
    throw new ApiError(
      400,
      'PROJECT_MEMBER_ID_INVALID',
      '成员用户 ID 格式不正确',
    );
  }
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, projectId, 'write');
  const sql = useDatabase();
  const updated = await sql.begin(async (transaction) => {
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
        'PROJECT_MEMBER_ROLE_FORBIDDEN',
        '只有项目创建者或平台管理员可以调整成员角色',
      );
    }
    const [member] = await transaction<
      {
        name: string;
        projectRole: string;
        publicId: string;
        userId: string;
      }[]
    >`
      SELECT
        member.user_id AS "userId",
        member.project_role AS "projectRole",
        user_account.public_id AS "publicId",
        user_account.real_name AS name
      FROM project_members member
      JOIN users user_account ON user_account.id = member.user_id
      WHERE member.project_id = ${projectId}
        AND user_account.public_id = ${userPublicId}
      FOR UPDATE OF member
    `;
    if (!member) {
      throw new ApiError(404, 'PROJECT_MEMBER_NOT_FOUND', '该用户不是项目成员');
    }
    if (member.projectRole === 'owner' || member.userId === project.ownerId) {
      throw new ApiError(
        409,
        'PROJECT_OWNER_ROLE_IMMUTABLE',
        '项目负责人必须通过负责人转移功能变更',
      );
    }
    await transaction`
      UPDATE project_members
      SET project_role = ${input.projectRole}
      WHERE project_id = ${projectId} AND user_id = ${member.userId}
    `;
    return {
      ...member,
      nextRole: input.projectRole,
      projectName: project.name,
    };
  });

  await createNotification({
    link: '/projects',
    message: `你在项目“${updated.projectName}”中的角色已调整为${
      updated.nextRole === 'editor' ? '编辑成员' : '只读成员'
    }。`,
    preference: 'accountMessage',
    title: '项目成员角色已更新',
    type: 'project',
    userId: updated.userId,
  }).catch((error) => console.warn('创建项目角色通知失败', error));
  await writeAudit(event, {
    action: 'project.member.role.update',
    actor: identity,
    details: {
      from: updated.projectRole,
      to: updated.nextRole,
      userPublicId: updated.publicId,
    },
    module: 'project',
    targetId: projectId,
    targetType: 'project',
  });
  return {
    name: updated.name,
    projectRole: updated.nextRole,
    publicId: updated.publicId,
    userId: updated.userId,
  };
});
