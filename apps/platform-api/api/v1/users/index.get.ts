import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:user:read');
  const sql = useDatabase();
  const users = await sql<
    {
      department: string;
      email: string;
      id: string;
      lastActive: Date;
      name: string;
      projectCount: number;
      roleCodes: null | string[];
      roles: null | string[];
      status: 'disabled' | 'enabled';
      username: string;
    }[]
  >`
    SELECT
      u.id,
      u.username,
      u.real_name AS name,
      u.department,
      COALESCE(u.email, '') AS email,
      u.status,
      COALESCE(u.last_login_at, u.created_at) AS "lastActive",
      count(DISTINCT pm.project_id)::integer AS "projectCount",
      COALESCE(array_agg(DISTINCT r.name)
        FILTER (WHERE r.name IS NOT NULL), '{}') AS roles,
      COALESCE(array_agg(DISTINCT r.code)
        FILTER (WHERE r.code IS NOT NULL), '{}') AS "roleCodes"
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN project_members pm ON pm.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `;

  return users.map((user) => ({
    ...user,
    lastActive: user.lastActive.toISOString(),
    roleCodes: user.roleCodes ?? [],
    roles: user.roles ?? [],
  }));
});
