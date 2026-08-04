import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { hashPassword, verifyPassword } from '~/utils/password';
import { hashPasswordResetToken } from '~/utils/password-reset';
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
  token: z.string().min(32).max(256),
});

export default apiHandler(async (event) => {
  const input = await parseBody(event, schema);
  const tokenHash = hashPasswordResetToken(input.token);
  const sql = useDatabase();
  const [record] = await sql<
    { id: string; passwordHash: string; userId: string }[]
  >`
    SELECT
      prt.id,
      prt.user_id AS "userId",
      u.password_hash AS "passwordHash"
    FROM password_reset_tokens prt
    JOIN users u ON u.id = prt.user_id
    WHERE prt.token_hash = ${tokenHash}
      AND prt.used_at IS NULL
      AND prt.expires_at > now()
      AND u.status = 'enabled'
  `;
  if (!record) {
    throw new ApiError(
      400,
      'PASSWORD_RESET_TOKEN_INVALID',
      '密码重置链接无效或已过期，请重新申请',
    );
  }
  if (await verifyPassword(input.newPassword, record.passwordHash)) {
    throw new ApiError(400, 'PASSWORD_UNCHANGED', '新密码不能与当前密码相同');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await sql.begin(async (transaction) => {
    const [consumed] = await transaction<{ userId: string }[]>`
      UPDATE password_reset_tokens
      SET used_at = now()
      WHERE id = ${record.id}
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id AS "userId"
    `;
    if (!consumed) {
      throw new ApiError(
        400,
        'PASSWORD_RESET_TOKEN_INVALID',
        '密码重置链接无效或已过期，请重新申请',
      );
    }

    const [updated] = await transaction<{ id: string }[]>`
      UPDATE users SET
        password_hash = ${passwordHash},
        password_changed_at = now(),
        updated_at = now()
      WHERE id = ${record.userId} AND status = 'enabled'
      RETURNING id
    `;
    if (!updated) {
      throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在或已停用');
    }
    await transaction`
      UPDATE refresh_sessions
      SET revoked_at = COALESCE(revoked_at, now())
      WHERE user_id = ${record.userId}
    `;
    await transaction`
      UPDATE password_reset_tokens
      SET used_at = COALESCE(used_at, now())
      WHERE user_id = ${record.userId}
    `;
  });

  await writeAudit(event, {
    action: 'auth.password-reset.confirm',
    module: 'identity',
    targetId: record.userId,
    targetType: 'user',
  });
  return { changed: true };
});
