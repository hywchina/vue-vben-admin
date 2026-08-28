import type { DesignModeKey } from './design-modes';

export type DesignImageResultActionKey =
  | 'download'
  | 'environment'
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
  { icon: 'lucide:download', key: 'download', label: '下载' },
  { icon: 'lucide:folder-plus', key: 'save', label: '添加至资产中心' },
  { icon: 'lucide:refresh-cw', key: 'rerun', label: '重新绘制' },
  { icon: 'lucide:paintbrush', key: 'mask', label: '局部重绘' },
];

const modeActions: Record<
  Exclude<DesignModeKey, 'report'>,
  readonly DesignImageResultAction[]
> = {
  cabin: [
    { icon: 'lucide:tags', key: 'mark', label: '标记修改' },
    {
      icon: 'lucide:images',
      key: 'multi-image',
      label: '部件/材质融合',
    },
    { icon: 'lucide:zoom-in', key: 'upscale', label: '图像放大' },
    { icon: 'lucide:sun-medium', key: 'environment', label: '环境更改' },
    { icon: 'lucide:scan-search', key: 'understand', label: '图像理解' },
    { icon: 'lucide:orbit', key: 'multi-angle', label: '多角度生成' },
  ],
  cmf: [
    { icon: 'lucide:images', key: 'multi-image', label: '多图融合' },
    { icon: 'lucide:zoom-in', key: 'upscale', label: '图像放大' },
    { icon: 'lucide:scan-search', key: 'understand', label: '图像理解' },
  ],
  component: [
    { icon: 'lucide:tags', key: 'mark', label: '标记修改' },
    { icon: 'lucide:images', key: 'multi-image', label: '多图融合' },
    { icon: 'lucide:zoom-in', key: 'upscale', label: '图像放大' },
    { icon: 'lucide:scan-search', key: 'understand', label: '图像理解' },
    { icon: 'lucide:orbit', key: 'multi-angle', label: '多角度生成' },
    { icon: 'lucide:box', key: 'three-d', label: '三维生成' },
  ],
};

export const designResultActionApplicationKeys: Partial<
  Record<DesignImageResultActionKey, string>
> = {
  environment: 'single-image-edit',
  mark: 'region-marker-edit',
  mask: 'inpaint-single',
  'multi-angle': 'camera-control-multi',
  'multi-image': 'multi-image-edit',
  'three-d': 'multiview-to-3d',
  understand: 'image-understanding',
  upscale: 'image-upscale',
};

export function designImageResultActions(
  mode: Exclude<DesignModeKey, 'report'>,
) {
  return [...commonActions, ...modeActions[mode]];
}
