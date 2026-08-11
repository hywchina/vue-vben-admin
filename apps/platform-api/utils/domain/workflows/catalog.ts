import generatedParameterSchemas from '../../../workflows/comfyui/parameter-schemas.generated.json';

type MediaType = 'asset' | 'capture' | 'mask' | 'region';

interface ScalarFieldInput {
  advanced?: boolean;
  defaultValue?: unknown;
  group?: string;
  help?: string;
  inputName: string;
  integer?: boolean;
  key: string;
  label: string;
  max?: number;
  maxLength?: number;
  min?: number;
  nodeId: string;
  placeholder?: string;
  required?: boolean;
  step?: number;
  type: 'boolean' | 'number' | 'select' | 'text' | 'textarea';
  uiControl?:
    | 'camera-horizontal'
    | 'camera-vertical'
    | 'camera-zoom'
    | 'default';
  uiGroup?: string;
  valuePrefix?: string;
}

interface MediaFieldInput {
  acceptedKinds?: string[];
  assetIndex: number;
  help?: string;
  inputName?: string;
  key: string;
  label: string;
  nodeId?: string;
  required?: boolean;
  targets: Array<{
    inputName: string;
    nodeId: string;
    transport?: 'data-url' | 'upload';
  }>;
  type: MediaType;
}

export interface WorkflowCatalogEntry {
  application: {
    acceptedAssetTypes: string[];
    category: 'design' | 'generation';
    color: string;
    description: string;
    icon: string;
    key: string;
    name: string;
    outputAssetTypes: string[];
    shortName: string;
  };
  capability: {
    description: string;
    name: string;
  };
  fileName: string;
  version: {
    modelRequirements: string[];
    outputSchema: unknown[];
    parameterSchema: unknown[];
  };
  workflow: {
    code: string;
    description: string;
    name: string;
  };
}

const fluxModels = [
  'qwen_3_8b_fp8mixed.safetensors',
  'flux2-vae.safetensors',
  'flux-2-klein-9b-fp8.safetensors',
];

function scalar(input: ScalarFieldInput) {
  return {
    advanced: input.advanced ?? false,
    defaultValue: input.defaultValue,
    group: input.group,
    help: input.help,
    inputName: input.inputName,
    integer: input.integer ?? false,
    key: input.key,
    label: input.label,
    max: input.max,
    maxLength: input.maxLength,
    min: input.min,
    nodeId: input.nodeId,
    options: [],
    placeholder: input.placeholder,
    required: input.required ?? false,
    step: input.step,
    type: input.type,
    uiControl: input.uiControl ?? 'default',
    uiGroup: input.uiGroup,
    valuePrefix: input.valuePrefix,
  };
}

function media(input: MediaFieldInput) {
  return {
    acceptedKinds: input.acceptedKinds ?? ['image'],
    advanced: false,
    assetIndex: input.assetIndex,
    defaultValue: input.type === 'region' ? '' : undefined,
    help: input.help,
    inputName: input.inputName,
    integer: false,
    key: input.key,
    label: input.label,
    nodeId: input.nodeId,
    options: [],
    required: input.required ?? true,
    targets: input.targets,
    type: input.type,
  };
}

function output(nodeId: string, field: string, kind: string, tags: string[]) {
  return { field, kind, nodeId, role: 'primary', tags };
}

function prompt(nodeId: string, defaultValue: string, label = '编辑指令') {
  return scalar({
    defaultValue,
    inputName: 'value',
    key: 'prompt',
    label,
    maxLength: 6000,
    nodeId,
    placeholder: '描述期望的设计结果、材质、色彩与空间关系',
    required: true,
    type: 'textarea',
  });
}

function seed(nodeId: string, inputName = 'noise_seed', defaultValue = 42) {
  return scalar({
    advanced: true,
    defaultValue,
    inputName,
    integer: true,
    key: 'seed',
    label: '随机种子',
    max: Number.MAX_SAFE_INTEGER,
    min: 0,
    nodeId,
    required: true,
    step: 1,
    type: 'number',
  });
}

function steps(nodeId: string, defaultValue = 4) {
  return scalar({
    advanced: true,
    defaultValue,
    inputName: 'steps',
    integer: true,
    key: 'steps',
    label: '采样步数',
    max: 100,
    min: 1,
    nodeId,
    required: true,
    step: 1,
    type: 'number',
  });
}

function cameraControl(inputName: unknown): ScalarFieldInput['uiControl'] {
  if (inputName === 'horizontal_angle') return 'camera-horizontal';
  if (inputName === 'vertical_angle') return 'camera-vertical';
  return 'camera-zoom';
}

