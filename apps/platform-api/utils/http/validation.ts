import type { H3Event } from 'h3';
import type { ZodType } from 'zod';

import { getQuery, readBody } from 'h3';

import { ApiError } from './response';

export async function parseBody<T>(event: H3Event, schema: ZodType<T>) {
  const result = schema.safeParse(await readBody(event));
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '提交内容不符合要求', {
      issues: result.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join('.'),
      })),
    });
  }
  return result.data;
}

export function parseQuery<T>(event: H3Event, schema: ZodType<T>) {
  const result = schema.safeParse(getQuery(event));
  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', '查询条件不符合要求', {
      issues: result.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join('.'),
      })),
    });
  }
  return result.data;
}
