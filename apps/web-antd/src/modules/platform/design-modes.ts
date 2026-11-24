import type { PlatformApplication } from './types';

import { assetTypeIcons } from '#/modules/platform/asset-types';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { platformUiIcons } from '#/modules/platform/ui-icons';

import { referenceImageEditKey } from './design-generation';
import { localImageEditKey } from './local-image-edit';

export type DesignModeKey = 'cabin' | 'cmf' | 'component' | 'report';

export interface DesignModeToolDefinition {
  appKey: string;
  icon: string;
  key: string;
  label: string;
  placeholder?: string;
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
    localImageEditKey,
    'region-marker-edit',
    'inpaint-single',
    'multi-image-edit',
    'single-image-edit',
    'image-upscale',
    'image-understanding',
    'camera-control-multi',
    'text-chat',
    'outpaint',
    'inpaint-reference',
    'region-edit',
    'camera-control-single',
  ],
  backgroundImage: '/design-modes/cabin.webp',
  defaultApplicationKey: 'text-to-image',
  description: '生成和深化客室整体空间、镜头、环境与材料效果。',
  icon: platformSemanticIcons.cabin,
  key: 'cabin',
  label: '客室效果生成',
  placeholder:
    '描述你的设计需求，如生成客室类型、画面角度、部件颜色、材质、图像尺寸等……',
  primaryTools: [
    {
      appKey: 'text-to-image',
      icon: platformUiIcons.imagePlus,
      key: 'text-to-image',
      label: '文生图',
    },
    {
      appKey: 'region-marker-edit',
      icon: platformUiIcons.tags,
      key: 'marker-generate',
      label: '区域标记',
    },
    {
      appKey: referenceImageEditKey,
      icon: platformUiIcons.pencil,
      key: 'image-edit',
      label: '图片编辑',
    },
    {
      appKey: 'inpaint-single',
      icon: platformSemanticIcons.mask,
      key: 'inpaint-single',
      label: '局部重绘',
    },
    {
      appKey: 'multi-image-edit',
      icon: platformUiIcons.images,
      key: 'material-fusion',
      label: '部件/材质融合',
    },
    {
      appKey: 'single-image-edit',
      icon: platformUiIcons.map,
      key: 'floor-plan-coloring',
      label: '平面图填色',
      placeholder:
        '上传客室平面图，并描述需要填充的区域、颜色、材质及整体风格……',
    },
    {
      appKey: 'image-upscale',
      icon: platformUiIcons.zoomIn,
      key: 'image-upscale',
      label: '图像放大',
    },
    {
      appKey: 'image-understanding',
      icon: platformUiIcons.scanSearch,
      key: 'image-understanding',
      label: '图像理解',
    },
  ],
};

