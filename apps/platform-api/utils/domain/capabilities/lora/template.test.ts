import { describe, expect, it } from 'vitest';

import { buildLoraJobConfig, calculateTrainingSteps } from './template';

describe('loRA training template', () => {
  it('maps only the controlled business parameters onto the verified Flux2 template', () => {
    const parameters = {
      baseModel: 'flux2-klein-9b' as const,
      epochs: 5,
      learningRate: 0.0001,
      previewPrompt: '[trigger], bright rail interior',
      rank: 16,
      repeats: 20,
      resolution: 512 as const,
      triggerWord: 'railstyle',
    };
    expect(calculateTrainingSteps(8, parameters)).toBe(800);
    const template = buildLoraJobConfig({
      datasetName: 'rail_dataset',
      datasetRoot: '/srv/ai-toolkit/datasets',
      imageCount: 8,
      name: 'rail_lora_task',
      parameters,
    });
    const process = template.config.process[0];
    expect(process).toMatchObject({
      datasets: [
        {
          folder_path: '/srv/ai-toolkit/datasets/rail_dataset',
          num_repeats: 20,
          resolution: [512],
        },
      ],
      logging: { use_ui_logger: true },
      model: { arch: 'flux2_klein_9b', quantize: true, qtype: 'qfloat8' },
      network: { linear: 16, linear_alpha: 16, type: 'lora' },
      train: { lr: 0.0001, noise_scheduler: 'flowmatch', steps: 800 },
      trigger_word: 'railstyle',
      type: 'diffusion_trainer',
    });
  });
});
