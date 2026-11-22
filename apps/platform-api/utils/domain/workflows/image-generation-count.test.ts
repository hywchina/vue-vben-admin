// @vitest-environment node

import type { ApiWorkflow } from './schema';

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { extractRequestedImageOutputs } from '../capabilities/comfyui/worker';
import { WORKFLOW_CATALOG } from './catalog';
import {
  imageGenerationCountField,
  legacyImageCountKey,
  normalizeImageGenerationParameters,
  planImageGeneration,
  readImageGenerationCount,
} from './image-generation-count';
import { parseApiWorkflow, workflowOutputSchema } from './schema';

async function workflow(appKey: string) {
  const entry = WORKFLOW_CATALOG.find(
    ({ application }) => application.key === appKey,
  );
  if (!entry) throw new Error(`Missing test workflow ${appKey}`);
  const apiJson = JSON.parse(
    await readFile(
      new URL(`../../../workflows/comfyui/${entry.fileName}`, import.meta.url),
      'utf8',
    ),
  );
  return {
    apiJson: parseApiWorkflow(apiJson),
    outputSchema: workflowOutputSchema
      .array()
      .parse(entry.version.outputSchema),
  };
}

function inputLinkId(prompt: ApiWorkflow, nodeId: string, input: string) {
  const link = prompt[nodeId]?.inputs[input];
  if (!Array.isArray(link) || typeof link[0] !== 'string')
    throw new Error(`Invalid test graph link ${nodeId}.${input}`);
  return link[0];
}

