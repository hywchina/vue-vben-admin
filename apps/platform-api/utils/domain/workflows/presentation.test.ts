import { describe, expect, it } from 'vitest';

import {
  assertQuickFieldKeys,
  capabilityPresentationFields,
  capabilityPresentationInputSchema,
  normalizeFieldLabels,
  resolveQuickFieldKeys,
} from './presentation';
const fields = [
  {
    key: 'prompt',
    label: '提示词',
    type: 'textarea',
    nodeId: '1',
    inputName: 'text',
  },
  {
    key: 'width',
    label: '宽度',
    type: 'number',
    nodeId: '2',
    inputName: 'width',
  },
  {
    key: 'seed',
    label: '种子',
    type: 'number',
    advanced: true,
    nodeId: '2',
    inputName: 'seed',
  },
  {
    key: 'image',
    label: '图片',
    type: 'asset',
    acceptedKinds: ['image'],
    assetIndex: 0,
    targets: [{ nodeId: '3', inputName: 'image' }],
  },
];
describe('capability parameter presentation', () => {
  it('defaults to existing quick fields but respects an explicitly empty selection', () => {
    expect(resolveQuickFieldKeys(fields)).toEqual(['width']);
    expect(resolveQuickFieldKeys(fields, [])).toEqual([]);
  });
  it('preserves administrator ordering, allows advanced scalars, drops obsolete fields after rebinding', () => {
    assertQuickFieldKeys(fields, ['seed', 'width']);
    expect(
      resolveQuickFieldKeys(fields, ['seed', 'obsolete', 'width']),
    ).toEqual(['seed', 'width']);
  });
  it('rejects unknown fields, duplicates, primary prompt and media controls', () => {
    for (const keys of [
      ['missing'],
      ['width', 'width'],
      ['prompt'],
      ['image'],
    ]) {
      expect(() => assertQuickFieldKeys(fields, keys)).toThrow(
        '外显参数重复或不属于当前工作流的可配置参数',
      );
    }
  });
});

const workflow = {
  '1': { class_type: 'Prompt', inputs: { text: '' } },
  '2': {
    class_type: 'Size',
    _meta: { title: '图片尺寸' },
    inputs: { width: 512, seed: 1 },
  },
  '3': { class_type: 'Image', inputs: { image: '' } },
};
describe('administrator field labels', () => {
  it('overrides labels without changing keys, constraints, options or source schema', () => {
    const before = JSON.stringify(fields);
    const base = capabilityPresentationFields(fields, workflow);
    const renamed = capabilityPresentationFields(fields, workflow, {
      width: '目标宽度',
      seed: '随机值',
    });
    expect(renamed[1]).toEqual({ ...base[1], label: '目标宽度' });
    expect(renamed[2]).toEqual({ ...base[2], label: '随机值' });
    expect(JSON.stringify(fields)).toBe(before);
  });
  it('returns raw names and node titles only to administrators', () => {
    const publicFields = capabilityPresentationFields(fields, workflow);
    expect(
      publicFields.every(
        (field) =>
          !('source' in field) &&
          !('nodeId' in field) &&
          !('inputName' in field),
      ),
    ).toBe(true);
    const adminFields = capabilityPresentationFields(
      fields,
      workflow,
      {},
      true,
    );
    expect(adminFields[1]?.source).toEqual({
      inputName: 'width',
      nodeId: '2',
      nodeTitle: '图片尺寸',
    });
    expect(adminFields[0]?.source?.nodeTitle).toBe('Prompt');
  });
  it('provides translated short defaults for generated parameters and retains unknown labels', () => {
    const generated = [
      {
        ...fields[1],
        key: 'auto_width',
        inputName: 'proportional_width',
        label: '很长的节点名 · Proportional Width',
      },
      {
        ...fields[1],
        key: 'auto_unknown',
        inputName: 'unknown',
        label: '节点 · Unknown',
      },
    ];
    const result = capabilityPresentationFields(generated, workflow, {
      auto_width: '自定宽度',
    });
    expect(result[0]).toMatchObject({
      label: '自定宽度',
      defaultLabel: '输出图片宽度',
    });
    expect(result[1]?.label).toBe('节点 · Unknown');
    expect(
      capabilityPresentationFields(generated, workflow, {
        auto_width: '   ',
      })[0]?.label,
    ).toBe('输出图片宽度');
  });
  it('normalizes blank resets and rejects obsolete, prompt and media keys', () => {
    expect(
      normalizeFieldLabels(fields, { width: '  宽  ', seed: '  ' }),
    ).toEqual({ width: '宽' });
    for (const key of ['missing', 'prompt', 'image', '__proto__']) {
      expect(() =>
        normalizeFieldLabels(fields, Object.fromEntries([[key, '名称']])),
      ).toThrow('参数名称不属于');
    }
  });
  it('accepts old clients and validates type, length, count and blank resets', () => {
    const input = {
      quickFieldKeys: [],
      workflowVersionId: 'cdd6ff1a-e384-43fc-8041-cfcb89106cba',
    };
    expect(capabilityPresentationInputSchema.parse(input)).toEqual(input);
    expect(
      capabilityPresentationInputSchema.parse({
        ...input,
        fieldLabels: { width: '  ' },
      }).fieldLabels,
    ).toEqual({ width: '' });
    for (const labels of [
      { width: 1 },
      { width: 'a'.repeat(101) },
      Object.fromEntries(
        Array.from({ length: 201 }, (_, i) => [`field${i}`, 'a']),
      ),
    ]) {
      expect(
        capabilityPresentationInputSchema.safeParse({
          ...input,
          fieldLabels: labels,
        }).success,
      ).toBe(false);
    }
  });
});
