import { parseApiWorkflow, workflowParameterSchema } from './schema';

type InputDefinition = [unknown, Record<string, unknown>?];

interface ComfyNodeDefinition {
  display_name?: string;
  input?: Partial<
    Record<'hidden' | 'optional' | 'required', Record<string, InputDefinition>>
  >;
}

const basicInputNames = new Set([
  'audio',
  'batch_size',
  'cfg',
  'denoise',
  'guidance',
  'height',
  'image',
  'images',
  'length',
  'mask',
  'negative',
  'negative_prompt',
  'noise_seed',
  'positive',
  'prompt',
  'scale_by',
  'seed',
  'steps',
  'strength',
  'text',
  'upscale_by',
  'video',
  'width',
]);

const labelTranslations: Record<string, string> = {
  audio: '音频',
  batch_size: '生成数量',
  cfg: 'CFG 引导',
  ckpt_name: 'Checkpoint 模型',
  clip_name: '文本编码模型',
  denoise: '降噪强度',
  filename_prefix: '文件名前缀',
  guidance: '提示词引导',
  height: '高度',
  horizontal_angle: '水平角度',
  image: '输入图片',
  images: '输入图片',
  length: '长度 / 帧数',
  lora_name: 'LoRA 模型',
  mask: '遮罩',
  negative: '负向提示词',
  negative_prompt: '负向提示词',
  noise_seed: '随机种子',
  positive: '正向提示词',
  prompt: '提示词',
  refresh_rate: '捕获间隔（毫秒）',
  sampler_name: '采样器',
  scheduler: '调度器',
  seed: '随机种子',
  slide: '降噪强度',
  steps: '采样步数',
  strength: '强度',
  text: '文本 / 提示词',
  unet_name: '扩散模型',
  vae_name: 'VAE 模型',
  video: '视频',
  vertical_angle: '俯仰角度',
  width: '宽度',
  zoom: '镜头距离',
};

function inputDefinition(
  nodeDefinition: ComfyNodeDefinition | undefined,
  inputName: string,
) {
  for (const section of ['required', 'optional', 'hidden'] as const) {
    const definition = nodeDefinition?.input?.[section]?.[inputName];
    if (definition) return definition;
  }
}

function humanizeName(name: string) {
  return (
    labelTranslations[name] ??
    name
      .replaceAll('_', ' ')
      .replaceAll('.', ' · ')
      .replaceAll(/\b\w/g, (character) => character.toUpperCase())
  );
}

function stableFieldKey(nodeId: string, inputName: string) {
  const value = `${nodeId}_${inputName}`;
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  const normalized = value
    .replaceAll(/[^\dA-Za-z_]/g, '_')
    .replace(/^\d/, (digit) => `n${digit}`)
    .slice(0, 80);
  const unsignedHash = hash < 0 ? hash + 2 ** 32 : hash;
  return `auto_${normalized}_${unsignedHash.toString(16)}`;
}

