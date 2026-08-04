import type { EventHandler, EventHandlerRequest, H3Event } from 'h3';

import { eventHandler, setResponseStatus } from 'h3';

import { writeRequestAudit } from './audit';
import { getRequestId } from './request';

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function apiSuccess<T>(event: H3Event, data: T) {
  return {
    code: 0,
    data,
    error: null,
    message: 'ok',
    requestId: getRequestId(event),
  };
}

function apiFailure(event: H3Event, error: unknown) {
  const normalized =
    error instanceof ApiError
      ? error
      : new ApiError(500, 'INTERNAL_ERROR', '服务器内部错误');

  if (!(error instanceof ApiError)) {
    console.error(`[${getRequestId(event)}]`, error);
  }

  setResponseStatus(event, normalized.statusCode);
  return {
    code: normalized.code,
    data: null,
    details: normalized.details,
    error: normalized.message,
    message: normalized.message,
    requestId: getRequestId(event),
  };
}

export function apiHandler<T>(
  handler: (event: H3Event<EventHandlerRequest>) => Promise<T> | T,
): EventHandler {
  return eventHandler(async (event) => {
    getRequestId(event);
    const startedAt = Date.now();
    let result: 'failed' | 'success' = 'success';
    let statusCode = 200;
    try {
      return apiSuccess(event, await handler(event));
    } catch (error) {
      result = 'failed';
      statusCode = error instanceof ApiError ? error.statusCode : 500;
      return apiFailure(event, error);
    } finally {
      try {
        await writeRequestAudit(event, {
          durationMs: Date.now() - startedAt,
          result,
          statusCode,
        });
      } catch (auditError) {
        console.error(
          `[${getRequestId(event)}] 写入请求审计日志失败`,
          auditError,
        );
      }
    }
  });
}
