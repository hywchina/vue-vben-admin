import type { DesignModeKey } from './design-modes';

import { assetTypeIcons } from '#/modules/platform/asset-types';
import {
  referenceImageEditKey,
  referenceImageWorkflows,
} from '#/modules/platform/design-generation';
import { localImageEditKey } from '#/modules/platform/local-image-edit';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { platformUiIcons } from '#/modules/platform/ui-icons';

export type DesignImageResultActionKey =
  | 'download'
  | 'image-edit'
  | 'mark'
  | 'mask'
  | 'multi-angle'
  | 'multi-image'
  | 'rerun'
  | 'save'
  | 'three-d'
  | 'understand'
  | 'upscale';

export interface DesignImageResultAction {
  icon: string;
  key: DesignImageResultActionKey;
  label: string;
}

const commonActions: readonly DesignImageResultAction[] = [
  { icon: platformUiIcons.download, key: 'download', label: '下载' },
  { icon: platformSemanticIcons.assets, key: 'save', label: '添加至资产中心' },
  { icon: platformUiIcons.refreshCw, key: 'rerun', label: '重新绘制' },
  { icon: platformUiIcons.pencil, key: 'image-edit', label: '图片编辑' },
  { icon: platformSemanticIcons.mask, key: 'mask', label: '局部重绘' },
];

const modeActions: Record<
  Exclude<DesignModeKey, 'report'>,
  readonly DesignImageResultAction[]
> = {
  cabin: [
    { icon: platformUiIcons.tags, key: 'mark', label: '标记修改' },
    {
      icon: platformUiIcons.images,
      key: 'multi-image',
      label: '部件/材质融合',
    },
    { icon: platformUiIcons.zoomIn, key: 'upscale', label: '图像放大' },
    { icon: platformUiIcons.scanSearch, key: 'understand', label: '图像理解' },
    { icon: platformUiIcons.orbit, key: 'multi-angle', label: '多角度生成' },
  ],
  cmf: [
    { icon: platformUiIcons.images, key: 'multi-image', label: '多图融合' },
    { icon: platformUiIcons.zoomIn, key: 'upscale', label: '图像放大' },
    { icon: platformUiIcons.scanSearch, key: 'understand', label: '图像理解' },
  ],
  component: [
    { icon: platformUiIcons.tags, key: 'mark', label: '标记修改' },
    { icon: platformUiIcons.images, key: 'multi-image', label: '多图融合' },
    { icon: platformUiIcons.zoomIn, key: 'upscale', label: '图像放大' },
    { icon: platformUiIcons.scanSearch, key: 'understand', label: '图像理解' },
    { icon: platformUiIcons.orbit, key: 'multi-angle', label: '多角度生成' },
    { icon: assetTypeIcons.model3d, key: 'three-d', label: '三维生成' },
  ],
};

export const designResultActionApplicationKeys: Partial<
  Record<DesignImageResultActionKey, string>
> = {
  'image-edit': referenceImageEditKey,
  mark: 'region-marker-edit',
  mask: 'inpaint-single',
  'multi-angle': 'camera-control-multi',
  'multi-image': 'multi-image-edit',
  'three-d': 'multiview-to-3d',
  understand: 'image-understanding',
  upscale: 'image-upscale',
};

export function designResultActionAvailable(
  action: DesignImageResultActionKey,
  availableKeys: string[],
) {
  if (action === 'image-edit')
    return (
      availableKeys.includes(referenceImageEditKey) &&
      referenceImageWorkflows.some((key) => availableKeys.includes(key))
    );
  if (action === 'multi-image' && availableKeys.includes(referenceImageEditKey))
    return true;
  if (action === 'mask' && availableKeys.includes(localImageEditKey))
    return ['inpaint-reference', 'inpaint-single'].some((key) =>
      availableKeys.includes(key),
    );
  const key = designResultActionApplicationKeys[action];
  return !key || availableKeys.includes(key);
}

export function designImageResultActions(
  mode: Exclude<DesignModeKey, 'report'>,
) {
  return [...commonActions, ...modeActions[mode]];
}
