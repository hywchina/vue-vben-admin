// @vitest-environment node

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ComfyUiClient } from '../capabilities/comfyui/client';
import { WORKFLOW_CATALOG } from './catalog';
import { assertWorkspaceDraftParameterKeys } from './drafts';
import {
  applyOptionalLora,
  assertFixedWorkflowModels,
  fixedWorkflowModelFields,
  getLoraOptions,
  optionalLoraSchema,
  splitOptionalLora,
  validateOptionalLora,
  workflowLoraTargets,
} from './optional-lora';
import { materializeWorkflow } from './schema';

const selection = {
  targetId: 'branch-0',
  name: 'interior.safetensors',
  sha256: 'a'.repeat(64),
  baseFingerprint: 'b'.repeat(64),
  strength: 0.8,
};
const graph = {
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'base.safetensors' } },
  '2': {
    class_type: 'LoraLoaderModelOnly',
    inputs: {
      model: ['1', 0],
      lora_name: 'required.safetensors',
      strength_model: 1,
    },
  },
  '3': { class_type: 'CFGGuider', inputs: { model: ['2', 0] } },
};

describe('optional workflow LoRA', () => {
  it('adapts all 18 registered workflows without changing published JSON or outputs', async () => {
    for (const entry of WORKFLOW_CATALOG) {
      const raw = JSON.parse(
        await readFile(
          new URL(
            `../../../workflows/comfyui/${entry.fileName}`,
            import.meta.url,
          ),
          'utf8',
        ),
      );
      const frozen = JSON.stringify(raw);
      const targets = workflowLoraTargets(raw, entry.version.outputSchema);
      expect(targets.length).toBeGreaterThan(0);
      expect(() =>
        assertFixedWorkflowModels(
          raw,
          materializeWorkflow(raw, entry.version.parameterSchema, {}),
          entry.version.parameterSchema,
        ),
      ).not.toThrow();
      expect(applyOptionalLora(raw)).toEqual(raw);
      expect(
        applyOptionalLora(raw, { enabled: false, selections: [] }),
      ).toEqual(raw);
      for (const target of targets) {
        const next = applyOptionalLora(
          raw,
          {
            enabled: true,
            selections: [{ ...selection, targetId: target.id }],
          },
          undefined,
          entry.version.outputSchema,
        );
        expect(
          Object.values(next).some((n) => n.class_type.startsWith('Rail')),
        ).toBe(true);
        const reachable = new Set<string>();
        function visit(id: string) {
          if (reachable.has(id)) return;
          reachable.add(id);
          for (const value of Object.values(next[id]?.inputs ?? {}))
            if (
              Array.isArray(value) &&
              value.length === 2 &&
              typeof value[1] === 'number' &&
              next[String(value[0])]
            )
              visit(String(value[0]));
        }
        for (const output of entry.version.outputSchema as { nodeId: string }[])
          visit(output.nodeId);
        expect({
          [`${entry.application.key}:${target.kind}`]: [...reachable].some(
            (id) => next[id]?.class_type.startsWith('Rail'),
          ),
        }).toEqual({ [`${entry.application.key}:${target.kind}`]: true });
        for (const output of entry.version.outputSchema as { nodeId: string }[])
          expect(next[output.nodeId]).toBeDefined();
      }
      expect(JSON.stringify(raw)).toBe(frozen);
    }
  });
  it('preserves required acceleration/control LoRAs and injects upstream of them', () => {
    const next = applyOptionalLora(graph, {
      enabled: true,
      selections: [selection],
    });
    expect(next['2']?.inputs.lora_name).toBe('required.safetensors');
    expect(next['2']?.inputs.model).toEqual(['rail_lora_branch-0', 0]);
    expect(next['3']).toEqual(graph['3']);
    expect(next['rail_lora_branch-0']?.inputs.model).toEqual(['1', 0]);
  });
  it('makes the original test LoRA optional only for new requests and retains old jobs', () => {
    expect(applyOptionalLora(graph, undefined, '2')).toEqual(graph);
    const off = applyOptionalLora(
      graph,
      { enabled: false, selections: [] },
      '2',
    );
    expect(off['2']).toBeUndefined();
    expect(off['3']?.inputs.model).toEqual(['1', 0]);
    const on = applyOptionalLora(
      graph,
      { enabled: true, selections: [selection] },
      '2',
    );
    expect(on['2']).toBeUndefined();
    expect(on['3']?.inputs.model).toEqual(['rail_lora_branch-0', 0]);
    expect(graph['2'].inputs.lora_name).toBe('required.safetensors');
  });
  it('rejects raw file overrides even when the caller omits optional LoRA settings', () => {
    const fields = [
      { key: 'baseModel', nodeId: '1', inputName: 'unet_name' },
      { key: 'oldLora', nodeId: '2', inputName: 'lora_name' },
    ];
    expect(fixedWorkflowModelFields(graph, fields)).toHaveLength(2);
    expect(() => assertFixedWorkflowModels(graph, graph, fields)).not.toThrow();
    for (const [id, input] of [
      ['1', 'unet_name'],
      ['2', 'lora_name'],
    ] as const) {
      const tampered = JSON.parse(JSON.stringify(graph));
      tampered[id].inputs[input] = 'arbitrary.safetensors';
      expect(() => assertFixedWorkflowModels(graph, tampered, fields)).toThrow(
        '兼容选择器',
      );
    }
  });
  it('rejects malformed, duplicate, disabled-but-selected and out-of-range settings', () => {
    for (const value of [
      { enabled: true, selections: [] },
      { enabled: false, selections: [selection] },
      { enabled: true, selections: [selection, selection] },
      { enabled: true, selections: [{ ...selection, strength: 0 }] },
      { enabled: true, selections: [{ ...selection, sha256: 'fake' }] },
    ])
      expect(optionalLoraSchema.safeParse(value).success).toBe(false);
  });
  it('retains private draft selections, strips only the virtual parameter during materialization', () => {
    const parameters = {
      optionalLora: { enabled: true, selections: [selection] },
    };
    expect(splitOptionalLora(parameters).lora).toEqual(parameters.optionalLora);
    expect(materializeWorkflow(graph, [], parameters)).toEqual(graph);
    expect(() =>
      assertWorkspaceDraftParameterKeys([], parameters),
    ).not.toThrow();
    expect(() =>
      materializeWorkflow(graph, [], { ...parameters, arbitrary: true }),
    ).toThrow('未公开');
  });
  function client(option = selection, base = selection.baseFingerprint) {
    return new ComfyUiClient({
      apiUrl: 'http://comfy.invalid',
      timeoutMs: 1000,
      fetchImplementation: async (_url, init) => {
        expect(JSON.parse(String(init?.body)).targets[0]).toMatchObject({
          kind: 'model',
          base: 'base.safetensors',
        });
        return Response.json({
          targets: [
            {
              id: 'branch-0',
              label: '生成模型',
              base: 'base.safetensors',
              baseFingerprint: base,
              family: 'flux2_klein_9b',
              options: [option],
              rejected: 0,
            },
          ],
        });
      },
    });
  }
  it('rechecks actual catalog versions before both submission and execution', async () => {
    const value = { enabled: true, selections: [selection] };
    await expect(
      validateOptionalLora(graph, value, client()),
    ).resolves.toBeUndefined();
    await expect(
      validateOptionalLora(
        graph,
        value,
        client({ ...selection, sha256: 'c'.repeat(64) }),
      ),
    ).rejects.toMatchObject({ code: 'LORA_INCOMPATIBLE' });
    await expect(
      validateOptionalLora(graph, value, client(selection, 'c'.repeat(64))),
    ).rejects.toMatchObject({ code: 'LORA_INCOMPATIBLE' });
    await expect(
      validateOptionalLora(graph, undefined),
    ).resolves.toBeUndefined();
  });
  it('fails closed when the compatibility service is unavailable', async () => {
    const service = new ComfyUiClient({
      apiUrl: 'http://comfy.invalid',
      timeoutMs: 1000,
      fetchImplementation: async () => new Response('missing', { status: 404 }),
    });
    await expect(getLoraOptions(graph, service)).rejects.toMatchObject({
      code: 'LORA_CATALOG_UNAVAILABLE',
    });
  });
});