export const designModes: readonly DesignModeDefinition[] = [
  defaultDesignMode,
  {
    applicationKeys: [
      'text-to-image',
      localImageEditKey,
      'inpaint-single',
      'region-marker-edit',
      'multi-image-edit',
      'camera-control-multi',
      'multiview-to-3d',
      'image-upscale',
      'image-understanding',
      'text-chat',
      'outpaint',
      'single-image-edit',
      'inpaint-reference',
    ],
    backgroundImage: '/design-modes/component.webp',
    defaultApplicationKey: 'text-to-image',
    description: '生成座椅、桌板、行李架等客室零部件及多视角方案。',
    icon: platformSemanticIcons.component,
    key: 'component',
    label: '客室零部件生成',
    placeholder:
      '描述你的设计需求，如生成部件类型、角度、颜色、表面材质、图像尺寸等……',
    primaryTools: [
      {
        appKey: 'text-to-image',
        icon: platformUiIcons.imagePlus,
        key: 'text-to-image',
        label: '文生图',
      },
      {
        appKey: 'inpaint-single',
        icon: platformSemanticIcons.mask,
        key: 'inpaint-single',
        label: '局部重绘',
      },
      {
        appKey: 'region-marker-edit',
        icon: platformUiIcons.tags,
        key: 'marker-edit',
        label: '区域标记',
      },
      {
        appKey: 'multi-image-edit',
        icon: platformUiIcons.images,
        key: 'multi-image-edit',
        label: '多图融合',
      },
      {
        appKey: 'camera-control-multi',
        icon: platformUiIcons.orbit,
        key: 'camera-control-multi',
        label: '多角度生成',
      },
      {
        appKey: 'multiview-to-3d',
        icon: assetTypeIcons.model3d,
        key: 'multiview-to-3d',
        label: '三维生成',
      },
      {
        appKey: 'image-upscale',
        icon: platformUiIcons.zoomIn,
        key: 'image-upscale',
        label: '图像放大',
      },
      {
        appKey: 'image-understanding',
        icon: platformUiIcons.scanSearch,
        key: 'image-understanding',
        label: '图片理解',
      },
    ],
  },
  {
    applicationKeys: [
      'text-to-image',
      localImageEditKey,
      'inpaint-single',
      'multi-image-edit',
      'image-upscale',
      'image-understanding',
      'text-chat',
      'outpaint',
      'single-image-edit',
      'inpaint-reference',
      'image-edit-kv',
    ],
    backgroundImage: '/design-modes/cmf.webp',
    defaultApplicationKey: 'text-to-image',
    description: '生成连续纹样、颜色、面料材质与表面图案方案。',
    icon: platformSemanticIcons.cmf,
    key: 'cmf',
    label: 'CMF生成',
    placeholder:
      '描述你的设计需求，如生成二方连续/四方连续、颜色、面料材质、图案形式、风格、图像尺寸的纹样……',
    primaryTools: [
      {
        appKey: 'text-to-image',
        icon: platformUiIcons.imagePlus,
        key: 'text-to-image',
        label: '文生图',
      },
      {
        appKey: 'inpaint-single',
        icon: platformSemanticIcons.mask,
        key: 'inpaint-single',
        label: '局部重绘',
      },
      {
        appKey: 'multi-image-edit',
        icon: platformUiIcons.images,
        key: 'multi-image-edit',
        label: '多图融合',
      },
      {
        appKey: 'image-upscale',
        icon: platformUiIcons.zoomIn,
        key: 'image-upscale',
        label: '图像放大',
      },
      {
        appKey: 'image-understanding',
        icon: platformUiIcons.scanSearch,
        key: 'image-understanding',
        label: '图片理解',
      },
    ],
  },
  {
    applicationKeys: ['report-generator'],
    backgroundImage: '/design-modes/report.webp',
    description: '组合项目资产与说明，生成结构化 Word、PPT 或 Markdown 报告。',
    icon: platformSemanticIcons.report,
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
  if (applicationKey === 'report-generator') return getDesignMode('report');
  return getDesignMode(currentModeKey === 'report' ? 'cabin' : currentModeKey);
}

export function applicationsForDesignMode(
  applications: readonly PlatformApplication[],
  mode: DesignModeDefinition,
) {
  const positions = new Map(
    mode.applicationKeys.map((key, index) => [key, index]),
  );
  const configuredPosition = (app: PlatformApplication) =>
    app.designModes && mode.key !== 'report'
      ? app.designModes[mode.key]?.order
      : positions.get(app.key);
  return applications
    .filter(
      (app) =>
        app.visible &&
        app.capabilityCode &&
        !['screen-capture-edit', 'text-chat'].includes(app.key) &&
        configuredPosition(app) !== undefined,
    )
    .toSorted(
      (a, b) => (configuredPosition(a) ?? 0) - (configuredPosition(b) ?? 0),
    );
}

// Built-in defaults describe the requested design task, never project facts or
// unverified safety/performance claims. Administrator defaults and saved drafts win.
const modePromptPresets = {
  cabin: {
    'text-to-image':
      '设计现代轨道交通客室内装，以沿中央通道的人眼视角展示完整空间，明确座椅、侧墙、顶板、地板和行李架的层次与衔接。采用协调的低饱和配色、真实材料和柔和照明，保持透视合理、通道清晰，输出无文字、无标号的工业设计效果图。',
    'single-image-edit':
      '以图1为客室底图，保留原有空间布局、主体数量和观察视角，优化座椅、内装配色及材料搭配，使部件衔接、透视和光照协调。仅调整设计内容，保留其余结构，不添加文字或标号。',
    'image-edit-kv':
      '以图1为客室空间底图，以图2为造型与设计语言参考，将参考特征融入图1的内装方案。保持图1的通道、主体布局和视角，使新增设计与原有尺度、透视、材料及照明协调，不拼贴参考图，不添加文字或标号。',
    'multi-image-edit':
      '以图1为客室空间底图，参考图2的部件造型与设计语言，采用图3的配色和表面材质。保留图1的空间布局、主体数量和视角，将造型与材质自然应用到对应部件，统一尺度、透视与光照，不添加文字或标号。',
    'inpaint-single':
      '仅修改遮罩覆盖的客室区域，使新设计与周围部件的尺度、透视、材质和光照自然衔接。保留未遮罩区域的空间结构、主体及细节，不引入无关部件、文字或标号。',
    'inpaint-reference':
      '仅修改图1的遮罩区域，参考图2的造型、配色或材质完成替换，并与图1周边的尺度、透视和光照自然衔接。图2只作为设计参考，保留图1未遮罩区域，不复制参考背景或添加文字。',
    'region-marker-edit':
      '依据各区域的单独修改要求调整客室设计；未单独填写的区域，统一优化该区域的部件造型、配色与材料。保持原有空间尺度、透视及光照，保护未标记区域，输出中不保留辅助色块、方框或编号。',
    outpaint:
      '仅在所设置的扩展画布范围内自然延续原客室图像，根据画面边缘已有内容衔接墙面、顶板、地板、座椅和照明。延续原有透视、材料、光照及细节密度，保留原图内容，不无故增加主体或添加文字。',
    'image-upscale':
      '在保留客室原有布局、物体数量、形状、配色和视角的前提下提升清晰度，恢复材料纹理、部件边缘与细节层次。避免过度锐化和虚构结构，不添加新的部件、文字或标号。',
    'image-understanding':
      '分析图中可见的轨道客室布局、座椅与内装部件、配色、材质外观、照明及视角，并指出可见的设计问题和可执行的改进方向。区分直接观察与推测；无法从图片确认的尺寸、材料规格、性能及合规情况应明确说明，不编造结论。',
  },
  component: {
    'text-to-image':
      '设计一款轨道客室座椅，以单一部件为主体，采用完整的三分之四视角和简洁中性背景，清晰展示靠背、坐垫、扶手、支撑及连接关系。造型协调、材料表现真实，主体完整且不被裁切，不加入客室场景、尺寸标注或装饰文字。',
    'single-image-edit':
      '以图1中的零部件为主体，保留其数量、主要轮廓、结构连接及观察方向，优化局部造型、配色和表面材料。完整展示部件，使连接与材质过渡自然，保持简洁背景，不添加无关部件或文字标注。',
    'image-edit-kv':
      '以图1为待调整的零部件，以图2为造型、配色或表面材料参考，将参考特征应用到图1主体。保留图1的部件数量、主要结构、连接关系和视角，使造型与材料衔接自然，不拼接参考背景或增加文字。',
    'multi-image-edit':
      '以图1为目标零部件，参考图2的造型特征，采用图3的配色和表面材质。保留图1的主体数量、主要结构、连接关系和视角，完整展示部件，避免多余支撑、重复部件、背景拼贴及文字标注。',
    'inpaint-single':
      '仅调整遮罩内的零部件局部，使造型、连接关系、配色和表面材料与原部件自然衔接。保留未遮罩的结构、轮廓、主体数量与观察方向，不增加无关部件或文字。',
    'inpaint-reference':
      '仅修改图1零部件的遮罩区域，参考图2的局部造型、配色或材质完成设计调整。保持图1的主体、连接关系、视角及未遮罩结构，避免复制图2背景、增加重复部件或文字。',
    'region-marker-edit':
      '按照各标记区域的修改要求调整对应零部件局部；未单独填写的区域，统一优化该区域的造型、配色和表面材料。保持部件主要结构、连接关系与观察方向，保护未标记区域，不保留辅助色块、方框或编号。',
    outpaint:
      '仅在扩展画布内延续原有背景、投影以及边缘已经出现的零部件轮廓，使原主体得到完整、协调的展示。保持原部件数量、结构比例、观察方向和光照，不虚构被遮挡的内部机构，不添加其他部件或文字。',
    'image-upscale':
      '保持零部件原有轮廓、数量、结构连接、材料和视角，提升边缘、接缝及表面肌理的清晰度。避免改变尺寸比例、增加结构细节或生成虚构的尺寸标注。',
    'image-understanding':
      '描述图中可见零部件的类别、外形、组成、连接方式、配色、表面材料特征及展示角度，并给出可从图像支持的设计改进建议。未知尺寸、隐藏结构、承载能力、材料牌号和认证情况明确标为无法确认，不编造工程参数。',
  },
  cmf: {
    'text-to-image':
      '为轨道客室座椅面料设计四方连续平铺纹样，以协调的低饱和配色、适度的图案尺度和清晰的织物肌理呈现。采用正面平视、均匀照明，使相对边缘的图案衔接自然；画面从左到右、从上到下全部填满同一平整纹样，图案延伸并越过画面边界；不留白边，不展示圆角样卡或布料边缘，不使用投影、聚光或渐变背景，不加入座椅、室内场景、褶皱、透视变形或文字。',
    'single-image-edit':
      '以图1为待调整的纹样或材质，保留主要图案结构、重复节奏及纹理尺度，优化配色、图案细节与表面肌理。保持平整、正面平视和均匀照明，不引入客室场景、立体产品、褶皱或文字。',
    'image-edit-kv':
      '以图1为纹样或材质底图，以图2为配色和表面肌理参考，将参考特征融入图1。保留图1的图案组织、重复节奏与纹理尺度，避免直接拼贴，保持平整展示、均匀照明和自然的边缘延续，不添加产品场景或文字。',
    'multi-image-edit':
      '以图1的图案组织和重复节奏为基础，参考图2的配色方案，融合图3的表面肌理与材料质感。统一图案尺度、纹理方向和色彩关系，平整呈现可平铺的纹样或材质，不拼贴三张原图，不引入座椅、客室场景或文字。',
    'inpaint-single':
      '仅修改遮罩内的颜色、图案或表面肌理，使其与周边纹样的重复节奏、纹理方向、尺度和色调自然衔接。保留未遮罩区域，保持平整材质展示，不生成客室、零部件、褶皱或文字。',
    'inpaint-reference':
      '仅修改图1的遮罩区域，参考图2的配色或材质肌理，保持与图1周边图案的重复节奏、纹理方向和尺度一致。保护未遮罩内容，不直接拼贴参考图，不引入立体产品、空间背景或文字。',
    'region-marker-edit':
      '按各标记区域要求调整对应颜色、纹样或材质肌理；未单独填写的区域，统一优化其配色与肌理细节。保持整体重复节奏、纹理方向、尺度和边界衔接，保护未标记区域，不保留辅助标记，不引入产品或室内场景。',
    outpaint:
      '仅在扩展画布内延续原图的纹样或材质，保持重复节奏、图案尺度、纹理方向、配色和均匀照明，并使新旧边界自然衔接。保留原图，不将平面纹样转换成立体物体、座椅或客室场景，不添加文字。',
    'image-upscale':
      '在保持原有配色、重复周期、图案尺度和纹理方向的前提下提升纹样与材料肌理的清晰度，保留细微色差和表面质感。避免新增图案、破坏重复关系、过度锐化或引入物体及文字。',
    'image-understanding':
      '分析图中可见的主辅色关系、图案组织、重复方式、尺度感、纹理方向、光泽与表面肌理，并给出适用于轨道内装CMF设计的调整建议。区分可见外观与材料性能；不得仅凭图片断定成分、耐磨、阻燃或其他检测认证结果。',
  },
} as const;

export function designModeDefaultPrompt(
  mode: DesignModeKey,
  appKey: string,
  toolKey?: string,
): string | undefined {
  if (mode === 'report') return undefined;
  if (
    mode === 'cabin' &&
    appKey === 'single-image-edit' &&
    toolKey === 'floor-plan-coloring'
  )
    return '以图1的客室平面图为基础，仅为已有分区、座椅及内装构件填充协调的颜色与材质。保持俯视投影、原有线稿、布局、比例、开口及通道位置，不转换为透视效果图，不新增构件或文字标注。';
  let key = appKey;
  if (key === referenceImageEditKey) key = 'single-image-edit';
  else if (key === localImageEditKey) key = 'inpaint-single';
  else if (key === 'region-edit') key = 'region-marker-edit';
  if (!Object.hasOwn(modePromptPresets[mode], key)) return undefined;
  const prompt: unknown = Reflect.get(modePromptPresets[mode], key);
  return typeof prompt === 'string' ? prompt : undefined;
}

export function resolveDesignPrompt(
  mode: DesignModeKey,
  appKey: string,
  administratorDefault: null | string | undefined,
  workflowDefault?: unknown,
  toolKey?: string,
) {
  if (typeof administratorDefault === 'string') return administratorDefault;
  return (
    designModeDefaultPrompt(mode, appKey, toolKey) ??
    (typeof workflowDefault === 'string' ? workflowDefault : undefined)
  );
}

// Only initialize brand-new drafts. A saved empty prompt is intentional.
export function designModeDefaults(
  mode: DesignModeKey,
  appKey: string,
): Record<string, unknown> {
  const prompt = designModeDefaultPrompt(mode, appKey);
  return prompt === undefined ? {} : { prompt };
}
