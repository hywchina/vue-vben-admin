import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
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
  oldPassword: z.string().min(1, '请输入当前密码').max(128),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = await parseBody(event, schema);
  const sql = useDatabase();
  const [user] = await sql<{ passwordHash: string }[]>`
    SELECT password_hash AS "passwordHash"
    FROM users
    WHERE id = ${identity.id} AND status = 'enabled'
  `;

  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
  if (!(await verifyPassword(input.oldPassword, user.passwordHash))) {
    throw new ApiError(400, 'CURRENT_PASSWORD_INVALID', '当前密码不正确');
  }
  if (await verifyPassword(input.newPassword, user.passwordHash)) {
    throw new ApiError(400, 'PASSWORD_UNCHANGED', '新密码不能与当前密码相同');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await sql.begin(async (transaction) => {
    await transaction`
      UPDATE users SET
        password_hash = ${passwordHash},
        password_changed_at = now(),
        updated_at = now()
      WHERE id = ${identity.id}
    `;
    await transaction`
      UPDATE refresh_sessions
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE user_id = ${identity.id}
    `;
  });

  await writeAudit(event, {
    action: 'user.password.update',
    actor: identity,
    module: 'identity',
    targetId: identity.id,
    targetType: 'user',
  });
  return { changed: true };
});