function numberOption(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function fieldType(
  declaredType: unknown,
  inputName: string,
  value: unknown,
  options: Record<string, unknown>,
) {
  if (Array.isArray(declaredType)) return 'select' as const;
  const normalizedType =
    typeof declaredType === 'string' ? declaredType.toUpperCase() : '';
  if (normalizedType === 'BOOLEAN' || typeof value === 'boolean') {
    return 'boolean' as const;
  }
  if (
    normalizedType === 'INT' ||
    normalizedType === 'FLOAT' ||
    typeof value === 'number'
  ) {
    return 'number' as const;
  }
  if (normalizedType === 'STRING' || typeof value === 'string') {
    return options.multiline ||
      /description|instruction|prompt|text/i.test(inputName) ||
      String(value).length > 90
      ? ('textarea' as const)
      : ('text' as const);
  }
  return 'json' as const;
}

export function buildCompleteWorkflowParameterSchema(
  apiJson: unknown,
  curatedSchema: unknown,
  objectInfo: Record<string, ComfyNodeDefinition>,
) {
  const workflow = parseApiWorkflow(apiJson);
  const curated = workflowParameterSchema.array().parse(curatedSchema);
  const mappedInputs = new Set<string>();
  for (const field of curated) {
    if (field.nodeId && field.inputName) {
      mappedInputs.add(`${field.nodeId}:${field.inputName}`);
    }
    for (const target of field.targets) {
      mappedInputs.add(`${target.nodeId}:${target.inputName}`);
    }
  }

  const generated: Array<Record<string, unknown>> = [];
  const cameraNodeIds = Object.entries(workflow)
    .filter(([, node]) => node.class_type === 'QwenMultiangleCameraNode')
    .map(([nodeId]) => nodeId);
  for (const [nodeId, node] of Object.entries(workflow)) {
    const nodeDefinition = objectInfo[node.class_type];
    const group =
      node._meta?.title ?? nodeDefinition?.display_name ?? node.class_type;
    for (const [inputName, value] of Object.entries(node.inputs)) {
      if (mappedInputs.has(`${nodeId}:${inputName}`)) continue;
      const connected =
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[1] === 'number' &&
        String(value[0]) in workflow;
      if (connected) continue;

      const definition = inputDefinition(nodeDefinition, inputName);
      const declaredType = definition?.[0];
      const metadata =
        definition?.[1] &&
        typeof definition[1] === 'object' &&
        !Array.isArray(definition[1])
          ? definition[1]
          : {};
      const dynamicOptions =
        declaredType === 'COMFY_DYNAMICCOMBO_V3' &&
        Array.isArray(metadata.options)
          ? metadata.options.flatMap((option) =>
              option &&
              typeof option === 'object' &&
              'key' in option &&
              (typeof option.key === 'string' || typeof option.key === 'number')
                ? [option.key]
                : [],
            )
          : [];
      const choices = Array.isArray(declaredType)
        ? declaredType.filter(
            (choice): choice is number | string =>
              typeof choice === 'string' || typeof choice === 'number',
          )
        : dynamicOptions;
      const type =
        choices.length > 0
          ? ('select' as const)
          : fieldType(declaredType, inputName, value, metadata);
      const normalizedInputName = inputName.toLowerCase();
      const screenShare = node.class_type === 'ScreenShare';
      const cameraAxis =
        node.class_type === 'QwenMultiangleCameraNode'
          ? {
              horizontal_angle: 'camera-horizontal',
              vertical_angle: 'camera-vertical',
              zoom: 'camera-zoom',
            }[normalizedInputName]
          : undefined;
      const cameraIndex = cameraNodeIds.indexOf(nodeId);
      const screenShareNumber = screenShare
        ? {
            refresh_rate: { integer: true, min: 50, step: 50 },
            seed: { integer: true, min: 0, step: 1 },
            slide: { max: 1, min: 0, step: 0.01 },
          }[normalizedInputName]
        : undefined;
      const semanticBasic =
        screenShare ||
        basicInputNames.has(normalizedInputName) ||
        /batch|denoise|guidance|height|image|mask|prompt|seed|steps|width/.test(
          normalizedInputName,
        ) ||
        /primitive(string|int|float)/i.test(node.class_type);

      generated.push({
        acceptedKinds: [],
        advanced: !semanticBasic,
        defaultValue: value,
        group,
        help:
          typeof metadata.tooltip === 'string' ? metadata.tooltip : undefined,
        integer:
          screenShareNumber?.integer ??
          (typeof declaredType === 'string' &&
            declaredType.toUpperCase() === 'INT'),
        inputName,
        key: stableFieldKey(nodeId, inputName),
        label: `${group} · ${humanizeName(inputName)}`,
        max: screenShareNumber?.max ?? numberOption(metadata.max),
        maxLength: numberOption(metadata.max_length),
        min: screenShareNumber?.min ?? numberOption(metadata.min),
        nodeId,
        options: choices.map((choice) => ({
          label: String(choice),
          value: choice,
        })),
        required: false,
        step: screenShareNumber?.step ?? numberOption(metadata.step),
        targets: [],
        type,
        uiControl: cameraAxis ?? 'default',
        uiGroup:
          cameraAxis && cameraIndex !== -1
            ? `镜头 ${cameraIndex + 1}`
            : undefined,
      });
    }
  }

  return workflowParameterSchema.array().parse([...curated, ...generated]);
}
