import { useDatabase } from '~/utils/database';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

interface ProjectRow {
  assetCount: number;
  code: string;
  description: string;
  id: string;
  members: number;
  name: string;
  stage: 'archived' | 'concept' | 'delivery' | 'design';
  updatedAt: Date;
}

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const sql = useDatabase();
  const isAdmin = hasAdministrativeRole(identity);

  const items = await sql<ProjectRow[]>`
    SELECT
      p.id,
      p.code,
      p.name,
      p.description,
      p.stage,
      p.updated_at AS "updatedAt",
      count(DISTINCT pm_all.user_id)::integer AS members,
      count(DISTINCT a.id)::integer AS "assetCount"
    FROM projects p
    LEFT JOIN project_members pm_all ON pm_all.project_id = p.id
    LEFT JOIN assets a
      ON a.project_id = p.id
      AND a.deleted_at IS NULL
      AND a.saved_at IS NOT NULL
    WHERE p.archived_at IS NULL
      AND (
        ${isAdmin}
        OR EXISTS (
          SELECT 1 FROM project_members visible
          WHERE visible.project_id = p.id AND visible.user_id = ${identity.id}
        )
      )
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `;

  const [preference] = await sql<{ currentProjectId: null | string }[]>`
    SELECT current_project_id AS "currentProjectId"
    FROM user_preferences
    WHERE user_id = ${identity.id}
  `;
  const visibleCurrentProjectId = items.some(
    (project) => project.id === preference?.currentProjectId,
  )
    ? preference?.currentProjectId
    : (items[0]?.id ?? null);

  return {
    currentProjectId: visibleCurrentProjectId,
    items: items.map((project) => ({
      ...project,
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
});
