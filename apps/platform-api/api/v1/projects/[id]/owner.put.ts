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

const schema = z.object({
  userPublicId: z
    .string()
    .trim()
    .regex(/^USR-\d{6}$/),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:project:write');
  const projectId = getRouterParam(event, 'id');
  if (!projectId) {
    throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少项目编号');
  }
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, projectId, 'write');
  const sql = useDatabase();
  const transferred = await sql.begin(async (transaction) => {
    const [project] = await transaction<
      { name: string; ownerId: string; ownerPublicId: string }[]
    >`
      SELECT
        project.name,
        project.owner_id AS "ownerId",
        owner_account.public_id AS "ownerPublicId"
      FROM projects project
      JOIN users owner_account ON owner_account.id = project.owner_id
      WHERE project.id = ${projectId} AND project.archived_at IS NULL
      FOR UPDATE OF project
    `;
    if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
    if (!hasAdministrativeRole(identity) && project.ownerId !== identity.id) {
      throw new ApiError(
        403,
        'PROJECT_OWNER_TRANSFER_FORBIDDEN',
        '只有当前项目负责人或平台管理员可以转移负责人',
      );
    }
    const [target] = await transaction<
      { name: string; publicId: string; status: string; userId: string }[]
    >`
      SELECT
        member.user_id AS "userId",
        user_account.public_id AS "publicId",
        user_account.real_name AS name,
        user_account.status
      FROM project_members member
      JOIN users user_account ON user_account.id = member.user_id
      WHERE member.project_id = ${projectId}
        AND user_account.public_id = ${input.userPublicId}
      FOR UPDATE OF member
    `;
    if (!target) {
      throw new ApiError(
        404,
        'PROJECT_OWNER_TARGET_NOT_MEMBER',
        '新负责人必须先加入当前项目',
      );
    }
    if (target.status !== 'enabled') {
      throw new ApiError(
        409,
        'PROJECT_OWNER_TARGET_DISABLED',
        '停用状态的账号不能成为项目负责人',
      );
    }
    if (target.userId === project.ownerId) {
      throw new ApiError(
        409,
        'PROJECT_OWNER_UNCHANGED',
        '该用户已经是项目负责人',
      );
    }
    await transaction`
      UPDATE project_members
      SET project_role = 'editor'
      WHERE project_id = ${projectId} AND user_id = ${project.ownerId}
    `;
    await transaction`
      UPDATE project_members
      SET project_role = 'owner'
      WHERE project_id = ${projectId} AND user_id = ${target.userId}
    `;
    await transaction`
      UPDATE projects
      SET owner_id = ${target.userId}, updated_at = now()
      WHERE id = ${projectId}
    `;
    return {
      ...target,
      previousOwnerId: project.ownerId,
      previousOwnerPublicId: project.ownerPublicId,
      projectName: project.name,
    };
  });

  await Promise.all([
    createNotification({
      link: '/projects',
      message: `你已成为项目“${transferred.projectName}”的负责人。`,
      preference: 'accountMessage',
      title: '项目负责人已转移',
      type: 'project',
      userId: transferred.userId,
    }),
    createNotification({
      link: '/projects',
      message: `项目“${transferred.projectName}”的负责人已转移给 ${transferred.name}。`,
      preference: 'accountMessage',
      title: '项目负责人已转移',
      type: 'project',
      userId: transferred.previousOwnerId,
    }),
  ]).catch((error) => console.warn('创建负责人转移通知失败', error));
  await writeAudit(event, {
    action: 'project.owner.transfer',
    actor: identity,
    details: {
      from: transferred.previousOwnerPublicId,
      to: transferred.publicId,
    },
    module: 'project',
    targetId: projectId,
    targetType: 'project',
  });
  return {
    id: projectId,
    name: transferred.name,
    ownerId: transferred.userId,
    ownerPublicId: transferred.publicId,
  };
});