export const WORKFLOW_CATALOG_BASE: WorkflowCatalogEntry[] = [
  {
    application: {
      acceptedAssetTypes: [],
      category: 'generation',
      color: '#b91c32',
      description: '从设计语言生成轨道客室、材质与视觉方案。',
      icon: 'lucide:image-plus',
      key: 'text-to-image',
      name: '文生图',
      outputAssetTypes: ['image'],
      shortName: '文生图',
    },
    capability: {
      description: '将业务提示词与受控生成参数映射到 Flux2 Klein 工作流。',
      name: '文生图',
    },
    fileName: 'flux2-klein-text-to-image-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('356', 'images', 'image', ['ComfyUI', '文生图'])],
      parameterSchema: [
        prompt(
          '357',
          '现代轨道交通客室设计，空间关系清晰，材质真实，工业设计效果图',
          '画面描述',
        ),
        scalar({
          defaultValue: 2048,
          inputName: 'value',
          integer: true,
          key: 'width',
          label: '图片宽度',
          max: 4096,
          min: 512,
          nodeId: '358',
          required: true,
          step: 64,
          type: 'number',
        }),
        scalar({
          defaultValue: 1080,
          inputName: 'value',
          integer: true,
          key: 'height',
          label: '图片高度',
          max: 4096,
          min: 512,
          nodeId: '359',
          required: true,
          step: 64,
          type: 'number',
        }),
        scalar({
          advanced: true,
          defaultValue: 1,
          inputName: 'batch_size',
          integer: true,
          key: 'batchSize',
          label: '生成数量',
          max: 4,
          min: 1,
          nodeId: '346',
          required: true,
          step: 1,
          type: 'number',
        }),
        seed('347', 'noise_seed', 437_576_720_848_776),
        steps('352'),
      ],
    },
    workflow: {
      code: 'flux2-klein-text-to-image',
      description: '轨道客室平台内置的 Flux2 Klein 文生图 API 工作流。',
      name: 'Flux2 Klein 文生图',
    },
  },
  {
    application: {
      acceptedAssetTypes: [],
      category: 'generation',
      color: '#a55231',
      description: '使用客室内饰 LoRA 生成风格更稳定的空间效果图。',
      icon: 'lucide:badge-sparkles',
      key: 'text-to-image-lora',
      name: 'LoRA 客室生成',
      outputAssetTypes: ['image'],
      shortName: 'LoRA',
    },
    capability: {
      description: '使用内饰 LoRA 约束生成风格。',
      name: 'LoRA 客室生成',
    },
    fileName: 'text-to-image-lora-v1.json',
    version: {
      modelRequirements: [
        ...fluxModels,
        'flux2_klein_9b_interior_lora_smoke.safetensors',
      ],
      outputSchema: [output('356', 'images', 'image', ['ComfyUI', 'LoRA'])],
      parameterSchema: [
        prompt(
          '357',
          'interiorstyle, modern rail carriage interior',
          '客室描述',
        ),
        scalar({
          defaultValue: 2048,
          inputName: 'value',
          integer: true,
          key: 'width',
          label: '图片宽度',
          max: 4096,
          min: 512,
          nodeId: '358',
          required: true,
          step: 64,
          type: 'number',
        }),
        scalar({
          defaultValue: 1080,
          inputName: 'value',
          integer: true,
          key: 'height',
          label: '图片高度',
          max: 4096,
          min: 512,
          nodeId: '359',
          required: true,
          step: 64,
          type: 'number',
        }),
        scalar({
          advanced: true,
          defaultValue: 1,
          inputName: 'strength_model',
          key: 'loraStrength',
          label: 'LoRA 强度',
          max: 2,
          min: 0,
          nodeId: '369',
          step: 0.05,
          type: 'number',
        }),
        seed('347', 'noise_seed', 717_945_418_052_803),
        steps('352'),
      ],
    },
    workflow: {
      code: 'flux2-klein-text-to-image-lora',
      description: '带客室内饰 LoRA 的 Flux2 Klein 文生图工作流。',
      name: 'Flux2 Klein LoRA 文生图',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#315f73',
      description: '以一张客室图像为基础，按设计指令调整空间与部件。',
      icon: 'lucide:scan-line',
      key: 'single-image-edit',
      name: '单图设计编辑',
      outputAssetTypes: ['image'],
      shortName: '单图',
    },
    capability: {
      description: '单张项目图像的 Flux2 指令编辑。',
      name: '单图设计编辑',
    },
    fileName: 'single-image-edit-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('402', 'images', 'image', ['ComfyUI', '单图编辑'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          help: '选择待编辑的客室图像。',
          key: 'sourceImage',
          label: '底图',
          targets: [{ inputName: 'image', nodeId: '403' }],
          type: 'asset',
        }),
        prompt('404', '保持客室结构与视角，优化座椅、材质和照明'),
        seed('398', 'noise_seed', 500_161_323_353_177),
        steps('400'),
      ],
    },
    workflow: {
      code: 'flux2-klein-single-image-edit',
      description: 'Flux2 Klein 单图指令编辑工作流。',
      name: 'Flux2 Klein 单图编辑',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#42677a',
      description: '将屏幕或摄像头画面捕获为项目资产，并立即进入风格编辑。',
      icon: 'lucide:monitor-up',
      key: 'screen-capture-edit',
      name: '实时画面编辑',
      outputAssetTypes: ['image'],
      shortName: '捕获',
    },
    capability: {
      description: '屏幕捕获图像的 Flux2 快速编辑。',
      name: '实时画面编辑',
    },
    fileName: 'screen-capture-edit-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('402', 'images', 'image', ['ComfyUI', '屏幕捕获'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          help: '可捕获屏幕，也可直接选择项目图像。',
          key: 'capturedFrame',
          label: '捕获画面',
          targets: [
            {
              inputName: 'image_base64',
              nodeId: '413',
              transport: 'data-url',
            },
          ],
          type: 'capture',
        }),
        prompt('404', '保持画面构图，转换为精致的轨道客室设计效果'),
        seed('398', 'noise_seed', 988_864_582_850_548),
        steps('400'),
      ],
    },
    workflow: {
      code: 'flux2-klein-screen-capture-edit',
      description: '使用 ScreenShare Data URL 输入的 Flux2 编辑工作流。',
      name: 'Flux2 Klein 实时画面编辑',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#546675',
      description: '组合两到三张参考图，将空间、座椅与材质意图融合为新方案。',
      icon: 'lucide:images',
      key: 'multi-image-edit',
      name: '多图融合编辑',
      outputAssetTypes: ['image'],
      shortName: '多图',
    },
    capability: {
      description: '多张图像参考的 Flux2 融合编辑。',
      name: '多图融合编辑',
    },
    fileName: 'multi-image-edit-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('23', 'images', 'image', ['ComfyUI', '多图融合'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'baseImage',
          label: '基础空间',
          targets: [{ inputName: 'image', nodeId: '24' }],
          type: 'asset',
        }),
        media({
          assetIndex: 1,
          key: 'referenceImage',
          label: '样式参考',
          targets: [{ inputName: 'image', nodeId: '26' }],
          type: 'asset',
        }),
        media({
          assetIndex: 2,
          key: 'materialImage',
          label: '材质参考',
          targets: [{ inputName: 'image', nodeId: '32' }],
          type: 'asset',
        }),
        prompt('27', '以图 1 为空间基础，融合图 2 的设计语言和图 3 的材质'),
        seed('4', 'noise_seed', 103_363_765_063_060),
        steps('8'),
      ],
    },
    workflow: {
      code: 'flux2-klein-multi-image-edit',
      description: 'Flux2 Klein 双图与三图参考融合工作流。',
      name: 'Flux2 Klein 多图融合',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#a23d4f',
      description: '在带透明遮罩的客室图像上精确替换指定区域。',
      icon: 'lucide:paintbrush',
      key: 'inpaint-single',
      name: '单图局部重绘',
      outputAssetTypes: ['image'],
      shortName: '重绘',
    },
    capability: {
      description: '使用 PNG Alpha 遮罩进行单图局部重绘。',
      name: '单图局部重绘',
    },
    fileName: 'inpaint-single-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('363', 'images', 'image', ['ComfyUI', '局部重绘'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          help: '可在工作区中绘制透明遮罩并保存为新资产。',
          key: 'maskedImage',
          label: '底图与遮罩',
          targets: [{ inputName: 'image', nodeId: '368' }],
          type: 'mask',
        }),
        prompt('366', '将遮罩区域替换为与周边光线、材质和透视一致的设计'),
        scalar({
          advanced: true,
          defaultValue: 10,
          inputName: 'grow',
          integer: true,
          key: 'maskGrow',
          label: '遮罩扩展',
          max: 200,
          min: 0,
          nodeId: '367',
          step: 1,
          type: 'number',
        }),
        scalar({
          advanced: true,
          defaultValue: 30,
          inputName: 'blur',
          integer: true,
          key: 'maskBlur',
          label: '遮罩羽化',
          max: 200,
          min: 0,
          nodeId: '367',
          step: 1,
          type: 'number',
        }),
        seed('345', 'noise_seed', 747_524_662_011_977),
        steps('349'),
      ],
    },
    workflow: {
      code: 'flux2-klein-inpaint-single',
      description: 'Flux2 Klein 单图透明遮罩局部重绘工作流。',
      name: 'Flux2 Klein 单图局部重绘',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#945464',
      description: '在底图遮罩区域中引入另一张座椅或材质参考图。',
      icon: 'lucide:blend',
      key: 'inpaint-reference',
      name: '参考图局部重绘',
      outputAssetTypes: ['image'],
      shortName: '参考重绘',
    },
    capability: {
      description: '基于透明遮罩和参考图的局部替换。',
      name: '参考图局部重绘',
    },
    fileName: 'inpaint-reference-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('370', 'images', 'image', ['ComfyUI', '参考重绘'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'maskedImage',
          label: '底图与遮罩',
          targets: [{ inputName: 'image', nodeId: '373' }],
          type: 'mask',
        }),
        media({
          assetIndex: 1,
          key: 'referenceImage',
          label: '替换参考',
          targets: [{ inputName: 'image', nodeId: '371' }],
          type: 'asset',
        }),
        prompt(
          '372',
          '将遮罩区域替换为参考图中的设计对象，保持空间透视与光线一致',
        ),
        scalar({
          advanced: true,
          defaultValue: 10,
          inputName: 'grow',
          integer: true,
          key: 'maskGrow',
          label: '遮罩扩展',
          max: 200,
          min: 0,
          nodeId: '368',
          step: 1,
          type: 'number',
        }),
        scalar({
          advanced: true,
          defaultValue: 30,
          inputName: 'blur',
          integer: true,
          key: 'maskBlur',
          label: '遮罩羽化',
          max: 200,
          min: 0,
          nodeId: '368',
          step: 1,
          type: 'number',
        }),
        seed('345', 'noise_seed', 832_530_082_850_555),
        steps('349'),
      ],
    },
    workflow: {
      code: 'flux2-klein-inpaint-reference',
      description: 'Flux2 Klein 底图遮罩与第二参考图局部重绘工作流。',
      name: 'Flux2 Klein 参考局部重绘',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#80633d',
      description: '向图像四周扩展画布，保持原有客室结构、光线与材质连续。',
      icon: 'lucide:expand',
      key: 'outpaint',
      name: '智能扩图',
      outputAssetTypes: ['image'],
      shortName: '扩图',
    },
    capability: {
      description: '可控四边尺寸的 Flux2 外补画。',
      name: '智能扩图',
    },
    fileName: 'outpaint-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('366', 'images', 'image', ['ComfyUI', '扩图'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'sourceImage',
          label: '原始图像',
          targets: [{ inputName: 'image', nodeId: '369' }],
          type: 'asset',
        }),
        prompt('367', '延展原图中的客室结构、顶板、地板与灯光'),
        ...[
          ['left', '左侧扩展', 504],
          ['top', '上方扩展', 0],
          ['right', '右侧扩展', 504],
          ['bottom', '下方扩展', 0],
        ].map(([inputName, label, defaultValue]) =>
          scalar({
            defaultValue,
            inputName: String(inputName),
            integer: true,
            key: `pad${String(inputName)[0]?.toUpperCase()}${String(inputName).slice(1)}`,
            label: String(label),
            max: 2048,
            min: 0,
            nodeId: '368',
            step: 8,
            type: 'number',
          }),
        ),
        scalar({
          advanced: true,
          defaultValue: 40,
          inputName: 'feathering',
          integer: true,
          key: 'feathering',
          label: '边缘羽化',
          max: 512,
          min: 0,
          nodeId: '368',
          step: 1,
          type: 'number',
        }),
        seed('346', 'noise_seed', 315_426_460_614_194),
        steps('350'),
      ],
    },
    workflow: {
      code: 'flux2-klein-outpaint',
      description: 'Flux2 Klein 四向外补画工作流。',
      name: 'Flux2 Klein 智能扩图',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#9a573c',
      description: '用颜色区域标记客室部件，通过指令一次替换多个分区。',
      icon: 'lucide:square-dashed-mouse-pointer',
      key: 'region-edit',
      name: '分区设计编辑',
      outputAssetTypes: ['image'],
      shortName: '分区',
    },
    capability: {
      description: '基于 EasyMark 颜色笔画的分区编辑。',
      name: '分区设计编辑',
    },
    fileName: 'region-edit-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('293', 'images', 'image', ['ComfyUI', '分区编辑'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          help: '在画布中用不同颜色绘制需要独立编辑的区域。',
          inputName: 'brush_data',
          key: 'regionMarks',
          label: '颜色分区',
          nodeId: '273',
          targets: [
            {
              inputName: 'image_base64',
              nodeId: '273',
              transport: 'data-url',
            },
          ],
          type: 'region',
        }),
        scalar({
          defaultValue: '红色区域替换为座椅，蓝色区域替换为扶手',
          inputName: 'prompt',
          key: 'prompt',
          label: '分区编辑指令',
          maxLength: 6000,
          nodeId: '291',
          required: true,
          type: 'textarea',
        }),
        seed('293', 'seed', 396),
      ],
    },
    workflow: {
      code: 'flux2-klein-region-edit',
      description: 'EasyMark 颜色区域驱动的 Flux2 分区编辑工作流。',
      name: 'Flux2 Klein 分区编辑',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#8b6332',
      description:
        '使用颜色和编号标记座椅、扶手、地板等部件，精确描述每个编辑目标。',
      icon: 'lucide:tags',
      key: 'region-marker-edit',
      name: '编号分区编辑',
      outputAssetTypes: ['image'],
      shortName: '标记',
    },
    capability: {
      description: '基于 EasyMark 颜色与编号笔画的分区编辑。',
      name: '编号分区编辑',
    },
    fileName: 'region-marker-edit-v1.json',
    version: {
      modelRequirements: fluxModels,
      outputSchema: [output('366', 'images', 'image', ['ComfyUI', '编号分区'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          inputName: 'brush_data',
          key: 'regionMarks',
          label: '颜色与编号分区',
          nodeId: '362',
          targets: [
            {
              inputName: 'image_base64',
              nodeId: '362',
              transport: 'data-url',
            },
          ],
          type: 'region',
        }),
        scalar({
          defaultValue: '黑色 1 区域替换为座椅，绿色 2 区域替换为扶手',
          inputName: 'prompt',
          key: 'prompt',
          label: '标记编辑指令',
          maxLength: 6000,
          nodeId: '363',
          required: true,
          type: 'textarea',
        }),
        seed('359', 'seed', 396),
      ],
    },
    workflow: {
      code: 'flux2-klein-region-marker-edit',
      description: 'EasyMark 编号区域驱动的 Flux2 分区编辑工作流。',
      name: 'Flux2 Klein 编号分区编辑',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'generation',
      color: '#39705a',
      description: '从前、左、后、右四个视角的设计图生成可复用 GLB 三维资产。',
      icon: 'lucide:box',
      key: 'multiview-to-3d',
      name: '多视图生三维',
      outputAssetTypes: ['model3d'],
      shortName: '3D',
    },
    capability: {
      description: '使用 Hunyuan3D 从四向参考图生成 GLB 模型。',
      name: '多视图生三维',
    },
    fileName: 'multiview-to-3d-v1.json',
    version: {
      modelRequirements: ['hunyuan3d-dit-v2-mv.safetensors'],
      outputSchema: [output('83', '3d', 'model3d', ['ComfyUI', 'Hunyuan3D'])],
      parameterSchema: [
        ...[
          [0, 'frontImage', '正视图', '56'],
          [1, 'leftImage', '左视图', '78'],
          [2, 'backImage', '后视图', '80'],
          [3, 'rightImage', '右视图', '87'],
        ].map(([assetIndex, key, label, nodeId]) =>
          media({
            assetIndex: Number(assetIndex),
            key: String(key),
            label: String(label),
            targets: [{ inputName: 'image', nodeId: String(nodeId) }],
            type: 'asset',
          }),
        ),
        seed('3', 'seed', 6_613_259_102_760),
        steps('3', 20),
        scalar({
          advanced: true,
          defaultValue: 7.5,
          inputName: 'cfg',
          key: 'cfg',
          label: '引导强度',
          max: 30,
          min: 0,
          nodeId: '3',
          step: 0.1,
          type: 'number',
        }),
        scalar({
          advanced: true,
          defaultValue: 3072,
          inputName: 'resolution',
          integer: true,
          key: 'resolution',
          label: '体素分辨率',
          max: 8192,
          min: 512,
          nodeId: '66',
          step: 256,
          type: 'number',
        }),
      ],
    },
    workflow: {
      code: 'hunyuan3d-multiview',
      description: 'Hunyuan3D v2 四向图像生成 GLB 工作流。',
      name: 'Hunyuan3D 多视图生三维',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'generation',
      color: '#477184',
      description:
        '读取客室、部件或材质图像，生成可检索、可复用的详细文本描述。',
      icon: 'lucide:scan-search',
      key: 'image-understanding',
      name: '图片理解',
      outputAssetTypes: ['text'],
      shortName: '理解',
    },
    capability: {
      description: '使用 Qwen3.5 将图像转换为详细文本资产。',
      name: '图片理解',
    },
    fileName: 'image-understanding-v1.json',
    version: {
      modelRequirements: ['qwen3.5_4b_bf16.safetensors'],
      outputSchema: [output('4', 'text', 'text', ['ComfyUI', '图片理解'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'sourceImage',
          label: '待理解图像',
          targets: [{ inputName: 'image', nodeId: '2' }],
          type: 'asset',
        }),
        scalar({
          defaultValue:
            '详细描述图像中的客室结构、部件、材质、色彩、光线、视角与可见文字。',
          inputName: 'prompt',
          key: 'prompt',
          label: '理解任务',
          maxLength: 4000,
          nodeId: '3',
          required: true,
          type: 'textarea',
        }),
        scalar({
          advanced: true,
          defaultValue: 512,
          inputName: 'max_length',
          integer: true,
          key: 'maxLength',
          label: '最大输出长度',
          max: 8192,
          min: 64,
          nodeId: '3',
          step: 64,
          type: 'number',
        }),
      ],
    },
    workflow: {
      code: 'qwen35-image-understanding',
      description: 'Qwen3.5 图片理解与 PreviewAny 文本输出工作流。',
      name: 'Qwen3.5 图片理解',
    },
  },
  {
    application: {
      acceptedAssetTypes: [],
      category: 'generation',
      color: '#5c6670',
      description: '面向设计推理、方案说明与工程问题的持久文本任务。',
      icon: 'lucide:messages-square',
      key: 'text-chat',
      name: '文本生成',
      outputAssetTypes: ['text'],
      shortName: '文本',
    },
    capability: {
      description: '使用 Qwen3 生成可登记为项目资产的文本。',
      name: '文本生成',
    },
    fileName: 'text-chat-v1.json',
    version: {
      modelRequirements: ['qwen_3_4b.safetensors'],
      outputSchema: [output('5', 'text', 'text', ['ComfyUI', '文本生成'])],
      parameterSchema: [
        scalar({
          defaultValue:
            '编写一份轨道客室设计方案说明，包含空间、人机、材质与维护考量。',
          inputName: 'prompt',
          key: 'prompt',
          label: '任务说明',
          maxLength: 12_000,
          nodeId: '7',
          required: true,
          type: 'textarea',
        }),
        scalar({
          advanced: true,
          defaultValue: 2048,
          inputName: 'max_length',
          integer: true,
          key: 'maxLength',
          label: '最大输出长度',
          max: 16_384,
          min: 64,
          nodeId: '7',
          step: 64,
          type: 'number',
        }),
        scalar({
          advanced: true,
          defaultValue: 0.7,
          inputName: 'sampling_mode.temperature',
          key: 'temperature',
          label: '创意度',
          max: 2,
          min: 0,
          nodeId: '7',
          step: 0.05,
          type: 'number',
        }),
      ],
    },
    workflow: {
      code: 'qwen3-text-generation',
      description: 'Qwen3 文本生成与 PreviewAny 文本输出工作流。',
      name: 'Qwen3 文本生成',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#956a2f',
      description: '修复小尺寸或低清客室图像，放大细节并登记新版本资产。',
      icon: 'lucide:zoom-in',
      key: 'image-upscale',
      name: '图像放大修复',
      outputAssetTypes: ['image'],
      shortName: '放大',
    },
    capability: {
      description: '使用 HYPIR 放大并修复输入图像。',
      name: '图像放大修复',
    },
    fileName: 'image-upscale-v1.json',
    version: {
      modelRequirements: ['HYPIR_sd2', 'stable-diffusion-2-1-base'],
      outputSchema: [output('90', 'images', 'image', ['ComfyUI', '放大修复'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'sourceImage',
          label: '原始图像',
          targets: [{ inputName: 'image', nodeId: '87' }],
          type: 'asset',
        }),
        scalar({
          defaultValue: '高质量工业设计图像，边缘清晰，材质细节真实',
          inputName: 'prompt',
          key: 'prompt',
          label: '修复指令',
          maxLength: 2000,
          nodeId: '89',
          type: 'textarea',
        }),
        scalar({
          defaultValue: 4,
          inputName: 'upscale_factor',
          integer: true,
          key: 'upscaleFactor',
          label: '放大倍数',
          max: 8,
          min: 1,
          nodeId: '89',
          step: 1,
          type: 'number',
        }),
        seed('89', 'seed', 82_016_038_556_410),
      ],
    },
    workflow: {
      code: 'hypir-image-upscale',
      description: 'HYPIR 高级图像放大与修复工作流。',
      name: 'HYPIR 图像放大修复',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#2f6578',
      description: '从单张座椅或内饰图生成指定水平、俯仰和缩放的新镜头。',
      icon: 'lucide:camera',
      key: 'camera-control-single',
      name: '单视角镜头控制',
      outputAssetTypes: ['image'],
      shortName: '单角度',
    },
    capability: {
      description: '使用 Qwen Image Edit 生成单个可控镜头视角。',
      name: '单视角镜头控制',
    },
    fileName: 'camera-control-single-v1.json',
    version: {
      modelRequirements: [
        'qwen_2.5_vl_7b_fp8_scaled.safetensors',
        'qwen_image_vae.safetensors',
        'qwen_image_edit_2511_bf16.safetensors',
        'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-BF16_千问2511-8步-fp32.safetensors',
        'Qwen-Image-Edit-2511-多角度镜头控制_v1.safetensors',
      ],
      outputSchema: [output('36', 'images', 'image', ['ComfyUI', '镜头控制'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'sourceImage',
          label: '原始视图',
          targets: [
            { inputName: 'image', nodeId: '20' },
            { inputName: 'image', nodeId: '85:50' },
          ],
          type: 'asset',
        }),
        ...[
          [
            'horizontal_angle',
            'horizontalAngle',
            '水平角度',
            180,
            -180,
            360,
            5,
          ],
          ['vertical_angle', 'verticalAngle', '俯仰角度', 30, -90, 90, 5],
          ['zoom', 'zoom', '镜头距离', 1, 0.1, 10, 0.1],
        ].map(([inputName, key, label, defaultValue, min, max, step]) =>
          scalar({
            defaultValue,
            inputName: String(inputName),
            key: String(key),
            label: String(label),
            max: Number(max),
            min: Number(min),
            nodeId: '22',
            step: Number(step),
            type: 'number',
            uiControl: cameraControl(inputName),
            uiGroup: '镜头 1',
          }),
        ),
        seed('27', 'seed', 449_781_229_599_932),
        steps('27', 8),
      ],
    },
    workflow: {
      code: 'qwen2511-camera-control-single',
      description: 'Qwen Image Edit 2511 单镜头视角控制工作流。',
      name: 'Qwen 2511 单视角镜头控制',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#3d7182',
      description: '从单张设计图批量生成前、后、左、右与斜视角图像。',
      icon: 'lucide:orbit',
      key: 'camera-control-multi',
      name: '多视角镜头生成',
      outputAssetTypes: ['image'],
      shortName: '多角度',
    },
    capability: {
      description: '使用 Qwen Image Edit 批量生成多镜头视角。',
      name: '多视角镜头生成',
    },
    fileName: 'camera-control-multi-v1.json',
    version: {
      modelRequirements: [
        'qwen_2.5_vl_7b_fp8_scaled.safetensors',
        'qwen_image_vae.safetensors',
        'qwen_image_edit_2511_bf16.safetensors',
        'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-BF16_千问2511-8步-fp32.safetensors',
        'Qwen-Image-Edit-2511-多角度镜头控制_v1.safetensors',
      ],
      outputSchema: [output('76', 'images', 'image', ['ComfyUI', '多视角'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'sourceImage',
          label: '原始视图',
          targets: [{ inputName: 'image', nodeId: '77' }],
          type: 'asset',
        }),
        seed('69', 'seed', 548_529_062_549_855),
        steps('69', 8),
        scalar({
          advanced: true,
          defaultValue: 1,
          inputName: 'cfg',
          key: 'cfg',
          label: '引导强度',
          max: 20,
          min: 0,
          nodeId: '69',
          step: 0.1,
          type: 'number',
        }),
      ],
    },
    workflow: {
      code: 'qwen2511-camera-control-multi',
      description: 'Qwen Image Edit 2511 多镜头视角批量生成工作流。',
      name: 'Qwen 2511 多视角镜头生成',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#516675',
      description: '使用基础编辑模型融合底图与参考图，适合相机与空间构图变更。',
      icon: 'lucide:panels-top-left',
      key: 'image-edit-base',
      name: '双图基础编辑',
      outputAssetTypes: ['image'],
      shortName: '基础编辑',
    },
    capability: {
      description: 'Flux2 Klein Base 双图指令编辑。',
      name: '双图基础编辑',
    },
    fileName: 'image-edit-base-v1.json',
    version: {
      modelRequirements: [
        'flux-2-klein-base-9b-fp8.safetensors',
        'qwen_3_8b_fp8mixed.safetensors',
        'full_encoder_small_decoder.safetensors',
      ],
      outputSchema: [output('9', 'images', 'image', ['ComfyUI', '双图编辑'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'baseImage',
          label: '基础图像',
          targets: [{ inputName: 'image', nodeId: '76' }],
          type: 'asset',
        }),
        media({
          assetIndex: 1,
          key: 'referenceImage',
          label: '参考图像',
          targets: [{ inputName: 'image', nodeId: '81' }],
          type: 'asset',
        }),
        scalar({
          defaultValue: '保持图 1 主体结构，参考图 2 调整镜头、材质或部件。',
          inputName: 'text',
          key: 'prompt',
          label: '编辑指令',
          maxLength: 6000,
          nodeId: '75:74',
          required: true,
          type: 'textarea',
        }),
        scalar({
          advanced: true,
          defaultValue: '',
          inputName: 'text',
          key: 'negativePrompt',
          label: '负向提示词',
          maxLength: 4000,
          nodeId: '75:67',
          type: 'textarea',
        }),
        seed('75:73', 'noise_seed', 192_774_551_144_773),
        steps('75:62', 20),
      ],
    },
    workflow: {
      code: 'flux2-klein-image-edit-base',
      description: 'Flux2 Klein Base 9B 双图编辑工作流。',
      name: 'Flux2 Klein Base 双图编辑',
    },
  },
  {
    application: {
      acceptedAssetTypes: ['image'],
      category: 'design',
      color: '#587066',
      description: '使用 KV 缓存模型高效融合底图与参考图，适合多轮设计迭代。',
      icon: 'lucide:layers',
      key: 'image-edit-kv',
      name: 'KV 双图编辑',
      outputAssetTypes: ['image'],
      shortName: 'KV',
    },
    capability: {
      description: 'Flux2 Klein KV Cache 双图指令编辑。',
      name: 'KV 双图编辑',
    },
    fileName: 'image-edit-kv-v1.json',
    version: {
      modelRequirements: [
        'flux-2-klein-9b-kv-fp8.safetensors',
        'qwen_3_8b_fp8mixed.safetensors',
        'flux2-vae.safetensors',
      ],
      outputSchema: [output('94', 'images', 'image', ['ComfyUI', 'KV 编辑'])],
      parameterSchema: [
        media({
          assetIndex: 0,
          key: 'baseImage',
          label: '基础图像',
          targets: [{ inputName: 'image', nodeId: '76' }],
          type: 'asset',
        }),
        media({
          assetIndex: 1,
          key: 'referenceImage',
          label: '参考图像',
          targets: [{ inputName: 'image', nodeId: '81' }],
          type: 'asset',
        }),
        scalar({
          defaultValue:
            '以图 1 为底图，保持客室结构和视角，融合图 2 的设计元素。',
          inputName: 'text',
          key: 'prompt',
          label: '编辑指令',
          maxLength: 6000,
          nodeId: '135',
          required: true,
          type: 'textarea',
        }),
        seed('125', 'noise_seed', 268_977_492_015_116),
        steps('137'),
      ],
    },
    workflow: {
      code: 'flux2-klein-image-edit-kv',
      description: 'Flux2 Klein 9B KV Cache 双图编辑工作流。',
      name: 'Flux2 Klein KV 双图编辑',
    },
  },
];

const OUTPAINT_REQUIRED_PROMPT_PREFIX =
  '删除红色扩展标记区域，并参考原图内容向画布外自然延展。不要保留红色、纯色边框或遮罩痕迹。具体设计要求：';

export const WORKFLOW_CATALOG: WorkflowCatalogEntry[] =
  WORKFLOW_CATALOG_BASE.map((entry) => ({
    ...entry,
    version: {
      ...entry.version,
      parameterSchema: (
        generatedParameterSchemas[
          entry.application.key as keyof typeof generatedParameterSchemas
        ] ?? entry.version.parameterSchema
      ).map((field) =>
        entry.application.key === 'outpaint' && field.key === 'prompt'
          ? {
              ...field,
              help: '平台会自动附加清除红色扩展标记的必要指令；这里只需描述希望延展出的设计内容。',
              valuePrefix: OUTPAINT_REQUIRED_PROMPT_PREFIX,
            }
          : field,
      ),
    },
  }));
