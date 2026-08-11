import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const createInstanceSchema = z.object({
  appKey: z.string().trim().min(1).max(100),
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(120).optional(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, createInstanceSchema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const sql = useDatabase();
  const [application] = await sql<{ name: string; visible: boolean }[]>`
    SELECT name, visible
    FROM applications
    WHERE key = ${input.appKey}
  `;
  if (
    !application ||
    (!application.visible && !hasAdministrativeRole(identity))
  ) {
    throw new ApiError(404, 'APPLICATION_NOT_FOUND', '应用不存在');
  }

  const instance = await sql.begin(async (transaction) => {
    await transaction`
      SELECT pg_advisory_xact_lock(
        hashtextextended(${`${identity.id}:${input.projectId}:${input.appKey}:instance`}, 0)
      )
    `;
    const [{ count = 0 } = {}] = await transaction<{ count: number }[]>`
      SELECT count(*)::integer AS count
      FROM workflow_workspace_instances
      WHERE user_id = ${identity.id}
        AND project_id = ${input.projectId}
        AND app_key = ${input.appKey}
    `;
    const title = input.title ?? `${application.name} · 会话 ${count + 1}`;
    const [created] = await transaction<
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
      INSERT INTO workflow_workspace_instances (
        user_id, project_id, app_key, title
      ) VALUES (
        ${identity.id}, ${input.projectId}, ${input.appKey}, ${title}
      )
      RETURNING
        id,
        project_id AS "projectId",
        app_key AS "appKey",
        title,
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        last_opened_at AS "lastOpenedAt"
    `;
    if (!created) throw new Error('创建应用会话失败');
    return created;
  });

  await writeAudit(event, {
    action: 'workflow.instance.create',
    actor: identity,
    details: { appKey: instance.appKey, projectId: instance.projectId },
    module: 'workflow',
    targetId: instance.id,
    targetType: 'workflow_workspace_instance',
  });
  return {
    ...instance,
    createdAt: instance.createdAt.toISOString(),
    lastOpenedAt: instance.lastOpenedAt.toISOString(),
    updatedAt: instance.updatedAt.toISOString(),
  };
});
