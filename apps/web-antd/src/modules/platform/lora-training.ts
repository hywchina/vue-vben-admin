import type {
  LoraField,
  LoraParameterKey,
} from '../../../../platform-api/utils/domain/capabilities/lora/demo';

import {
  getLoraDemoValue,
  LORA_DEMO,
  LORA_FIELDS,
  LORA_GROUPS,
} from '../../../../platform-api/utils/domain/capabilities/lora/demo';

export { LORA_FIELDS, LORA_GROUPS };
export type { LoraField, LoraParameterKey };

const demo = LORA_DEMO.config.process[0];
export function createLoraParameters() {
  return {
    baseModel: 'flux2-klein-9b',
    disableSampling: demo.train.disable_sampling,
    learningRate: demo.train.lr,
    name: '',
    previewPrompt: demo.sample.samples[0].prompt,
    rank: demo.network.linear,
    repeats: demo.datasets[0].num_repeats,
    resolution: demo.datasets[0].resolution[0] as 512 | 768 | 1024,
    steps: demo.train.steps,
    triggerWord: demo.trigger_word,
  };
}
export type LoraFormParameters = ReturnType<typeof createLoraParameters>;

export function validLoraParameters(parameters: LoraFormParameters) {
  return (
    Number.isInteger(parameters.steps) &&
    parameters.steps >= 20 &&
    parameters.steps <= 10_000 &&
    Number.isInteger(parameters.repeats) &&
    parameters.repeats >= 1 &&
    parameters.repeats <= 100 &&
    [4, 8, 16, 32, 64].includes(parameters.rank) &&
    [512, 768, 1024].includes(parameters.resolution) &&
    Number.isFinite(parameters.learningRate) &&
    parameters.learningRate >= 0.000001 &&
    parameters.learningRate <= 0.01 &&
    /^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(parameters.triggerWord.trim()) &&
    parameters.previewPrompt.trim().length <= 1000
  );
}

export function loraFieldValue(
  field: LoraField,
  parameters: LoraFormParameters,
): boolean | number | string {
  if (field.binding) return parameters[field.binding];
  const shortPath = field.path.replace('config.process[0].', '');
  if (shortPath === 'network.linear_alpha') return parameters.rank;
  if (shortPath === 'sample.width' || shortPath === 'sample.height')
    return parameters.resolution;
  if (shortPath === 'datasets[0].folder_path')
    return '提交时按任务生成（服务器管理）';
  if (shortPath === 'model.vae_path') return '服务器配置（路径不公开）';
  if (field.path === 'config.name') return '提交时按任务 ID 自动生成';
  if (shortPath === 'logging.use_ui_logger') return true;
  const value = getLoraDemoValue(field.path);
  if (Array.isArray(value)) return JSON.stringify(value);
  return value as boolean | number | string;
}

export function loraDemoDisplay(field: LoraField) {
  if (field.path.endsWith('.folder_path')) return '服务器数据集目录（不公开）';
  if (field.binding === 'baseModel') return 'Flux2 Klein 9B（服务器权重）';
  if (field.path.endsWith('.vae_path')) return 'Flux2 VAE（服务器权重）';
  const value = getLoraDemoValue(field.path);
  return value === '' ? '空字符串' : JSON.stringify(value);
}

export function updateLoraParameter(
  parameters: LoraFormParameters,
  key: LoraParameterKey,
  value: unknown,
) {
  if (key === 'disableSampling') {
    if (typeof value === 'boolean') parameters[key] = value;
  } else if (
    key === 'baseModel' ||
    key === 'previewPrompt' ||
    key === 'triggerWord'
  ) {
    if (typeof value === 'string') parameters[key] = value;
  } else if (key === 'resolution') {
    if (value === 512 || value === 768 || value === 1024)
      parameters[key] = value;
  } else {
    parameters[key] = typeof value === 'number' ? value : 0;
  }
}
