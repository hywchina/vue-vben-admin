import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { createNotification } from '~/utils/notifications';
import { hashPassword, verifyPassword } from '~/utils/password';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  newPassword: z
    .string()
    .min(8, '密码至少需要 8 个字符')
    .max(128)
    .regex(/[A-Za-z]/, '密码必须包含字母')
    .regex(/\d/, '密码必须包含数字')
    .regex(/[^\dA-Za-z]/, '密码必须包含符号'),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:user:write');
  const userId = getRouterParam(event, 'id');
  if (!userId) throw new ApiError(400, 'USER_ID_REQUIRED', '缺少用户编号');
  if (userId === identity.id) {
    throw new ApiError(
      400,
      'CANNOT_RESET_OWN_PASSWORD',
      '请在个人中心使用当前密码修改自己的密码',
    );
  }
  const input = await parseBody(event, schema);
  const sql = useDatabase();
  const [target] = await sql<
    { passwordHash: string; publicId: string; status: string }[]
  >`
    SELECT
      password_hash AS "passwordHash", public_id AS "publicId", status
    FROM users
    WHERE id = ${userId}
  `;
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  if (await verifyPassword(input.newPassword, target.passwordHash)) {
    throw new ApiError(400, 'PASSWORD_UNCHANGED', '新密码不能与当前密码相同');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await sql.begin(async (transaction) => {
    await transaction`
      UPDATE users SET
        password_hash = ${passwordHash},
        password_changed_at = now(),
        updated_at = now()
      WHERE id = ${userId}
    `;
    await transaction`
      UPDATE refresh_sessions
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE user_id = ${userId}
    `;
    await transaction`
      UPDATE password_reset_tokens
      SET used_at = COALESCE(used_at, now())
      WHERE user_id = ${userId} AND used_at IS NULL
    `;
  });

  if (target.status === 'enabled') {
    await createNotification({
      message: `管理员 ${identity.realName} 已重置你的登录密码，请使用新密码重新登录。`,
      preference: 'systemMessage',
      title: '登录密码已重置',
      type: 'account',
      userId,
    }).catch((error) => console.warn('创建密码重置通知失败', error));
  }
  await writeAudit(event, {
    action: 'user.password.reset',
    actor: identity,
    details: { publicId: target.publicId },
    module: 'identity',
    targetId: userId,
    targetType: 'user',
  });
  return { changed: true, id: userId };
});
