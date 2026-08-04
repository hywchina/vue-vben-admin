import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:role:read');
  const sql = useDatabase();
  return await sql<
    {
      code: string;
      description: string;
      id: string;
      name: string;
      permissionCount: number;
      scope: string;
      userCount: number;
    }[]
  >`
    SELECT
      r.id,
      r.code,
      r.name,
      r.description,
      r.scope,
      count(DISTINCT ur.user_id)::integer AS "userCount",
      count(DISTINCT rp.permission_id)::integer AS "permissionCount"
    FROM roles r
    LEFT JOIN user_roles ur ON ur.role_id = r.id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    GROUP BY r.id
    ORDER BY r.system DESC, r.created_at
  `;
});
