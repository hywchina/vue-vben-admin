import type { H3Error } from 'h3';

import { setResponseHeader } from 'h3';

export default function errorHandler(
  error: H3Error,
  event: Parameters<typeof setResponseHeader>[0],
) {
  const isServerError = !error.statusCode || error.statusCode >= 500;
  const message = isServerError
    ? '服务器内部错误'
    : error.statusMessage || error.message || '请求失败';
  if (isServerError) {
    console.error(`[${event.context.requestId ?? 'unknown'}]`, error);
  }
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8');
  return JSON.stringify({
    code: 'UNHANDLED_ERROR',
    data: null,
    error: message,
    message,
    requestId: event.context.requestId,
  });
}
