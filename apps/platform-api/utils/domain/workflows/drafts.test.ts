import { describe, expect, it } from 'vitest';

import {
  assertWorkspaceDraftParameterKeys,
  workspaceDraftAssetSelection,
} from './drafts';

const parameterSchema = [
  {
    assetIndex: 0,
    acceptedKinds: ['image'],
    key: 'image',
    label: '图片',
    targets: [{ inputName: 'image', nodeId: '1' }],
    type: 'asset',
  },
  {
    inputName: 'prompt',
    key: 'prompt',
    label: '提示词',
    nodeId: '2',
    type: 'text',
  },
];

describe('workflow workspace drafts', () => {
  it('keeps compatible exact-slot asset selections', () => {
    expect(
      workspaceDraftAssetSelection(parameterSchema, { 0: 'asset-1' }, [
        { id: 'asset-1', kind: 'image' },
      ]),
    ).toEqual({ 0: 'asset-1' });
  });

  it('drops stale selections while reading and rejects them while writing', () => {
    expect(
      workspaceDraftAssetSelection(
        parameterSchema,
        { 0: 'missing' },
        [],
        false,
      ),
    ).toEqual({});
    expect(() =>
      workspaceDraftAssetSelection(parameterSchema, { 0: 'missing' }, []),
    ).toThrow('不存在或类型不兼容');
  });

  it('does not allow one asset to occupy multiple draft input slots', () => {
    const twoSlots = [
      parameterSchema[0],
      {
        ...parameterSchema[0],
        assetIndex: 1,
        key: 'reference',
      },
    ];
    expect(() =>
      workspaceDraftAssetSelection(twoSlots, { 0: 'asset-1', 1: 'asset-1' }, [
        { id: 'asset-1', kind: 'image' },
      ]),
    ).toThrow('不存在或类型不兼容');
  });

  it('rejects unpublished parameter keys', () => {
    expect(() =>
      assertWorkspaceDraftParameterKeys(parameterSchema, { hidden: true }),
    ).toThrow('未公开');
  });
});
