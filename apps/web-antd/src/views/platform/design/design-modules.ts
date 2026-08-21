import type { PlatformApplication } from '#/modules/platform/types';

export type DesignModuleKey = 'cabin' | 'cmf' | 'component' | 'report';

export interface DesignPromptTemplateGroup {
  label: string;
  options: string[];
}

export interface DesignModuleDefinition {
  description: string;
  icon: string;
  key: DesignModuleKey;
  label: string;
  placeholder: string;
  recommendedAppKeys: string[];
  status: 'available' | 'planned';
  templates: DesignPromptTemplateGroup[];
}

export const DEFAULT_DESIGN_MODULE: DesignModuleDefinition = {
  description: '独立零部件的造型、视角、颜色与表面材质设计',
  icon: 'lucide:armchair',
  key: 'component',
  label: '客室零部件生成',
  placeholder:
    '描述你的设计需求，如生成部件类型、角度、颜色、表面材质、图像尺寸等…',
  recommendedAppKeys: [
    'text-to-image',
    'inpaint-single',
    'region-marker-edit',
    'multi-image-edit',
    'camera-control-multi',
    'multiview-to-3d',
    'image-upscale',
    'image-understanding',
    'text-to-image-lora',
  ],
  status: 'available',
  templates: [
    { label: '部件类型', options: ['座椅', '桌板', '行李架'] },
    { label: '画面角度', options: ['正视图', '侧视图', '俯视图'] },
    { label: '表面材质', options: ['织物', '皮革', '金属'] },
  ],
};

export const DESIGN_MODULES: DesignModuleDefinition[] = [
  DEFAULT_DESIGN_MODULE,
  {
    description: '客室颜色、材料、纹样与表面处理方案设计',
    icon: 'lucide:swatch-book',
    key: 'cmf',
    label: 'CMF 生成',
    placeholder:
      '描述你的设计需求，如生成二方连续/四方连续、颜色、面料材质、图案形式、风格、图像尺寸的纹样…',
    recommendedAppKeys: [
      'text-to-image',
      'inpaint-single',
      'multi-image-edit',
      'image-upscale',
      'image-understanding',
      'text-to-image-lora',
    ],
    status: 'available',
    templates: [
      { label: '颜色', options: ['红色', '蓝色', '绿色'] },
      { label: '材质', options: ['布料', '皮革'] },
      { label: '纹样类型', options: ['二方连续', '四方连续'] },
    ],
  },
  {
    description: '整车客室空间、部件材质融合与环境效果设计',
    icon: 'lucide:train-front',
    key: 'cabin',
    label: '客室效果生成',
    placeholder:
      '描述你的设计需求，如生成客室类型、画面角度、部件颜色、材质、图像尺寸等…',
    recommendedAppKeys: [
      'text-to-image',
      'region-marker-edit',
      'inpaint-single',
      'multi-image-edit',
      'region-edit',
      'camera-control-multi',
      'image-upscale',
      'image-understanding',
      'text-to-image-lora',
    ],
    status: 'available',
    templates: [
      { label: '客室类型', options: ['高速列车', '城际列车', '地铁客室'] },
      { label: '光环境', options: ['白天', '阴天', '夜晚'] },
      { label: '窗外环境', options: ['户外', '森林', '草地', '沙漠', '城市'] },
    ],
  },
  {
    description: '根据项目资产生成结构化 Word/PPT 报告',
    icon: 'lucide:file-chart-column',
    key: 'report',
    label: '报告生成',
    placeholder: '报告模板与生成服务技术路线待确定。',
    recommendedAppKeys: [],
    status: 'planned',
    templates: [],
  },
];

export function applicationsForDesignModule(
  applications: PlatformApplication[],
  module: DesignModuleDefinition,
) {
  const recommendedOrder = new Map(
    module.recommendedAppKeys.map((key, index) => [key, index]),
  );
  return applications.toSorted((a, b) => {
    const aIndex = recommendedOrder.get(a.key);
    const bIndex = recommendedOrder.get(b.key);
    if (aIndex === undefined && bIndex === undefined) {
      return a.name.localeCompare(b.name, 'zh-CN');
    }
    if (aIndex === undefined) return 1;
    if (bIndex === undefined) return -1;
    return aIndex - bIndex;
  });
}

export function promptTemplateText(group: string, option: string) {
  return `${group}：${option}`;
}
