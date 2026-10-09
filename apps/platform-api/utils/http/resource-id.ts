import type { H3Event } from 'h3';

import { getRouterParam } from 'h3';
import { z } from 'zod';

import { ApiError } from './response';

const uuidSchema = z.string().uuid();

/** Keep missing-ID handling in the route; reject malformed IDs before SQL. */
export function getUuidParam(event: H3Event, name = 'id') {
  const value = getRouterParam(event, name);
  if (value && !uuidSchema.safeParse(value).success) {
    throw new ApiError(400, 'RESOURCE_ID_INVALID', '资源编号格式不正确');
  }
  return value;
}
