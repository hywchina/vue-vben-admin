import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { setRefreshCookie } from '~/utils/cookies';
import { useDatabase } from '~/utils/database';
import { loadIdentity } from '~/utils/identity';
import { verifyPassword } from '~/utils/password';
import { ApiError, apiHandler } from '~/utils/response';
import { createSession } from '~/utils/sessions';
import { parseBody } from '~/utils/validation';

const loginSchema = z.object({
  password: z.string().min(1),
  username: z.string().trim().min(1).max(64),
});

export default apiHandler(async (event) => {
  const { password, username } = await parseBody(event, loginSchema);
  const sql = useDatabase();
  const [user] = await sql<
    {
      failedLoginCount: number;
      id: string;
      lockedUntil: Date | null;
      passwordHash: string;
      status: string;
    }[]
  >`
    SELECT
      id,
      password_hash AS "passwordHash",
      status,
      failed_login_count AS "failedLoginCount",
      locked_until AS "lockedUntil"
    FROM users
    WHERE lower(username) = lower(${username})
  `;

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(
      429,
      'ACCOUNT_TEMPORARILY_LOCKED',
      '登录失败次数过多，请稍后再试',
    );
  }

  const passwordValid =
    user && user.status === 'enabled'
      ? await verifyPassword(password, user.passwordHash)
      : false;
  if (!user || !passwordValid) {
    if (user) {
      const nextFailureCount =
        user.lockedUntil && user.lockedUntil <= new Date()
          ? 1
          : user.failedLoginCount + 1;
      await sql`
        UPDATE users SET
          failed_login_count = ${nextFailureCount >= 5 ? 0 : nextFailureCount},
          locked_until = ${
            nextFailureCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null
          },
          updated_at = now()
        WHERE id = ${user.id}
      `;
    }
    await writeAudit(event, {
      action: 'auth.login',
      details: { username },
      module: 'identity',
      result: 'failed',
      targetId: username,
      targetType: 'user',
    });
    throw new ApiError(403, 'INVALID_CREDENTIALS', '用户名或密码错误');
  }

  const identity = await loadIdentity(user.id);
  if (!identity) {
    throw new ApiError(403, 'USER_DISABLED', '账号已停用');
  }
  event.context.identity = identity;

  const session = await createSession(event, identity);
  setRefreshCookie(event, session.refreshToken);
  await sql`
    UPDATE users SET
      last_login_at = now(),
      failed_login_count = 0,
      locked_until = NULL
    WHERE id = ${identity.id}
  `;
  await writeAudit(event, {
    action: 'auth.login',
    actor: identity,
    module: 'identity',
    targetId: identity.id,
    targetType: 'user',
  });

  return { accessToken: session.accessToken };
});
