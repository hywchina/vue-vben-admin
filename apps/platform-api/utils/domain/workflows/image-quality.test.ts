// @vitest-environment node
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { WORKFLOW_CATALOG } from './catalog';
import { materializeWorkflow, parseWorkflowVersion } from './schema';

async function workflow(key: string) {
  const entry = WORKFLOW_CATALOG.find((item) => item.application.key === key);
  if (!entry) throw new Error('Missing workflow');
  return parseWorkflowVersion({
    ...entry.version,
    apiJson: JSON.parse(
      await readFile(
        new URL(
          `../../../workflows/comfyui/${entry.fileName}`,
          import.meta.url,
        ),
        'utf8',
      ),
    ),
  });
}

describe('image quality contracts', () => {
  it.each([
    ['inpaint-single', '363', '368', '367'],
    ['inpaint-reference', '370', '373', '368'],
    ['outpaint', '366', '368', '368'],
  ])(
    'protects the original canvas at the final output: %s',
    async (key, output, original, mask) => {
      const parsed = await workflow(key);
      const graph = materializeWorkflow(
        parsed.apiJson,
        parsed.parameterSchema,
        {},
      );
      const link = graph[output]?.inputs.images;
      if (!Array.isArray(link)) throw new Error('Missing output link');
      const result = graph[String(link[0])];
      expect(result?.class_type).toBe('ImageCompositeMasked');
      expect(result?.inputs.destination).toEqual([original, 0]);
      expect(result?.inputs.mask).toEqual([mask, key === 'outpaint' ? 1 : 0]);
      expect(result?.inputs.resize_source).toBe(false);
    },
  );

  it.each(['text-to-image', 'text-to-image-lora'])(
    'preserves requested dimensions including existing 1080-height drafts: %s',
    async (key) => {
      const parsed = await workflow(key);
      const graph = materializeWorkflow(
        parsed.apiJson,
        parsed.parameterSchema,
        { width: 2048, height: 1080 },
      );
      expect(graph.rail_requested_size?.inputs).toMatchObject({
        width: ['358', 0],
        height: ['359', 0],
        crop: 'disabled',
      });
      expect(graph['358']?.inputs.value).toBe(2048);
      expect(graph['359']?.inputs.value).toBe(1080);
      expect(() =>
        materializeWorkflow(parsed.apiJson, parsed.parameterSchema, {
          height: 1080.5,
        }),
      ).toThrow('安全整数');
    },
  );

  it('keeps only the Qwen model branch in single-camera inference', async () => {
    const parsed = await workflow('camera-control-single');
    expect(
      Object.values(parsed.apiJson).some((node) =>
        node.class_type.includes('HYPIR'),
      ),
    ).toBe(false);
    expect(parsed.parameterSchema.flatMap((field) => field.targets)).toEqual([
      { nodeId: '20', inputName: 'image', transport: 'upload' },
    ]);
  });

  it('pads all four vision inputs before center cropping', async () => {
    const parsed = await workflow('multiview-to-3d');
    const encoders = Object.values(parsed.apiJson).filter(
      (node) => node.class_type === 'CLIPVisionEncode',
    );
    expect(encoders).toHaveLength(4);
    for (const encoder of encoders) {
      const link = encoder.inputs.image;
      if (!Array.isArray(link)) throw new Error('Missing image link');
      const pad = parsed.apiJson[String(link[0])];
      expect(pad?.inputs).toMatchObject({
        aspect_ratio: '1:1',
        fit: 'letterbox',
        background_color: '#FFFFFF',
      });
    }
  });
});
