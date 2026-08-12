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

const schema = z.object({
  projectRole: z.enum(['editor', 'viewer']).default('editor'),
  userPublicId: z
    .string()
    .trim()
    .regex(/^USR-\d{6}$/),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:project:write');
  const projectId = getRouterParam(event, 'id');
  if (!projectId)
    throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少项目编号');
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, projectId, 'write');
  const sql = useDatabase();
  const [project] = await sql<{ ownerId: string }[]>`
    SELECT owner_id AS "ownerId" FROM projects
    WHERE id = ${projectId} AND archived_at IS NULL
  `;
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
  if (!hasAdministrativeRole(identity) && project.ownerId !== identity.id) {
    throw new ApiError(
      403,
      'PROJECT_MEMBER_INVITE_FORBIDDEN',
      '只有项目创建者或平台管理员可以邀请成员',
    );
  }
  const [target] = await sql<{ id: string; name: string; publicId: string }[]>`
    SELECT id, public_id AS "publicId", real_name AS name
    FROM users
    WHERE public_id = ${input.userPublicId} AND status = 'enabled'
  `;
  if (!target) {
    throw new ApiError(404, 'INVITEE_NOT_FOUND', '未找到启用状态的用户 ID');
  }
  if (target.id === identity.id) {
    throw new ApiError(
      409,
      'PROJECT_SELF_INVITE_FORBIDDEN',
      '不能邀请当前账号自身',
    );
  }
  const [existing] = await sql<{ userId: string }[]>`
    SELECT user_id AS "userId" FROM project_members
    WHERE project_id = ${projectId} AND user_id = ${target.id}
  `;
  if (existing)
    throw new ApiError(409, 'PROJECT_MEMBER_EXISTS', '该用户已经是项目成员');
  await sql`
    INSERT INTO project_members (project_id, user_id, project_role)
    VALUES (${projectId}, ${target.id}, ${input.projectRole})
  `;
  await writeAudit(event, {
    action: 'project.member.invite',
    actor: identity,
    details: {
      projectRole: input.projectRole,
      userPublicId: target.publicId,
    },
    module: 'project',
    targetId: projectId,
    targetType: 'project',
  });
  return {
    name: target.name,
    projectRole: input.projectRole,
    publicId: target.publicId,
    userId: target.id,
  };
});
