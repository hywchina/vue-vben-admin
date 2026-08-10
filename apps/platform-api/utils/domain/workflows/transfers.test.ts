import { describe, expect, it } from 'vitest';

import {
  assertWorkflowTransferSelections,
  selectWorkflowTransferAssetIndex,
  workflowTransferCompatibleAssetIndexes,
} from './transfers';

const imageField = (assetIndex: number, acceptedKinds = ['image']) => ({
  acceptedKinds,
  assetIndex,
  key: `image${assetIndex}`,
  label: `图片 ${assetIndex + 1}`,
  required: false,
  targets: [
    { inputName: 'image', nodeId: String(assetIndex + 1), transport: 'upload' },
  ],
  type: 'asset',
});

describe('workflow asset transfers', () => {
  it('uses the first compatible empty workflow input slot', () => {
    expect(
      selectWorkflowTransferAssetIndex(
        [imageField(0), imageField(1), imageField(2, ['model3d'])],
        'image',
        [0],
      ),
    ).toBe(1);
  });

  it('does not place an incompatible asset or overwrite a pending slot', () => {
    expect(
      selectWorkflowTransferAssetIndex([imageField(0)], 'text', []),
    ).toBeUndefined();
    expect(
      selectWorkflowTransferAssetIndex([imageField(0)], 'image', [0]),
    ).toBeUndefined();
  });

  it('returns the exact compatible target positions for explicit selection', () => {
    expect(
      workflowTransferCompatibleAssetIndexes(
        [imageField(0), imageField(1), imageField(2, ['model3d'])],
        'image',
      ),
    ).toEqual([0, 1]);
  });

  it('requires a consumed transfer to match its persisted input position', () => {
    expect(() =>
      assertWorkflowTransferSelections(
        [{ assetId: 'asset-2', targetAssetIndex: 1 }],
        ['asset-1', 'asset-2'],
      ),
    ).not.toThrow();
    expect(() =>
      assertWorkflowTransferSelections(
        [{ assetId: 'asset-2', targetAssetIndex: 0 }],
        ['asset-1', 'asset-2'],
      ),
    ).toThrow('流转资产与目标工作流输入位不一致');
  });
});
