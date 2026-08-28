import type { PlatformApplication } from './types';

export type DesignModeKey = 'cabin' | 'cmf' | 'component' | 'report';

export interface DesignModeToolDefinition {
  appKey: string;
  icon: string;
  key: string;
  label: string;
  placeholder?: string;
  templateCategoryIds?: readonly string[];
}

export interface DesignModeDefinition {
  applicationKeys: readonly string[];
  backgroundImage: string;
  defaultApplicationKey?: string;
  description: string;
  icon: string;
  key: DesignModeKey;
  label: string;
  placeholder: string;
  primaryTools?: readonly DesignModeToolDefinition[];
  standalonePath?: string;
}

const defaultDesignMode: DesignModeDefinition = {
  applicationKeys: [
    'text-to-image',
    'region-marker-edit',
    'inpaint-single',
    'multi-image-edit',
    'single-image-edit',
    'image-upscale',
    'image-understanding',
    'camera-control-multi',
    'text-chat',
    'outpaint',
    'text-to-image-lora',
    'screen-capture-edit',
    'inpaint-reference',
    'region-edit',
    'camera-control-single',
  ],
  backgroundImage: '/design-modes/cabin.webp',
  defaultApplicationKey: 'text-to-image',
  description: '生成和深化客室整体空间、镜头、环境与材料效果。',
  icon: 'lucide:train-front',
  key: 'cabin',
  label: '客室效果生成',
  placeholder:
    '描述你的设计需求，如生成客室类型、画面角度、部件颜色、材质、图像尺寸等……',
  primaryTools: [
    {
      appKey: 'text-to-image',
      icon: 'lucide:image-plus',
      key: 'text-to-image',
      label: '文生图',
    },
    {
      appKey: 'region-marker-edit',
      icon: 'lucide:tags',
      key: 'marker-generate',
      label: '标记生成',
    },
    {
      appKey: 'inpaint-single',
      icon: 'lucide:paintbrush',
      key: 'inpaint-single',
      label: '局部重绘',
    },
    {
      appKey: 'multi-image-edit',
      icon: 'lucide:images',
      key: 'material-fusion',
      label: '部件/材质融合',
    },
    {
      appKey: 'single-image-edit',
      icon: 'lucide:map',
      key: 'floor-plan-coloring',
      label: '平面图填色',
      placeholder:
        '上传客室平面图，并描述需要填充的区域、颜色、材质及整体风格……',
    },
    {
      appKey: 'single-image-edit',
      icon: 'lucide:sun-medium',
      key: 'environment-change',
      label: '环境更改',
      placeholder:
        '描述需要调整的光环境与窗外环境，如白天、夜晚、森林或城市等……',
      templateCategoryIds: ['light-environment', 'outside-environment'],
    },
    {
      appKey: 'image-upscale',
      icon: 'lucide:zoom-in',
      key: 'image-upscale',
      label: '图像放大',
    },
    {
      appKey: 'image-understanding',
      icon: 'lucide:scan-search',
      key: 'image-understanding',
      label: '图像理解',
    },
  ],
};

