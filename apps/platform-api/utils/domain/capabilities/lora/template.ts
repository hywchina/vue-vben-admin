import { posix } from 'node:path';

import { getConfig } from '../../../config';
import { LORA_DEMO } from './demo';

export const DEFAULT_LORA_BASE_MODEL = 'flux2-klein-9b';
export const LORA_BASE_MODELS = [
  {
    architecture: 'flux2_klein_9b',
    description: '本地 safetensors 权重，已通过室内设计 LoRA 配置验证',
    key: DEFAULT_LORA_BASE_MODEL,
    label: 'Flux2 Klein 9B（本地已验证）',
    verified: true,
  },
] as const;
export type LoraBaseModelKey = (typeof LORA_BASE_MODELS)[number]['key'];

export interface LoraTrainingParameters {
  baseModel: LoraBaseModelKey;
  disableSampling?: boolean;
  /** Legacy persisted jobs only. New requests use steps. */
  epochs?: number;
  learningRate: number;
  previewPrompt: string;
  rank: number;
  repeats: number;
  resolution: 512 | 768 | 1024;
  steps?: number;
  triggerWord: string;
}

export function calculateTrainingSteps(
  imageCount: number,
  parameters: Pick<LoraTrainingParameters, 'epochs' | 'repeats' | 'steps'>,
) {
  if (parameters.steps !== undefined) return parameters.steps;
  if (parameters.epochs !== undefined)
    return imageCount * parameters.repeats * parameters.epochs;
  throw new Error('LoRA 任务缺少训练步数');
}

export function buildLoraJobConfig(input: {
  datasetName: string;
  datasetRoot: string;
  imageCount: number;
  name: string;
  parameters: LoraTrainingParameters;
}) {
  const config = getConfig();
  const { parameters } = input;
  const baseModel = LORA_BASE_MODELS.find(
    (model) => model.key === parameters.baseModel,
  );
  if (!baseModel) throw new Error('不支持的 LoRA 基础模型');
  const result = structuredClone(LORA_DEMO);
  const process = result.config.process[0];
  const dataset = process.datasets[0];
  const steps = calculateTrainingSteps(input.imageCount, parameters);
  result.config.name = input.name;
  process.trigger_word = parameters.triggerWord;
  process.network.linear = parameters.rank;
  process.network.linear_alpha = parameters.rank;
  dataset.folder_path = posix.join(input.datasetRoot, input.datasetName);
  dataset.resolution = [parameters.resolution];
  dataset.num_repeats = parameters.repeats;
  process.train.steps = steps;
  process.train.lr = parameters.learningRate;
  process.model.arch = baseModel.architecture;
  process.model.name_or_path = config.loraModelPath;
  process.model.vae_path = config.loraVaePath;
  process.sample.width = parameters.resolution;
  process.sample.height = parameters.resolution;
  process.sample.samples[0].prompt =
    parameters.previewPrompt ||
    LORA_DEMO.config.process[0].sample.samples[0].prompt;
  // Existing queued jobs keep their original cadence and preview behavior.
  if (parameters.steps === undefined) {
    const interval = Math.max(20, Math.min(250, Math.ceil(steps / 4)));
    process.save.save_every = interval;
    process.sample.sample_every = interval;
    process.train.disable_sampling = parameters.disableSampling ?? false;
  } else {
    process.train.disable_sampling = parameters.disableSampling ?? true;
  }
  // Required by platform metrics, unlike the stand-alone demo.
  process.logging.use_ui_logger = true;
  return result;
}
