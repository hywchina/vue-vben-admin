import { describe, expect, it } from 'vitest';

import { assetListQuerySchema } from './query';

const projectId = 'b6c20491-b8f4-4d4f-aae1-25084e1ab02f';
describe('asset browser query contract', () => {
  it('keeps file kind, business category and matching semantics independent', () => {
    const query = assetListQuerySchema.parse({
      projectId,
      generationCategory: 'cmf',
      kind: 'text',
      keyword: '  100%_方案  ',
      matchMode: 'exact',
      sortBy: 'task',
      sortOrder: 'asc',
    });
    expect(query.keyword).toBe('100%_方案');
    expect(query.kind).toBe('text');
    expect(query.generationCategory).toBe('cmf');
  });
  it('rejects invalid categories, unbounded keywords and reversed dates', () => {
    for (const extra of [
      { generationCategory: 'image' },
      { kind: 'cmf' },
      { keyword: 'a'.repeat(201) },
      { matchMode: 'sql' },
      { sortBy: 'name; DROP TABLE assets' },
      {
        createdFrom: '2026-09-11T00:00:00Z',
        createdTo: '2026-09-10T00:00:00Z',
      },
    ]) {
      expect(
        assetListQuerySchema.safeParse({ projectId, ...extra }).success,
      ).toBe(false);
    }
  });
});
