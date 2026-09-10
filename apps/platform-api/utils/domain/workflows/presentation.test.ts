import { describe, expect, it } from 'vitest';

import { assertQuickFieldKeys, resolveQuickFieldKeys } from './presentation';
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
