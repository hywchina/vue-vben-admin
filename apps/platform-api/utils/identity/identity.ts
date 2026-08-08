import type { H3Event } from 'h3';

import { getHeader } from 'h3';

import { ApiError } from '../http/response';
import { useDatabase } from '../infrastructure/database';
import { hasAdministratorRole } from './roles';
import { verifyAccessToken } from './tokens';

export interface CurrentIdentity {
  department: string;
  email: string;
  homePath: string;
  id: string;
  introduction: string;
  permissions: string[];
  realName: string;
  roles: string[];
  username: string;
}

interface IdentityRow {
  department: string;
  email: null | string;
  id: string;
  introduction: string;
  permissions: null | string[];
  realName: string;
  roles: null | string[];
  status: string;
  username: string;
}

export async function loadIdentity(userId: string) {
  const sql = useDatabase();
  const [row] = await sql<IdentityRow[]>`
    SELECT
      u.id,
      u.username,
      u.real_name AS "realName",
      u.department,
      u.email,
      u.introduction,
      u.status,
      COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
      COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE u.id = ${userId}
    GROUP BY u.id
  `;

  if (!row || row.status !== 'enabled') return null;
  return {
    department: row.department,
    email: row.email ?? '',
    homePath: '/workspace/overview',
    id: row.id,
    introduction: row.introduction,
    permissions: row.permissions ?? [],
    realName: row.realName,
    roles: row.roles ?? [],
    username: row.username,
  } satisfies CurrentIdentity;
}

export async function requireIdentity(event: H3Event) {
  const authorization = getHeader(event, 'authorization');
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : undefined;
  if (!token) {
    throw new ApiError(401, 'UNAUTHORIZED', '登录状态已失效，请重新登录');
  }

  try {
    const claims = await verifyAccessToken(token);
    const identity = await loadIdentity(claims.id);
    if (!identity) throw new Error('用户不存在或已停用');
    event.context.identity = identity;
    return identity;
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', '登录状态已失效，请重新登录');
  }
}

export function hasAdministrativeRole(identity: CurrentIdentity) {
  return hasAdministratorRole(identity.roles);
}

export function requirePermission(
  identity: CurrentIdentity,
  permission: string,
) {
  if (!identity.permissions.includes(permission)) {
    throw new ApiError(403, 'FORBIDDEN', '没有执行该操作的权限');
  }
}
