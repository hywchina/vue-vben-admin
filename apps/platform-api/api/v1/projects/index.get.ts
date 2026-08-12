import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  sortBy: z.enum(['createdAt', 'name', 'updatedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

interface ProjectRow {
  activeJobCount: number;
  assetCount: number;
  code: string;
  createdAt: Date;
  description: string;
  id: string;
  isPinned: boolean;
  jobCount: number;
  members: number;
  name: string;
  ownerId: string;
  stage: 'archived' | 'concept' | 'delivery' | 'design';
  updatedAt: Date;
}

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const { sortBy, sortOrder } = parseQuery(event, querySchema);
  const sql = useDatabase();
  const isAdmin = hasAdministrativeRole(identity);

  const items = await sql<ProjectRow[]>`
    SELECT
      p.id,
      p.code,
      p.created_at AS "createdAt",
      p.name,
      p.description,
      p.owner_id AS "ownerId",
      p.stage,
      p.updated_at AS "updatedAt",
      EXISTS (
        SELECT 1 FROM project_user_pins pin
        WHERE pin.project_id = p.id AND pin.user_id = ${identity.id}
      ) AS "isPinned",
      count(DISTINCT pm_all.user_id)::integer AS members,
      count(DISTINCT a.id)::integer AS "assetCount",
      count(DISTINCT job.id)::integer AS "jobCount",
      count(DISTINCT job.id) FILTER (
        WHERE job.status IN ('queued', 'running', 'cancelling')
      )::integer AS "activeJobCount"
    FROM projects p
    LEFT JOIN project_members pm_all ON pm_all.project_id = p.id
    LEFT JOIN assets a
      ON a.project_id = p.id
      AND a.deleted_at IS NULL
      AND a.saved_at IS NOT NULL
    LEFT JOIN jobs job
      ON job.project_id = p.id
      AND job.archived_at IS NULL
    WHERE p.archived_at IS NULL
      AND (
        ${isAdmin}
        OR EXISTS (
          SELECT 1 FROM project_members visible
          WHERE visible.project_id = p.id AND visible.user_id = ${identity.id}
        )
      )
    GROUP BY p.id
    ORDER BY
      "isPinned" DESC,
      CASE WHEN ${sortBy} = 'name' AND ${sortOrder} = 'asc' THEN lower(p.name) END ASC,
      CASE WHEN ${sortBy} = 'name' AND ${sortOrder} = 'desc' THEN lower(p.name) END DESC,
      CASE WHEN ${sortBy} = 'createdAt' AND ${sortOrder} = 'asc' THEN p.created_at END ASC,
      CASE WHEN ${sortBy} = 'createdAt' AND ${sortOrder} = 'desc' THEN p.created_at END DESC,
      CASE WHEN ${sortBy} = 'updatedAt' AND ${sortOrder} = 'asc' THEN p.updated_at END ASC,
      CASE WHEN ${sortBy} = 'updatedAt' AND ${sortOrder} = 'desc' THEN p.updated_at END DESC,
      p.id
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
      canDelete: isAdmin || project.ownerId === identity.id,
      createdAt: project.createdAt.toISOString(),
      isOwner: project.ownerId === identity.id,
      updatedAt: project.updatedAt.toISOString(),
    })),
  };
});
