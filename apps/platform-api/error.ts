import type { H3Error } from 'h3';

import { setResponseHeader } from 'h3';

export default function errorHandler(
  error: H3Error,
  event: Parameters<typeof setResponseHeader>[0],
) {
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8');
  return JSON.stringify({
    code: 'UNHANDLED_ERROR',
    data: null,
    error: error.statusMessage || error.message || '服务器内部错误',
    message: error.statusMessage || error.message || '服务器内部错误',
    requestId: event.context.requestId,
  });
}
