import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ status: z.enum(['disabled', 'enabled']) });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:user:write');
  const userId = getRouterParam(event, 'id');
  if (!userId) throw new ApiError(400, 'USER_ID_REQUIRED', '缺少用户编号');
  if (userId === identity.id) {
    throw new ApiError(
      400,
      'CANNOT_DISABLE_SELF',
      '不能修改当前登录账号的状态',
    );
  }
  const { status } = await parseBody(event, schema);
  const sql = useDatabase();
  const [target] = await sql<
    { currentStatus: string; roleCodes: null | string[] }[]
  >`
    SELECT
      u.status AS "currentStatus",
      COALESCE(array_agg(r.code)
        FILTER (WHERE r.code IS NOT NULL), '{}') AS "roleCodes"
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    WHERE u.id = ${userId}
    GROUP BY u.id
  `;
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  if (
    status === 'disabled' &&
    target.currentStatus === 'enabled' &&
    target.roleCodes?.includes('admin')
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
  const [updated] = await sql<{ id: string }[]>`
    UPDATE users SET status = ${status}, updated_at = now()
    WHERE id = ${userId}
    RETURNING id
  `;
  if (!updated) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');

  if (status === 'disabled') {
    await sql`
      UPDATE refresh_sessions
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE user_id = ${userId}
    `;
  }
  await writeAudit(event, {
    action: 'user.status.update',
    actor: identity,
    details: { status },
    module: 'identity',
    targetId: userId,
    targetType: 'user',
  });
  return { id: userId, status };
});
