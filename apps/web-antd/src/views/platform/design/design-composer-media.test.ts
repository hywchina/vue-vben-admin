import type { CapabilityField } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  assignMediaAssetIds,
  mediaInputProgress,
  moveMediaAsset,
  orderedImageMediaFields,
} from './design-composer-media';

function imageField(
  assetIndex: number,
  options: Partial<CapabilityField> = {},
): CapabilityField {
  return {
    acceptedKinds: ['image'],
    advanced: false,
    assetIndex,
    integer: false,
    key: `image-${assetIndex}`,
    label: `图片 ${assetIndex + 1}`,
    options: [],
    required: true,
    type: 'asset',
    uiControl: 'default',
    ...options,
  };
}

describe('design composer media input', () => {
  it('derives ordered image slots and required progress from the workflow', () => {
    const fields = [
      imageField(2),
      imageField(0),
      imageField(1, { required: false }),
      imageField(3, { acceptedKinds: ['document'] }),
    ];

    expect(
      orderedImageMediaFields(fields).map((field) => field.assetIndex),
    ).toEqual([0, 1, 2]);
    expect(mediaInputProgress(fields, { 0: 'asset-a' })).toEqual({
      capacity: 3,
      filled: 1,
      missingRequired: 1,
      required: 2,
    });
  });

  it('fills empty slots in order and keeps only the workflow capacity', () => {
    const result = assignMediaAssetIds(
      [imageField(0), imageField(1), imageField(2)],
      { 0: 'asset-a' },
      ['asset-a', 'asset-b', 'asset-c', 'asset-d'],
    );

    expect(result).toEqual({
      acceptedAssetIds: ['asset-b', 'asset-c'],
      discardedCount: 1,
      duplicateCount: 1,
      nextSelections: {
        0: 'asset-a',
        1: 'asset-b',
        2: 'asset-c',
      },
    });
  });

  it('moves selected images left and right without changing empty slots', () => {
    const fields = [imageField(0), imageField(1), imageField(2)];

    expect(
      moveMediaAsset(fields, { 0: 'asset-a', 2: 'asset-c' }, 0, 1),
    ).toEqual({
      0: 'asset-c',
      2: 'asset-a',
    });
    expect(moveMediaAsset(fields, { 0: 'asset-a' }, 0, -1)).toBeUndefined();
  });
});
