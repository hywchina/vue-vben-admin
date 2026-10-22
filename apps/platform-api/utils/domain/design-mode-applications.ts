import { z } from 'zod';

import { ApiError } from '../response';
export const designModeSchema = z.enum(['cabin', 'component', 'cmf']);
export const designModeApplicationsSchema = z
  .object({
    applicationKeys: z.array(z.string().min(1).max(100)).min(1).max(100),
    defaultImageApplicationKey: z.string().min(1).max(100),
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export function assertDesignModeApplications(
  input: z.infer<typeof designModeApplicationsSchema>,
  allowedKeys: string[],
) {
  const keys = input.applicationKeys;
  if (
    new Set(keys).size !== keys.length ||
    keys.some(
      (key) =>
        !allowedKeys.includes(key) ||
        ['screen-capture-edit', 'text-chat'].includes(key),
    ) ||
    !keys.includes(input.defaultImageApplicationKey) ||
    input.defaultImageApplicationKey === 'text-to-image'
  )
    throw new ApiError(
      400,
      'DESIGN_MODE_APPLICATIONS_INVALID',
      '功能重复、不可用，或图生图默认功能未包含在已选功能中',
    );
}
