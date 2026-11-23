import type { DesignModeKey } from './design-modes';
import type { DesignImageResultActionKey } from './design-result-actions';
import type { PlatformAsset, PlatformJobOutput } from './types';

import {
  baseEditReplacements,
  retiredBaseEditKey,
  retiredLoraTextKey,
} from './design-generation';
import {
  designImageResultActions,
  designResultActionAvailable,
} from './design-result-actions';

// The asset browser has no active design mode: expose the cabin image tools.
export const assetImageActions = designImageResultActions('cabin').filter(
  (action) => action.key !== 'download' && action.key !== 'save',
);
export function assetImageAction(key: unknown) {
  const actionKey = key === 'environment' ? 'image-edit' : key;
  return assetImageActions.find((action) => action.key === actionKey);
}
export function assetImageActionMode(
  asset: Pick<PlatformAsset, 'generationCategory'>,
  action: DesignImageResultActionKey,
  availableKeysForMode: (mode: DesignModeKey) => string[],
) {
  const modes = ['cabin', 'component', 'cmf'] as const;
  return modes
    .toSorted(
      (left, right) =>
        Number(right === asset.generationCategory) -
        Number(left === asset.generationCategory),
    )
    .find(
      (mode) =>
        designImageResultActions(mode).some((item) => item.key === action) &&
        designResultActionAvailable(action, availableKeysForMode(mode)),
    );
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
  if (action.key === 'rerun' && asset.sourceAppKey === retiredLoraTextKey)
    return availableKeys.includes('text-to-image')
      ? ''
      : '文生图能力未配置或不可用';
  if (action.key === 'rerun' && asset.sourceAppKey === retiredBaseEditKey)
    return baseEditReplacements.some(({ key }) => availableKeys.includes(key))
      ? ''
      : '单图设计编辑和双图参考编辑均不可用';
  const available =
    action.key === 'rerun'
      ? Boolean(
          asset.sourceAppKey && availableKeys.includes(asset.sourceAppKey),
        )
      : designResultActionAvailable(action.key, availableKeys);
  if (!available) return `${action.label}能力未配置或不可用`;
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
    saved: asset.saved ?? true,
  };
}
