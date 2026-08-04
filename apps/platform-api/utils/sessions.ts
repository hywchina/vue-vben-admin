import type { H3Event } from 'h3';

import type { CurrentIdentity } from './identity';

import { getConfig } from './config';
import { useDatabase } from './database';
import { getRequestMetadata } from './request';
import {
  createAccessToken,
  createRefreshToken,
  hashRefreshToken,
} from './tokens';

function sessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setUTCDate(
    expiresAt.getUTCDate() + getConfig().refreshTokenTtlDays,
  );
  return expiresAt;
}

export async function createSession(event: H3Event, identity: CurrentIdentity) {
  const sql = useDatabase();
  const metadata = getRequestMetadata(event);
  const refreshToken = createRefreshToken();
  await sql`
    INSERT INTO refresh_sessions (
      user_id, token_hash, expires_at, created_ip, last_used_ip, user_agent
    ) VALUES (
      ${identity.id},
      ${hashRefreshToken(refreshToken)},
      ${sessionExpiry()},
      ${metadata.ip},
      ${metadata.ip},
      ${metadata.userAgent}
    )
  `;

  return {
    accessToken: await createAccessToken(identity),
    refreshToken,
  };
}

export async function rotateSession(event: H3Event, currentToken: string) {
  const sql = useDatabase();
  const metadata = getRequestMetadata(event);
  const nextToken = createRefreshToken();

  const result = await sql.begin(async (transaction) => {
    const [session] = await transaction<
      { id: string; userId: string; userStatus: string }[]
    >`
      SELECT
        s.id,
        s.user_id AS "userId",
        u.status AS "userStatus"
      FROM refresh_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${hashRefreshToken(currentToken)}
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
      FOR UPDATE
    `;
    if (!session || session.userStatus !== 'enabled') return null;

    const [nextSession] = await transaction<{ id: string }[]>`
      INSERT INTO refresh_sessions (
        user_id, token_hash, expires_at, created_ip, last_used_ip, user_agent
      ) VALUES (
        ${session.userId},
        ${hashRefreshToken(nextToken)},
        ${sessionExpiry()},
        ${metadata.ip},
        ${metadata.ip},
        ${metadata.userAgent}
      )
      RETURNING id
    `;
    if (!nextSession) return null;

    await transaction`
      UPDATE refresh_sessions
      SET
        revoked_at = now(),
        replaced_by = ${nextSession.id},
        last_used_at = now(),
        last_used_ip = ${metadata.ip}
      WHERE id = ${session.id}
    `;
    return { refreshToken: nextToken, userId: session.userId };
  });

  return result;
}

export async function revokeSession(token: string) {
  const sql = useDatabase();
  const [session] = await sql<{ userId: string }[]>`
    UPDATE refresh_sessions
    SET revoked_at = COALESCE(revoked_at, now()), last_used_at = now()
    WHERE token_hash = ${hashRefreshToken(token)}
    RETURNING user_id AS "userId"
  `;
  return session?.userId ?? null;
}