export const designModes: readonly DesignModeDefinition[] = [
  {
    applicationKeys: [
      'text-to-image',
      'inpaint-single',
      'region-marker-edit',
      'multi-image-edit',
      'camera-control-multi',
      'multiview-to-3d',
      'image-upscale',
      'image-understanding',
      'text-chat',
      'outpaint',
      'text-to-image-lora',
      'single-image-edit',
      'screen-capture-edit',
      'inpaint-reference',
    ],
    backgroundImage: '/design-modes/component.webp',
    defaultApplicationKey: 'text-to-image',
    description: '生成座椅、桌板、行李架等客室零部件及多视角方案。',
    icon: 'lucide:boxes',
    key: 'component',
    label: '客室零部件生成',
    placeholder:
      '描述你的设计需求，如生成部件类型、角度、颜色、表面材质、图像尺寸等……',
    primaryTools: [
      {
        appKey: 'text-to-image',
        icon: 'lucide:image-plus',
        key: 'text-to-image',
        label: '文生图',
      },
      {
        appKey: 'inpaint-single',
        icon: 'lucide:paintbrush',
        key: 'inpaint-single',
        label: '局部重绘',
      },
      {
        appKey: 'region-marker-edit',
        icon: 'lucide:tags',
        key: 'marker-edit',
        label: '标记修改',
      },
      {
        appKey: 'multi-image-edit',
        icon: 'lucide:images',
        key: 'multi-image-edit',
        label: '多图融合',
      },
      {
        appKey: 'camera-control-multi',
        icon: 'lucide:orbit',
        key: 'camera-control-multi',
        label: '多角度生成',
      },
      {
        appKey: 'multiview-to-3d',
        icon: 'lucide:box',
        key: 'multiview-to-3d',
        label: '三维生成',
      },
      {
        appKey: 'image-upscale',
        icon: 'lucide:zoom-in',
        key: 'image-upscale',
        label: '图像放大',
      },
      {
        appKey: 'image-understanding',
        icon: 'lucide:scan-search',
        key: 'image-understanding',
        label: '图片理解',
      },
    ],
  },
  {
    applicationKeys: [
      'text-to-image',
      'inpaint-single',
      'multi-image-edit',
      'image-upscale',
      'image-understanding',
      'text-chat',
      'outpaint',
      'text-to-image-lora',
      'single-image-edit',
      'inpaint-reference',
      'image-edit-base',
      'image-edit-kv',
    ],
    backgroundImage: '/design-modes/cmf.webp',
    defaultApplicationKey: 'text-to-image',
    description: '生成连续纹样、颜色、面料材质与表面图案方案。',
    icon: 'lucide:swatch-book',
    key: 'cmf',
    label: 'CMF生成',
    placeholder:
      '描述你的设计需求，如生成二方连续/四方连续、颜色、面料材质、图案形式、风格、图像尺寸的纹样……',
    primaryTools: [
      {
        appKey: 'text-to-image',
        icon: 'lucide:image-plus',
        key: 'text-to-image',
        label: '文生图',
      },
      {
        appKey: 'inpaint-single',
        icon: 'lucide:paintbrush',
        key: 'inpaint-single',
        label: '局部重绘',
      },
      {
        appKey: 'multi-image-edit',
        icon: 'lucide:images',
        key: 'multi-image-edit',
        label: '多图融合',
      },
      {
        appKey: 'image-upscale',
        icon: 'lucide:zoom-in',
        key: 'image-upscale',
        label: '图像放大',
      },
      {
        appKey: 'image-understanding',
        icon: 'lucide:scan-search',
        key: 'image-understanding',
        label: '图片理解',
      },
    ],
  },
  defaultDesignMode,
  {
    applicationKeys: ['report-generator'],
    backgroundImage: '/design-modes/report.webp',
    description: '组合项目资产与说明，生成结构化 Word、PPT 或 Markdown 报告。',
    icon: 'lucide:file-chart-column',
    key: 'report',
    label: '报告生成',
    placeholder: '选择项目资产并填写报告类型、章节和交付格式……',
    standalonePath: '/report-generation',
  },
];

export function getDesignMode(key: DesignModeKey) {
  return designModes.find((mode) => mode.key === key) ?? defaultDesignMode;
}

export function designModeForApplication(
  applicationKey: string,
  currentModeKey: DesignModeKey = 'cabin',
) {
  const currentMode = getDesignMode(currentModeKey);
  if (currentMode.applicationKeys.includes(applicationKey)) return currentMode;
  return (
    designModes.find((mode) => mode.applicationKeys.includes(applicationKey)) ??
    currentMode
  );
}

export function applicationsForDesignMode(
  applications: readonly PlatformApplication[],
  mode: DesignModeDefinition,
) {
  const positions = new Map(
    mode.applicationKeys.map((applicationKey, index) => [
      applicationKey,
      index,
    ]),
  );

  return applications
    .filter(
      (application) =>
        application.visible &&
        application.capabilityCode &&
        positions.has(application.key),
    )
    .toSorted((left, right) => {
      const leftPosition = positions.get(left.key) ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = positions.get(right.key) ?? Number.MAX_SAFE_INTEGER;
      return leftPosition - rightPosition;
    });
}
