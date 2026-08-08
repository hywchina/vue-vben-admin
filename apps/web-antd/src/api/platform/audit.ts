import type { PlatformAuditEvent } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface AuditEventQuery {
  actorId?: string;
  limit?: number;
  module?: string;
  page?: number;
}

export function getAuditEventsApi(params?: AuditEventQuery) {
  return requestClient.get<{
    items: PlatformAuditEvent[];
    limit: number;
    page: number;
    scope: 'all' | 'self';
    total: number;
  }>('/audit-events', { params });
}

export function recordPageViewApi(input: {
  fromPath?: string;
  path: string;
  title?: string;
}) {
  return requestClient.post<{ recorded: boolean }>(
    '/audit-events/client',
    input,
  );
}
