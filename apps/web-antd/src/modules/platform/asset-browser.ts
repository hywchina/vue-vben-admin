import type { AssetGenerationCategory, PlatformAsset } from './types';

export const assetGenerationModules: Array<{
  icon: string;
  key: 'all' | 'favorites' | 'unclassified' | AssetGenerationCategory;
  label: string;
}> = [
  { key: 'cmf', label: 'CMF', icon: 'lucide:palette' },
  { key: 'component', label: '零部件', icon: 'lucide:box' },
  { key: 'cabin', label: '客室', icon: 'lucide:armchair' },
  { key: 'report', label: '报告', icon: 'lucide:file-text' },
  { key: 'all', label: '全部', icon: 'lucide:layout-grid' },
  { key: 'favorites', label: '收藏', icon: 'lucide:star' },
  { key: 'unclassified', label: '未分类', icon: 'lucide:folder' },
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
