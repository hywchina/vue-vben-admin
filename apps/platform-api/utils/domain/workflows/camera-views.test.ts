// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { cameraViewsField, parseCameraViews } from './camera-views';
import {
  normalizeImageGenerationParameters,
  planImageGeneration,
} from './image-generation-count';
import { parseApiWorkflow } from './schema';

async function fixture() {
  return parseApiWorkflow(
    JSON.parse(
      await readFile(
        new URL(
          '../../../workflows/comfyui/camera-control-multi-v1.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  );
}
const outputSchema = [
  { nodeId: '76', field: 'images', kind: 'image', role: 'primary', tags: [] },
];

describe('multi-view selection', () => {
  it('keeps the five configured cameras and supplies all eight editable directions', async () => {
    const defaults = cameraViewsField(
      'camera-control-multi',
      await fixture(),
    )?.defaultValue;
    const views = parseCameraViews(defaults);
    expect(views).toHaveLength(8);
    expect(
      views
        .filter(({ enabled }) => enabled)
        .map(({ horizontal }) => horizontal),
    ).toEqual([45, 135, 270, 90, 180]);
    expect(new Set(views.map(({ horizontal }) => horizontal)).size).toBe(8);
  });
  it('validates choices, duplicates, empty selection, and the total cap', async () => {
    const graph = await fixture();
    const base = {
      id: 'view0',
      enabled: true,
      horizontal: 0,
      vertical: 60,
      zoom: 8,
    };
    expect(() => parseCameraViews([{ ...base, horizontal: 12 }])).toThrow(
      '配置无效',
    );
    expect(() => parseCameraViews([base, { ...base, id: 'view1' }])).toThrow(
      '不能完全相同',
    );
    expect(() => parseCameraViews([{ ...base, enabled: false }])).toThrow(
      '至少',
    );
    expect(parseCameraViews([{ ...base, enabled: false }], true)).toHaveLength(
      1,
    );
    const parameters = {
      cameraViews: [base, { ...base, id: 'view1', horizontal: 90 }],
      generationCount: 1,
    };
    expect(() =>
      normalizeImageGenerationParameters(
        'camera-control-multi',
        graph,
        [],
        parameters,
      ),
    ).toThrow('不能少于');
    expect(() =>
      normalizeImageGenerationParameters('camera-control-multi', graph, [], {
        ...parameters,
        generationCount: 9,
      }),
    ).toThrow('1–8');
    expect(() =>
      normalizeImageGenerationParameters(
        'single-image-edit',
        graph,
        [],
        parameters,
      ),
    ).toThrow('不支持');
  });
  it('executes the edited cameras in the same order as the result labels, including extra variants', async () => {
    const graph = await fixture();
    const views = [
      { id: 'view0', enabled: true, horizontal: 0, vertical: 60, zoom: 8 },
      { id: 'view1', enabled: true, horizontal: 90, vertical: 0, zoom: 5 },
      { id: 'view2', enabled: true, horizontal: 270, vertical: -30, zoom: 1 },
    ];
    const plan = planImageGeneration(
      'camera-control-multi',
      graph,
      outputSchema,
      8,
      views,
    );
    const prompt = plan.apply(structuredClone(graph));
    const link = (id: string, input: string) =>
      String((prompt[id]?.inputs[input] as undefined | unknown[])?.[0]);
    const samples = plan.imageOutputs.map(({ nodeId }) =>
      link(link(nodeId, 'images'), 'samples'),
    );
    const encoded = samples.map(
      (id) => prompt[link(id, 'positive')]?.inputs.prompt,
    );
    const expected = [
      '<sks> front view high-angle shot close-up',
      '<sks> right side view eye-level shot medium shot',
      '<sks> left side view low-angle shot wide shot',
    ];
    expect(encoded).toEqual([
      ...expected,
      ...expected,
      ...expected.slice(0, 2),
    ]);
    expect(prompt[samples[0] ?? '']?.inputs.seed).not.toBe(
      prompt[samples[3] ?? '']?.inputs.seed,
    );
    expect(graph['65']?.inputs.prompt).toEqual(['59', 1]);
    expect(
      planImageGeneration('camera-control-multi', graph, outputSchema, 8, views)
        .imageOutputs,
    ).toEqual(plan.imageOutputs);
  });
});
