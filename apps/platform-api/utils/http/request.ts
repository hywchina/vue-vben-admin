import type { H3Event } from 'h3';

import { randomUUID } from 'node:crypto';

import { getHeader, getRequestIP, setHeader } from 'h3';

export function getRequestId(event: H3Event) {
  const existing = event.context.requestId as string | undefined;
  if (existing) return existing;

  const requestId =
    getHeader(event, 'x-request-id')?.slice(0, 128) || randomUUID();
  event.context.requestId = requestId;
  setHeader(event, 'x-request-id', requestId);
  return requestId;
}

export function getRequestMetadata(event: H3Event) {
  return {
    ip: getRequestIP(event, { xForwardedFor: true }) ?? null,
    requestId: getRequestId(event),
    userAgent: getHeader(event, 'user-agent')?.slice(0, 512) ?? null,
  };
}
