import type { H3Event } from 'h3';

import type { CurrentIdentity } from './identity';

import { useDatabase } from './database';
import { getRequestMetadata } from './request';

export interface AuditInput {
  action: string;
  actor?: CurrentIdentity | null;
  details?: Record<string, unknown>;
  durationMs?: number;
  httpMethod?: string;
  module: string;
  requestPath?: string;
  result?: 'failed' | 'success';
  statusCode?: number;
  targetId: string;
  targetType: string;
}

export async function writeAudit(event: H3Event, input: AuditInput) {
  const sql = useDatabase();
  const metadata = getRequestMetadata(event);
  const contextualActor = event.context.identity as CurrentIdentity | undefined;
  const actor = input.actor === undefined ? contextualActor : input.actor;
  await sql`
    INSERT INTO audit_events (
      actor_id, action, module, target_type, target_id, result,
      details, request_id, ip, actor_username, actor_real_name, actor_roles,
      http_method, request_path, status_code, duration_ms, user_agent
    ) VALUES (
      ${actor?.id ?? null},
      ${input.action},
      ${input.module},
      ${input.targetType},
      ${input.targetId},
      ${input.result ?? 'success'},
      ${sql.json(JSON.parse(JSON.stringify(input.details ?? {})))},
      ${metadata.requestId},
      ${metadata.ip},
      ${actor?.username ?? null},
      ${actor?.realName ?? null},
      ${actor?.roles ?? []},
      ${input.httpMethod ?? null},
      ${input.requestPath ?? null},
      ${input.statusCode ?? null},
      ${input.durationMs ?? null},
      ${metadata.userAgent}
    )
  `;
}

export async function writeRequestAudit(
  event: H3Event,
  input: {
    durationMs: number;
    result: 'failed' | 'success';
    statusCode: number;
  },
) {
  const actor = event.context.identity as CurrentIdentity | undefined;
  if (!actor) return;
  const path = event.path.split('?')[0] ?? event.path;
  if (path.startsWith('/api/v1/health')) return;
  const method = event.method.toUpperCase();
  await writeAudit(event, {
    action: 'api.request',
    actor,
    details: {
      durationMs: input.durationMs,
      method,
      path,
      statusCode: input.statusCode,
    },
    durationMs: input.durationMs,
    httpMethod: method,
    module: 'request',
    requestPath: path,
    result: input.result,
    statusCode: input.statusCode,
    targetId: `${method} ${path}`,
    targetType: 'endpoint',
  });
}
