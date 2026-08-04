import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { PLATFORM_ROLE_CODES } from '~/utils/roles';
import { parseBody } from '~/utils/validation';

const roleCode = z.enum(PLATFORM_ROLE_CODES);
const schema = z.object({
  roles: z.array(roleCode).length(1, '每个用户必须且只能分配一个角色'),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:role:write');
  const userId = getRouterParam(event, 'id');
  if (!userId) throw new ApiError(400, 'USER_ID_REQUIRED', '缺少用户编号');
  if (userId === identity.id) {
    throw new ApiError(
      400,
      'CANNOT_CHANGE_OWN_ROLES',
      '不能修改当前登录账号自身的角色',
    );
  }

  const input = await parseBody(event, schema);
  const nextRoleCodes = [...new Set(input.roles)].toSorted();
  const sql = useDatabase();
  const [target] = await sql<{ roleCodes: null | string[]; status: string }[]>`
    SELECT
      u.status,
      COALESCE(array_agg(r.code)
        FILTER (WHERE r.code IS NOT NULL), '{}') AS "roleCodes"
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.id = ${userId}
    GROUP BY u.id
  `;
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');

  const currentRoleCodes = target.roleCodes ?? [];
  if (
    target.status === 'enabled' &&
    currentRoleCodes.includes('admin') &&
    !nextRoleCodes.includes('admin')
  ) {
    const [adminCount] = await sql<{ count: number }[]>`
      SELECT count(DISTINCT u.id)::integer AS count
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.code = 'admin' AND u.status = 'enabled'
    `;
    if ((adminCount?.count ?? 0) <= 1) {
      throw new ApiError(
        409,
        'LAST_ADMIN_REQUIRED',
        '平台必须至少保留一名可用的管理员',
      );
    }
  }

  await sql.begin(async (transaction) => {
    await transaction`DELETE FROM user_roles WHERE user_id = ${userId}`;
    await transaction`
      INSERT INTO user_roles (user_id, role_id)
      SELECT ${userId}, id
      FROM roles
      WHERE code = ANY(${nextRoleCodes})
    `;
  });

  const [updated] = await sql<
    { roleCodes: null | string[]; roles: null | string[] }[]
  >`
    SELECT
      COALESCE(array_agg(r.code ORDER BY r.code), '{}') AS "roleCodes",
      COALESCE(array_agg(r.name ORDER BY r.code), '{}') AS roles
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}
  `;

  await writeAudit(event, {
    action: 'user.roles.update',
    actor: identity,
    details: {
      from: currentRoleCodes,
      to: nextRoleCodes,
    },
    module: 'identity',
    targetId: userId,
    targetType: 'user',
  });
  return {
    id: userId,
    roleCodes: updated?.roleCodes ?? [],
    roles: updated?.roles ?? [],
  };
});