describe('image generation count', () => {
  it('exposes the count on every active image-to-image workflow only', () => {
    for (const { application } of WORKFLOW_CATALOG) {
      const supported =
        application.key !== 'image-edit-base' &&
        application.acceptedAssetTypes.includes('image') &&
        application.outputAssetTypes.includes('image');
      const field = imageGenerationCountField(application.key);
      expect(field && [field.integer, field.min, field.max]).toEqual(
        supported ? [true, 1, 8] : undefined,
      );
    }
  });

  it.each([0, 9, 1.5, '8', null])('rejects an invalid count: %s', (value) => {
    expect(() => readImageGenerationCount(value)).toThrow('1–8');
  });

  it('normalizes legacy multi-angle batches to the capped image total', async () => {
    const { apiJson } = await workflow('camera-control-multi');
    const legacy = [
      {
        inputName: 'batch_size',
        key: 'oldCameraBatch',
        label: '批次',
        nodeId: '67',
        type: 'number',
      },
    ];
    expect(legacyImageCountKey(apiJson, legacy)).toBe('oldCameraBatch');
    expect(
      normalizeImageGenerationParameters(
        'camera-control-multi',
        apiJson,
        legacy,
        {},
      ),
    ).toEqual({ generationCount: 5 });
    expect(
      normalizeImageGenerationParameters(
        'camera-control-multi',
        apiJson,
        legacy,
        { oldCameraBatch: 2 },
      ),
    ).toEqual({ generationCount: 8 });
  });

  it.each([
    ['single-image-edit', '388'],
    ['image-edit-kv', '129'],
    ['multi-image-edit', '17'],
    ['outpaint', '356'],
    ['screen-capture-edit', '388'],
    ['camera-control-single', '26'],
  ])('uses the native latent batch of %s', async (app, id) => {
    const { apiJson, outputSchema } = await workflow(app);
    const plan = planImageGeneration(app, apiJson, outputSchema, 8);
    const prompt = plan.apply(structuredClone(apiJson));
    expect(prompt[id]?.inputs.batch_size).toBe(8);
    expect(apiJson[id]?.inputs.batch_size).toBe(1);
    expect(Object.keys(prompt)).toEqual(Object.keys(apiJson));
    expect(plan.imageOutputs).toEqual([{ ...outputSchema[0], count: 8 }]);
  });

  it.each([
    ['inpaint-single', 'RandomNoise', 'noise_seed'],
    ['inpaint-reference', 'RandomNoise', 'noise_seed'],
    ['region-edit', 'sum_Ksampler', 'seed'],
    ['region-marker-edit', 'sum_Ksampler', 'seed'],
    ['image-upscale', 'HYPIRAdvancedRestoration', 'seed'],
  ])(
    'adds independent outputs to %s without duplicating its media input',
    async (app, sampler, seed) => {
      const { apiJson, outputSchema } = await workflow(app);
      const plan = planImageGeneration(app, apiJson, outputSchema, 8);
      const prompt = plan.apply(structuredClone(apiJson));
      const samplers = Object.values(prompt).filter(
        (node) => node.class_type === sampler,
      );
      expect(new Set(samplers.map((node) => node.inputs[seed])).size).toBe(8);
      expect(plan.imageOutputs.map(({ nodeId }) => nodeId)).toHaveLength(8);
      expect(new Set(plan.imageOutputs.map(({ nodeId }) => nodeId)).size).toBe(
        8,
      );
      const loaders = Object.entries(prompt).filter(
        ([, node]) =>
          node.class_type === 'LoadImage' || node.class_type.endsWith('Loader'),
      );
      expect(loaders.map(([id]) => apiJson[id])).toEqual(
        loaders.map(([, node]) => node),
      );
      expect(
        planImageGeneration(app, apiJson, outputSchema, 8).imageOutputs,
      ).toEqual(plan.imageOutputs);
    },
  );

  it('keeps multi-angle output order and adds only three variants for a total of eight', async () => {
    const { apiJson, outputSchema } = await workflow('camera-control-multi');
    const first = planImageGeneration(
      'camera-control-multi',
      apiJson,
      outputSchema,
      1,
    );
    expect(first.apply(structuredClone(apiJson))['65']?.inputs.prompt).toEqual([
      '78',
      0,
    ]);
    const full = planImageGeneration(
      'camera-control-multi',
      apiJson,
      outputSchema,
      8,
    );
    const prompt = full.apply(structuredClone(apiJson));
    const seeds = full.imageOutputs.map(({ nodeId }) => {
      const decoded = inputLinkId(prompt, nodeId, 'images');
      const sampler = inputLinkId(prompt, decoded, 'samples');
      const condition = inputLinkId(prompt, sampler, 'positive');
      return [prompt[condition]?.inputs.prompt, prompt[sampler]?.inputs.seed];
    });
    expect(seeds.map(([view]) => view)).toEqual(
      ['78', '79', '80', '81', '82', '78', '79', '80'].map((id) => [id, 0]),
    );
    expect(seeds[0]?.[1]).not.toBe(seeds[5]?.[1]);
    expect(prompt['67']?.inputs.batch_size).toBe(1);
  });

  it('returns only the requested outputs in plan order and detects a shortfall', async () => {
    const { apiJson, outputSchema } = await workflow('inpaint-single');
    const { imageOutputs } = planImageGeneration(
      'inpaint-single',
      apiJson,
      outputSchema,
      3,
    );
    const [first, second, third] = imageOutputs;
    if (!first || !second || !third) throw new Error('Missing output slots');
    const outputs = {
      [third.nodeId]: { images: [{ filename: 'third.png' }] },
      [first.nodeId]: {
        images: [{ filename: 'first.png' }, { filename: 'extra.png' }],
      },
    };
    expect(
      extractRequestedImageOutputs(outputs, imageOutputs).map(
        ({ file }) => file.filename,
      ),
    ).toEqual(['first.png', 'third.png']);
    expect(
      extractRequestedImageOutputs(
        {
          ...outputs,
          [second.nodeId]: { images: [{ filename: 'second.png' }] },
        },
        imageOutputs,
      ).map(({ file }) => file.filename),
    ).toEqual(['first.png', 'second.png', 'third.png']);
  });
});
