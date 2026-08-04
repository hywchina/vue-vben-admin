import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { getConfig } from './config';

export interface AccessIdentity {
  id: string;
  roles: string[];
  username: string;
}

function secretKey() {
  return new TextEncoder().encode(getConfig().jwtSecret);
}

export async function createAccessToken(identity: AccessIdentity) {
  const config = getConfig();
  return new SignJWT({ roles: identity.roles, username: identity.username })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(identity.id)
    .setIssuedAt()
    .setJti(randomUUID())
    .setExpirationTime(`${config.accessTokenTtlSeconds}s`)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, secretKey(), {
    algorithms: ['HS256'],
  });
  if (!payload.sub || typeof payload.username !== 'string') {
    throw new Error('访问令牌缺少必要声明。');
  }
  return {
    id: payload.sub,
    roles: Array.isArray(payload.roles)
      ? payload.roles.filter((role): role is string => typeof role === 'string')
      : [],
    username: payload.username,
  } satisfies AccessIdentity;
}

export function createRefreshToken() {
  return randomBytes(48).toString('base64url');
}

export function hashRefreshToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
