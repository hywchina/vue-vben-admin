import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { sendPasswordResetEmail, verifyMailTransport } from '~/utils/mail';
import {
  createPasswordResetToken,
  createPasswordResetUrl,
  hashPasswordResetToken,
  normalizeEmail,
} from '~/utils/password-reset';
import { getRequestMetadata } from '~/utils/request';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  email: z.string().trim().email('请输入有效的企业邮箱').max(254),
});

const acceptedResponse = {
  accepted: true,
  message: '如果该邮箱已登记，系统将发送密码重置邮件。',
};

export default apiHandler(async (event) => {
  const input = await parseBody(event, schema);
  const config = getConfig();
  const email = normalizeEmail(input.email);
  const metadata = getRequestMetadata(event);
  const sql = useDatabase();

  try {
    await verifyMailTransport();
  } catch {
    throw new ApiError(
      503,
      'MAIL_SERVICE_UNAVAILABLE',
      '企业邮件服务暂时不可用，请稍后重试或联系管理员',
    );
  }

  if (metadata.ip) {
    const [ipLimit] = await sql<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM password_reset_tokens
      WHERE request_ip = ${metadata.ip}
        AND created_at > now() - interval '1 hour'
    `;
    if ((ipLimit?.count ?? 0) >= 20) {
      throw new ApiError(
        429,
        'PASSWORD_RESET_RATE_LIMITED',
        '请求过于频繁，请稍后重试',
      );
    }
  }

  const [user] = await sql<{ email: string; id: string; realName: string }[]>`
    SELECT id, email, real_name AS "realName"
    FROM users
    WHERE lower(email) = ${email} AND status = 'enabled'
  `;
  if (!user) {
    await writeAudit(event, {
      action: 'auth.password-reset.request',
      details: { accountMatched: false },
      module: 'identity',
      targetId: hashPasswordResetToken(email),
      targetType: 'email-hash',
    });
    return acceptedResponse;
  }

  const [userLimit] = await sql<{ lastHour: number; lastMinute: number }[]>`
    SELECT
      count(*) FILTER (
        WHERE created_at > now() - interval '1 minute'
      )::integer AS "lastMinute",
      count(*) FILTER (
        WHERE created_at > now() - interval '1 hour'
      )::integer AS "lastHour"
    FROM password_reset_tokens
    WHERE user_id = ${user.id}
  `;
  if ((userLimit?.lastMinute ?? 0) > 0 || (userLimit?.lastHour ?? 0) >= 5) {
    return acceptedResponse;
  }

  const reset = createPasswordResetToken();
  const expiresAt = new Date(
    Date.now() + config.passwordResetTtlMinutes * 60_000,
  );
  const resetUrl = createPasswordResetUrl(config.appPublicUrl, reset.token);

  await sql.begin(async (transaction) => {
    await transaction`
      UPDATE password_reset_tokens
      SET used_at = COALESCE(used_at, now())
      WHERE user_id = ${user.id} AND used_at IS NULL
    `;
    await transaction`
      INSERT INTO password_reset_tokens (
        user_id, token_hash, expires_at, request_ip, user_agent
      ) VALUES (
        ${user.id}, ${reset.hash}, ${expiresAt}, ${metadata.ip},
        ${metadata.userAgent}
      )
    `;
  });

  try {
    await sendPasswordResetEmail({
      email: user.email,
      expiresInMinutes: config.passwordResetTtlMinutes,
      realName: user.realName,
      resetUrl,
    });
  } catch (error) {
    await sql`
      UPDATE password_reset_tokens SET used_at = now()
      WHERE token_hash = ${reset.hash}
    `;
    await writeAudit(event, {
      action: 'auth.password-reset.request',
      details: {
        deliveryCode:
          typeof error === 'object' && error && 'code' in error
            ? String(error.code)
            : 'UNKNOWN',
      },
      module: 'identity',
      result: 'failed',
      targetId: user.id,
      targetType: 'user',
    });
    return acceptedResponse;
  }

  await writeAudit(event, {
    action: 'auth.password-reset.request',
    details: { expiresAt: expiresAt.toISOString() },
    module: 'identity',
    targetId: user.id,
    targetType: 'user',
  });
  return acceptedResponse;
});
