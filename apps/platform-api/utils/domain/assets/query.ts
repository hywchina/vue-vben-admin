import { z } from 'zod';

import { ASSET_KINDS } from './validation';

export const ASSET_GENERATION_CATEGORIES = [
  'cmf',
  'component',
  'cabin',
  'report',
] as const;
export const assetListQuerySchema = z
  .object({
    folderId: z.union([z.string().uuid(), z.literal('root')]).optional(),
    ownerId: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    generationCategory: z
      .enum([...ASSET_GENERATION_CATEGORIES, 'unclassified'])
      .optional(),
    favoriteOnly: z.enum(['true', 'false']).optional(),
    kind: z.enum(ASSET_KINDS).optional(),
    keyword: z.string().trim().max(200).optional(),
    matchMode: z.enum(['fuzzy', 'exact']).default('fuzzy'),
    sourceJobId: z.string().uuid().optional(),
    createdFrom: z.iso.datetime({ offset: true }).optional(),
    createdTo: z.iso.datetime({ offset: true }).optional(),
    sortBy: z
      .enum(['createdAt', 'name', 'owner', 'type', 'task'])
      .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine(
    (query) =>
      !query.createdFrom ||
      !query.createdTo ||
      Date.parse(query.createdFrom) < Date.parse(query.createdTo),
    {
      message: '开始时间必须早于结束时间',
      path: ['createdTo'],
    },
  );
