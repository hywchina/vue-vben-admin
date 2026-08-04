import { z } from 'zod';
import { resolveAuditVisibility } from '~/utils/audit-access';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  actorId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
  module: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const query = parseQuery(event, querySchema);
  const visibility = resolveAuditVisibility(identity, query.actorId);
  const isAdministrator = visibility.scope === 'all';
  const actorId = visibility.actorId;
  const offset = (query.page - 1) * query.limit;
  const sql = useDatabase();

  const events = await sql<
    {
      action: string;
      actorId: null | string;
      actorRoles: string[];
      createdAt: Date;
      durationMs: null | number;
      id: string;
      ip: string;
      method: null | string;
      module: string;
      operator: string;
      requestId: string;
      result: 'failed' | 'success';
      statusCode: null | number;
      target: string;
      total: number;
      username: string;
    }[]
  >`
    SELECT
      audit_event.id,
      audit_event.actor_id AS "actorId",
      COALESCE(audit_event.actor_real_name, '系统') AS operator,
      COALESCE(audit_event.actor_username, '-') AS username,
      audit_event.actor_roles AS "actorRoles",
      audit_event.action,
      audit_event.module,
      concat(audit_event.target_type, ':', audit_event.target_id) AS target,
      audit_event.result,
      audit_event.request_id AS "requestId",
      COALESCE(audit_event.ip::text, '-') AS ip,
      audit_event.http_method AS method,
      audit_event.status_code AS "statusCode",
      audit_event.duration_ms AS "durationMs",
      audit_event.created_at AS "createdAt",
      count(*) OVER()::integer AS total
    FROM audit_events audit_event
    WHERE (${isAdministrator} OR audit_event.actor_id = ${identity.id})
      AND (${actorId}::uuid IS NULL OR audit_event.actor_id = ${actorId})
      AND (${query.module ?? null}::text IS NULL
        OR audit_event.module = ${query.module ?? null})
    ORDER BY audit_event.created_at DESC
    LIMIT ${query.limit}
    OFFSET ${offset}
  `;

  return {
    items: events.map((auditEvent) => {
      const { total: _total, ...item } = auditEvent;
      let actorType: 'admin' | 'system' | 'user' = 'system';
      if (item.actorRoles.includes('admin')) actorType = 'admin';
      else if (item.actorId) actorType = 'user';
      return {
        ...item,
        actorType,
        createdAt: item.createdAt.toISOString(),
      };
    }),
    limit: query.limit,
    page: query.page,
    scope: visibility.scope,
    total: events[0]?.total ?? 0,
  };
});
