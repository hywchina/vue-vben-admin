import type {
  AssetFolder,
  AssetGenerationCategory,
  PlatformAsset,
} from './types';

import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { platformUiIcons } from '#/modules/platform/ui-icons';

export const assetGenerationModules: Array<{
  icon: string;
  key: 'all' | 'favorites' | 'unclassified' | AssetGenerationCategory;
  label: string;
}> = [
  { key: 'cabin', label: '客室', icon: platformSemanticIcons.cabin },
  { key: 'component', label: '零部件', icon: platformSemanticIcons.component },
  { key: 'cmf', label: 'CMF', icon: platformSemanticIcons.cmf },
  { key: 'report', label: '报告', icon: platformSemanticIcons.report },
  { key: 'all', label: '全部', icon: platformUiIcons.layoutGrid },
  { key: 'favorites', label: '收藏', icon: platformUiIcons.star },
  { key: 'unclassified', label: '未分类', icon: platformUiIcons.folder },
];
export type AssetModuleKey = (typeof assetGenerationModules)[number]['key'];
export function assetCategoryLabel(category?: AssetGenerationCategory | null) {
  return (
    assetGenerationModules.find((item) => item.key === category)?.label ??
    '未分类'
  );
}
export function assetDateBoundary(date: string, end = false) {
  if (!date) return undefined;
  const value = new Date(`${date}T00:00:00`);
  if (!Number.isFinite(value.getTime())) return undefined;
  if (end) value.setDate(value.getDate() + 1);
  return value.toISOString();
}
export function sortBrowserAssets(
  assets: PlatformAsset[],
  sortBy: 'createdAt' | 'name' | 'owner' | 'task' | 'type',
  order: 'asc' | 'desc',
) {
  const direction = order === 'asc' ? 1 : -1;
  return assets.toSorted((a, b) => {
    const difference =
      sortBy === 'createdAt'
        ? Date.parse(a.createdAt) - Date.parse(b.createdAt)
        : (sortBy === 'task'
            ? (a.sourceJobPublicId ?? '')
            : a[sortBy]
          ).localeCompare(
            sortBy === 'task' ? (b.sourceJobPublicId ?? '') : b[sortBy],
            'zh-CN',
            { numeric: true },
          );
    return direction * difference || a.id.localeCompare(b.id);
  });
}

export function assetFolderOptions(
  folders: AssetFolder[],
  category?: AssetGenerationCategory | null,
) {
  const label = assetCategoryLabel(category);
  const scoped = folders.filter(
    (folder) =>
      folder.kind === 'normal' &&
      (folder.generationCategory ?? null) === (category ?? null),
  );
  return [
    { label: `${label}根目录`, value: '' },
    ...scoped.map((folder) => {
      const parts: string[] = [];
      const visited = new Set<string>();
      let current: AssetFolder | undefined = folder;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        parts.unshift(current.name);
        current = scoped.find((item) => item.id === current?.parentId);
      }
      return { label: `${label} / ${parts.join(' / ')}`, value: folder.id };
    }),
  ];
}
export function selectedAssetCategory(assets: PlatformAsset[]) {
  const category = assets[0]?.generationCategory;
  return {
    category,
    mixed: assets.some((asset) => asset.generationCategory !== category),
  };
}
