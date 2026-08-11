import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  appKey: z.string().trim().min(1).max(100).optional(),
  projectId: z.string().uuid(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = parseQuery(event, querySchema);
  await requireProjectAccess(identity, input.projectId);
  const sql = useDatabase();
  const instances = await sql<
    {
      appKey: string;
      createdAt: Date;
      id: string;
      lastOpenedAt: Date;
      projectId: string;
      title: string;
      updatedAt: Date;
    }[]
  >`
    SELECT
      instance.id,
      instance.project_id AS "projectId",
      instance.app_key AS "appKey",
      instance.title,
      instance.created_at AS "createdAt",
      instance.updated_at AS "updatedAt",
      instance.last_opened_at AS "lastOpenedAt"
    FROM workflow_workspace_instances instance
    JOIN applications application ON application.key = instance.app_key
    WHERE instance.user_id = ${identity.id}
      AND instance.project_id = ${input.projectId}
      AND (${input.appKey ?? null}::text IS NULL OR instance.app_key = ${
        input.appKey ?? null
      })
    ORDER BY instance.last_opened_at DESC, instance.created_at DESC
  `;
  return instances.map((instance) => ({
    ...instance,
    createdAt: instance.createdAt.toISOString(),
    lastOpenedAt: instance.lastOpenedAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
  }));
});
