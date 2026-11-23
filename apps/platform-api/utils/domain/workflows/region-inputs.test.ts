// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { WORKFLOW_CATALOG } from './catalog';
import { normalizeRegionPrompts, validateRegionMarks } from './region-inputs';
import { materializeWorkflow, materializeWorkflowAssets } from './schema';

describe('masked region editing contract', () => {
  it('rejects malformed coordinates, unknown regions and oversized requirements before GPU work', () => {
    for (const marks of [
      'brush:box:8:1:255,0,0:NaN,1;2,3',
      'brush:box:8:1:255,0,0:1,;2,3',
      'brush:square:8:1:255,0,0:9:1,1;2,2',
    ])
      expect(() => validateRegionMarks(marks)).toThrow(/区域/);
    for (const prompts of [
      [],
      { number_7: 'seat' },
      { number_1: 'x'.repeat(2001) },
      { color_red: 1 },
    ])
      expect(() => normalizeRegionPrompts(prompts)).toThrow(/区域/);
  });

  it('rejects two labels inside the same legacy frame', () => {
    expect(() =>
      validateRegionMarks(
        'brush:box:8:1:255,0,0:0,0;100,100|brush:square:8:1:255,0,0:1:10,10;20,20|brush:square:8:1:255,0,0:2:30,30;40,40',
      ),
    ).toThrow('同一方框存在多个编号');
  });

  it('passes clean originals, a separate reference and serialized region requirements without altering source JSON', async () => {
    const entry = WORKFLOW_CATALOG.find(
      (item) => item.application.key === 'region-marker-edit',
    );
    if (!entry) throw new Error('Missing region workflow');
    const graph = JSON.parse(
      await readFile(
        new URL(
          '../../../workflows/comfyui/region-marker-edit-v2.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const marks = 'brush:square:8:1:255,0,0:1:1,1;80,80';
    const parameters = {
      prompt: '保持光照',
      regionMarks: marks,
      regionPrompts: { number_1: '改为蓝色座椅' },
    };
    const mapped = materializeWorkflow(
      graph,
      entry.version.parameterSchema,
      parameters,
    );
    expect(mapped['362']?.inputs).toMatchObject({
      brush_data: marks,
      prompt: '保持光照',
      region_prompts: '{"number_1":"改为蓝色座椅"}',
    });
    const withAssets = materializeWorkflowAssets(
      mapped,
      entry.version.parameterSchema,
      new Map([
        [
          0,
          {
            dataUrl: 'data:image/png;base64,original',
            kind: 'image',
            uploadName: 'base.png',
          },
        ],
        [
          1,
          {
            dataUrl: 'data:image/png;base64,reference',
            kind: 'image',
            uploadName: 'ref.png',
          },
        ],
      ]),
    );
    expect(withAssets['362']?.inputs.image_base64).toBe(
      'data:image/png;base64,original',
    );
    expect(withAssets['362']?.inputs.reference_base64).toBe(
      'data:image/png;base64,reference',
    );
    expect(withAssets['367']?.inputs.image_base64).toBe(
      'data:image/png;base64,reference',
    );
    expect(withAssets['366']?.inputs.images).toEqual(['376', 0]);
    expect(graph['362'].inputs.image_base64).toBe('');
    expect(graph['362'].inputs.region_prompts).toBe('{}');
  });
});
