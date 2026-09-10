import { useDatabase } from '~/utils/database';
import {
  workbenchQuerySchema,
  workbenchSections,
} from '~/utils/domain/workbench/query';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const query = parseQuery(event, workbenchQuerySchema);
  const sql = useDatabase();
  const rows = await sql.unsafe<
    Array<{ item: Array<Record<string, unknown>>; total: number }>
  >(
    `WITH visible_projects AS (
      SELECT p.*, ($2 OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id
        AND m.user_id = $1 AND m.project_role IN ('owner', 'editor'))) AS "canWrite"
      FROM projects p WHERE p.archived_at IS NULL AND ($2 OR EXISTS (
        SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $1
      ))
    ), records AS (${workbenchSections[query.section]}),
    page AS (SELECT * FROM records ORDER BY "updatedAt" DESC, id DESC LIMIT $4 OFFSET $5)
    SELECT (SELECT count(*)::int FROM records) AS total,
      (SELECT jsonb_agg(to_jsonb(page) ORDER BY "updatedAt" DESC, id DESC) FROM page) AS item
    WHERE $3::boolean IS NOT NULL`,
    [
      identity.id,
      hasAdministrativeRole(identity),
      query.activeOnly === 'true',
      query.pageSize,
      (query.page - 1) * query.pageSize,
    ],
  );
  return { items: rows[0]?.item ?? [], total: rows[0]?.total ?? 0 };
});
