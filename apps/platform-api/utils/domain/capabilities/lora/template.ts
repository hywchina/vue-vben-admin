import { posix } from 'node:path';

import { getConfig } from '../../../config';

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
  epochs: number;
  learningRate: number;
  previewPrompt: string;
  rank: number;
  repeats: number;
  resolution: 512 | 768 | 1024;
  triggerWord: string;
}

export function calculateTrainingSteps(
  imageCount: number,
  parameters: Pick<LoraTrainingParameters, 'epochs' | 'repeats'>,
) {
  return imageCount * parameters.repeats * parameters.epochs;
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
  const steps = calculateTrainingSteps(input.imageCount, parameters);
  const saveEvery = Math.max(20, Math.min(250, Math.ceil(steps / 4)));
  return {
    job: 'extension',
    config: {
      name: input.name,
      process: [
        {
          type: 'diffusion_trainer',
          training_folder: 'output',
          sqlite_db_path: './aitk_db.db',
          device: 'cuda',
          trigger_word: parameters.triggerWord,
          performance_log_every: 50,
          network: {
            type: 'lora',
            linear: parameters.rank,
            linear_alpha: parameters.rank,
            network_kwargs: { ignore_if_contains: [] },
          },
          save: {
            dtype: 'bf16',
            save_every: saveEvery,
            max_step_saves_to_keep: 4,
            save_format: 'safetensors',
            push_to_hub: false,
          },
          datasets: [
            {
              folder_path: posix.join(input.datasetRoot, input.datasetName),
              caption_ext: 'txt',
              default_caption: '',
              caption_dropout_rate: 0,
              shuffle_tokens: false,
              cache_latents_to_disk: true,
              cache_text_embeddings: true,
              resolution: [parameters.resolution],
              num_repeats: parameters.repeats,
              flip_x: false,
              flip_y: false,
            },
          ],
          train: {
            batch_size: 1,
            steps,
            gradient_accumulation: 1,
            train_unet: true,
            train_text_encoder: false,
            gradient_checkpointing: true,
            noise_scheduler: 'flowmatch',
            timestep_type: 'weighted',
            content_or_style: 'style',
            optimizer: 'adamw8bit',
            optimizer_params: { weight_decay: 0.0001 },
            lr: parameters.learningRate,
            dtype: 'bf16',
            unload_text_encoder: true,
            cache_text_embeddings: true,
            disable_sampling: false,
            skip_first_sample: true,
            ema_config: { use_ema: false, ema_decay: 0.99 },
          },
          model: {
            arch: baseModel.architecture,
            name_or_path: config.loraModelPath,
            vae_path: config.loraVaePath,
            quantize: true,
            qtype: 'qfloat8',
            quantize_te: true,
            qtype_te: 'qfloat8',
            low_vram: true,
            layer_offloading: false,
            compile: false,
            model_kwargs: { match_target_res: false },
          },
          sample: {
            sampler: 'flowmatch',
            sample_every: saveEvery,
            width: parameters.resolution,
            height: parameters.resolution,
            samples: [
              {
                prompt:
                  parameters.previewPrompt ||
                  `[trigger], modern style interior design`,
              },
            ],
            neg: '',
            seed: 42,
            walk_seed: false,
            guidance_scale: 1,
            sample_steps: 4,
          },
          logging: { log_every: 10, use_ui_logger: true },
        },
      ],
    },
    meta: { name: '[name]', version: '1.0' },
  };
}
