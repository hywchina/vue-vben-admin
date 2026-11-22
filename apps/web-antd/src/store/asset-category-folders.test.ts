import type { AssetFolder, PlatformAsset } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  assetFolderOptions,
  selectedAssetCategory,
} from '#/modules/platform/asset-browser';
const folder = (
  id: string,
  generationCategory?: 'cabin' | 'cmf',
  parentId: null | string = null,
): AssetFolder => ({
  id,
  name: id,
  generationCategory,
  parentId,
  kind: 'normal',
  assetCount: 0,
  createdAt: '',
  updatedAt: '',
});
describe('asset category root directories', () => {
  it('offers the category root and only its descendants, excluding favorites', () => {
    const list = [
      folder('面料', 'cmf'),
      folder('织物', 'cmf', '面料'),
      folder('方案', 'cabin'),
      folder('旧资料'),
      { ...folder('收藏', 'cmf'), kind: 'favorites' as const },
    ];
    expect(assetFolderOptions(list, 'cmf')).toEqual([
      { label: 'CMF根目录', value: '' },
      { label: 'CMF / 面料', value: '面料' },
      { label: 'CMF / 面料 / 织物', value: '织物' },
    ]);
  });
  it('retains a separate unclassified root for legacy assets', () => {
    expect(
      assetFolderOptions([folder('旧资料'), folder('面料', 'cmf')]),
    ).toEqual([
      { label: '未分类根目录', value: '' },
      { label: '未分类 / 旧资料', value: '旧资料' },
    ]);
  });
  it('rejects mixed-category selections instead of moving them to a common project root', () => {
    expect(
      selectedAssetCategory([
        { generationCategory: 'cmf' },
        { generationCategory: 'cabin' },
      ] as PlatformAsset[]).mixed,
    ).toBe(true);
    expect(
      selectedAssetCategory([
        { generationCategory: 'cmf' },
        { generationCategory: 'cmf' },
      ] as PlatformAsset[]),
    ).toEqual({ category: 'cmf', mixed: false });
  });
});
