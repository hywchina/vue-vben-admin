import { describe, expect, it } from 'vitest';

import { getLoraDemoValue, LORA_DEMO, LORA_FIELDS, LORA_GROUPS } from './demo';
import fixture from './fixtures/ordinary-demo.json';
import { loraParametersSchema } from './parameters';
import { buildLoraJobConfig, calculateTrainingSteps } from './template';

function paths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item !== 'object')) return [prefix];
    return value.flatMap((item, index) => paths(item, `${prefix}[${index}]`));
  }
  if (value !== null && typeof value === 'object')
    return Object.entries(value).flatMap(([key, item]) =>
      paths(item, prefix ? `${prefix}.${key}` : key),
    );
  return [prefix];
}
const parameters = {
  baseModel: 'flux2-klein-9b' as const,
  steps: 1500,
  repeats: 1,
  resolution: 512 as const,
  rank: 16,
  learningRate: 0.0001,
  triggerWord: 'interiorstyle',
  previewPrompt: '[trigger], modern style interior design',
  disableSampling: true,
};
const input = {
  datasetName: 'rail_test',
  datasetRoot: '/srv/datasets',
  imageCount: 8,
  name: 'rail_lora_test',
  parameters,
};

describe('ordinary demo parameter contract', () => {
  it('matches the checked-in ordinary YAML snapshot, with only the dataset path redacted', () => {
    expect(LORA_DEMO).toEqual(fixture);
  });
  it('shows every demo leaf exactly once and no extra training parameters', () => {
    expect(LORA_FIELDS.map((field) => field.path).toSorted()).toEqual(
      paths(LORA_DEMO).toSorted(),
    );
    expect(new Set(LORA_FIELDS.map((field) => field.path)).size).toBe(
      LORA_FIELDS.length,
    );
    for (const field of LORA_FIELDS) {
      expect(getLoraDemoValue(field.path)).not.toBeUndefined();
      expect(field.help.length).toBeGreaterThan(15);
      expect(field.help).toMatch(/推荐|demo/);
      expect(LORA_GROUPS.some((group) => group.key === field.group)).toBe(true);
    }
    expect(
      LORA_FIELDS.filter((field) => field.main).map((field) => field.binding),
    ).toEqual([
      'baseModel',
      'steps',
      'repeats',
      'triggerWord',
      'resolution',
      'previewPrompt',
    ]);
    expect(LORA_FIELDS.some((field) => /epoch/i.test(field.path))).toBe(false);
  });
  it('uses direct steps independently of image count and Repeat, and preserves the source defaults', () => {
    expect(calculateTrainingSteps(8, parameters)).toBe(1500);
    expect(calculateTrainingSteps(100, { ...parameters, repeats: 100 })).toBe(
      1500,
    );
    const result = buildLoraJobConfig(input);
    const process = result.config.process[0];
    expect(paths(result).toSorted()).toEqual(paths(LORA_DEMO).toSorted());
    expect(process.train).toMatchObject({
      steps: 1500,
      disable_sampling: true,
    });
    expect(process.save.save_every).toBe(250);
    expect(process.sample.sample_every).toBe(250);
    expect(process.logging.use_ui_logger).toBe(true);
    expect(process.datasets[0].folder_path).toBe('/srv/datasets/rail_test');
    expect(LORA_DEMO.config.process[0].logging.use_ui_logger).toBe(false);
    expect(LORA_DEMO.config.name).toBe('flux2_klein_9b_interior_lora');
  });
  it('maps all editable fields and derives Alpha and sample size', () => {
    const result = buildLoraJobConfig({
      ...input,
      parameters: {
        ...parameters,
        steps: 800,
        repeats: 3,
        resolution: 768,
        rank: 32,
        learningRate: 0.0002,
        triggerWord: 'railstyle',
        previewPrompt: 'rail interior',
        disableSampling: false,
      },
    });
    expect(result.config.process[0]).toMatchObject({
      train: { steps: 800, lr: 0.0002, disable_sampling: false },
      network: { linear: 32, linear_alpha: 32 },
      datasets: [{ num_repeats: 3, resolution: [768] }],
      sample: {
        width: 768,
        height: 768,
        samples: [{ prompt: 'rail interior' }],
      },
      trigger_word: 'railstyle',
    });
  });
  it('keeps legacy queued jobs and refuses missing steps', () => {
    const { steps: _steps, disableSampling: _sampling, ...legacy } = parameters;
    const result = buildLoraJobConfig({
      ...input,
      parameters: { ...legacy, repeats: 20, epochs: 5 },
    });
    expect(result.config.process[0]).toMatchObject({
      train: { steps: 800, disable_sampling: false },
      save: { save_every: 200 },
      sample: { sample_every: 200 },
    });
    expect(() => calculateTrainingSteps(8, legacy)).toThrow('缺少训练步数');
  });
  it.each([19, 10_001, 1500.5, Number.NaN])(
    'rejects invalid steps %s',
    (steps) => {
      expect(
        loraParametersSchema.safeParse({ ...parameters, steps }).success,
      ).toBe(false);
    },
  );
  it.each([
    { repeats: 0 },
    { repeats: 101 },
    { rank: 12 },
    { resolution: 640 },
    { learningRate: 0 },
    { learningRate: 0.1 },
    { disableSampling: 'false' },
    { triggerWord: '中文' },
    { previewPrompt: 'x'.repeat(1001) },
  ])('rejects invalid controlled parameters %j', (invalid) => {
    expect(
      loraParametersSchema.safeParse({ ...parameters, ...invalid }).success,
    ).toBe(false);
  });
  it('accepts boundary steps and strips forbidden paths, full configs, and Epoch from requests', () => {
    expect(
      loraParametersSchema.safeParse({ ...parameters, steps: 20 }).success,
    ).toBe(true);
    expect(
      loraParametersSchema.safeParse({ ...parameters, steps: 10_000 }).success,
    ).toBe(true);
    const parsed = loraParametersSchema.parse({
      ...parameters,
      epochs: 50,
      device: 'cpu',
      model: { name_or_path: '/secret' },
      job_config: {},
    });
    expect(parsed).toEqual(parameters);
    const { steps: _steps, ...legacy } = parameters;
    expect(
      loraParametersSchema.safeParse({ ...legacy, epochs: 5 }).success,
    ).toBe(false);
  });
});
