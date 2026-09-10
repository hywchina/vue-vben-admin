import type { PlatformAsset } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  assetCategoryLabel,
  assetDateBoundary,
  sortBrowserAssets,
} from '#/modules/platform/asset-browser';
import platformRoutes from '#/router/routes/modules/platform';

describe('asset browser display rules', () => {
  it('keeps the asset page instance when the detail deep link changes', () => {
    expect(
      platformRoutes.find((route) => route.name === 'PlatformAssets')?.meta
        ?.fullPathKey,
    ).toBe(false);
  });
  it('uses the next local midnight for an inclusive end date', () => {
    const start = new Date(assetDateBoundary('2026-09-10') ?? '');
    const end = new Date(assetDateBoundary('2026-09-10', true) ?? '');
    expect(start.getHours()).toBe(0);
    expect(start.getDate()).toBe(10);
    expect(end.getHours()).toBe(0);
    expect(end.getDate()).toBe(11);
    expect(assetDateBoundary('')).toBeUndefined();
  });
  it('merges project results by task number with stable ties and both directions', () => {
    const rows = [
      { id: 'b', sourceJobPublicId: 'TSK-10' },
      { id: 'c', sourceJobPublicId: 'TSK-2' },
      { id: 'a', sourceJobPublicId: 'TSK-2' },
    ] as PlatformAsset[];
    expect(
      sortBrowserAssets(rows, 'task', 'asc').map((item) => item.id),
    ).toEqual(['a', 'c', 'b']);
    expect(
      sortBrowserAssets(rows, 'task', 'desc').map((item) => item.id),
    ).toEqual(['b', 'a', 'c']);
    expect(assetCategoryLabel(undefined)).toBe('未分类');
  });
});
