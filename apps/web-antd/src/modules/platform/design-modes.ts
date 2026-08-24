import type { PlatformApplication } from './types';

export type DesignModeKey = 'cabin' | 'cmf' | 'component' | 'report';

export interface DesignModeDefinition {
  applicationKeys: readonly string[];
  description: string;
  icon: string;
  key: DesignModeKey;
  label: string;
  placeholder: string;
}

const defaultDesignMode: DesignModeDefinition = {
  applicationKeys: [
    'text-chat',
    'text-to-image',
    'image-understanding',
    'inpaint-single',
    'outpaint',
    'multi-image-edit',
    'image-upscale',
    'text-to-image-lora',
    'single-image-edit',
    'screen-capture-edit',
    'inpaint-reference',
    'region-edit',
    'region-marker-edit',
    'camera-control-single',
    'camera-control-multi',
  ],
  description: '生成和深化客室整体空间、镜头、环境与材料效果。',
  icon: 'lucide:train-front',
  key: 'cabin',
  label: '客室效果生成',
  placeholder: '描述客室类型、镜头角度、零部件颜色与材质、空间尺寸及期望效果……',
};

export const designModes: readonly DesignModeDefinition[] = [
  {
    applicationKeys: [
      'text-chat',
      'text-to-image',
      'image-understanding',
      'inpaint-single',
      'outpaint',
      'multi-image-edit',
      'image-upscale',
      'text-to-image-lora',
      'single-image-edit',
      'screen-capture-edit',
      'inpaint-reference',
      'region-marker-edit',
      'camera-control-multi',
      'multiview-to-3d',
    ],
    description: '生成座椅、桌板、行李架等客室零部件及多视角方案。',
    icon: 'lucide:boxes',
    key: 'component',
    label: '客室零部件生成',
    placeholder: '描述零部件类型、观察角度、颜色、材质、结构尺寸及设计要求……',
  },
  {
    applicationKeys: [
      'text-chat',
      'text-to-image',
      'image-understanding',
      'inpaint-single',
      'outpaint',
      'multi-image-edit',
      'image-upscale',
      'text-to-image-lora',
      'single-image-edit',
      'inpaint-reference',
      'image-edit-base',
      'image-edit-kv',
    ],
    description: '生成连续纹样、颜色、面料材质与表面图案方案。',
    icon: 'lucide:swatch-book',
    key: 'cmf',
    label: 'CMF生成',
    placeholder:
      '描述二方连续或四方连续、颜色、面料材质、图案形式、风格和图像尺寸……',
  },
  defaultDesignMode,
  {
    applicationKeys: ['report-generator'],
    description: '组合项目资产与说明，生成结构化 Word 或 PPT 报告。',
    icon: 'lucide:file-chart-column',
    key: 'report',
    label: '报告生成',
    placeholder: '选择项目资产并填写报告类型、章节和交付格式……',
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
