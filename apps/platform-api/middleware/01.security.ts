import {
  defineEventHandler,
  getRequestHeader,
  sendNoContent,
  setResponseHeader,
  setResponseStatus,
} from 'h3';
import { getConfig } from '~/utils/config';
import { getRequestId } from '~/utils/request';

const ALLOWED_HEADERS = 'Accept, Authorization, Content-Type, X-Request-ID';
const ALLOWED_METHODS = 'GET, HEAD, OPTIONS, PUT, PATCH, POST, DELETE';

export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return;

  setResponseHeader(event, 'cache-control', 'no-store');
  setResponseHeader(event, 'permissions-policy', 'camera=(), microphone=()');
  setResponseHeader(event, 'referrer-policy', 'no-referrer');
  setResponseHeader(event, 'x-content-type-options', 'nosniff');

  const origin = getRequestHeader(event, 'origin');
  if (origin) {
    if (!getConfig().corsAllowedOrigins.includes(origin)) {
      setResponseStatus(event, 403);
      return {
        code: 'CORS_ORIGIN_DENIED',
        data: null,
        error: '不允许的跨域来源',
        message: '不允许的跨域来源',
        requestId: getRequestId(event),
      };
    }
    setResponseHeader(event, 'access-control-allow-origin', origin);
    setResponseHeader(event, 'access-control-allow-credentials', 'true');
    setResponseHeader(event, 'vary', 'Origin');
  }

  setResponseHeader(event, 'access-control-allow-headers', ALLOWED_HEADERS);
  setResponseHeader(event, 'access-control-allow-methods', ALLOWED_METHODS);
  setResponseHeader(event, 'access-control-expose-headers', 'X-Request-ID');

  if (event.method === 'OPTIONS') return sendNoContent(event, 204);
});
