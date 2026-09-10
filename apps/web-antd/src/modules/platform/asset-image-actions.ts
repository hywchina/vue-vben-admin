import type { PlatformAsset, PlatformJobOutput } from './types';

import {
  designImageResultActions,
  designResultActionApplicationKeys,
} from './design-result-actions';

// The asset browser has no active design mode: expose the cabin image tools.
export const assetImageActions = designImageResultActions('cabin').filter(
  (action) => action.key !== 'download' && action.key !== 'save',
);
export function assetImageAction(key: unknown) {
  return assetImageActions.find((action) => action.key === key);
}
export function assetImageActionUnavailable(
  asset: Pick<
    PlatformAsset,
    'sourceAppKey' | 'sourceJobId' | 'status' | 'type'
  >,
  key: string,
  availableKeys: string[],
) {
  const action = assetImageAction(key);
  if (
    !action ||
    asset.type !== 'image' ||
    asset.status === 'failed' ||
    asset.status === 'pending'
  )
    return '图片或操作不可用';
  if (action.key === 'rerun' && !asset.sourceJobId)
    return '上传图片没有可复用的生成任务';
  const appKey =
    action.key === 'rerun'
      ? asset.sourceAppKey
      : designResultActionApplicationKeys[action.key];
  if (!appKey || !availableKeys.includes(appKey))
    return `${action.label}能力未配置或不可用`;
  return '';
}
export function assetImageOutput(asset: PlatformAsset): PlatformJobOutput {
  if (asset.type !== 'image') throw new Error('仅支持图片资产');
  return {
    assetId: asset.id,
    kind: 'image',
    mimeType: asset.mimeType ?? 'image/png',
    name: asset.name,
    position: 0,
    saved: true,
  };
}
