import type { PlatformApplication } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  applicationsForDesignMode,
  designModes,
  getDesignMode,
} from '#/modules/platform/design-modes';

function application(
  key: string,
  options: Partial<PlatformApplication> = {},
): PlatformApplication {
  return {
    acceptedAssetTypes: [],
    adapterConfigured: true,
    canManageVisibility: false,
    capabilityCode: key,
    category: 'design',
    color: '#b91c32',
    description: key,
    icon: 'lucide:sparkles',
    key,
    name: key,
    outputAssetTypes: [],
    provider: 'test',
    shortName: key,
    status: 'available',
    updatedAt: '2026-08-23T00:00:00.000Z',
    visible: true,
    ...options,
  };
}

describe('design mode catalog', () => {
  it('keeps the four customer-facing modes in a stable order', () => {
    expect(designModes.map((mode) => mode.key)).toEqual([
      'cabin',
      'cmf',
      'component',
      'report',
    ]);
  });

  it('filters unavailable capabilities and follows mode ordering', () => {
    const result = applicationsForDesignMode(
      [
        application('image-upscale'),
        application('text-to-image'),
        application('inpaint-single', { visible: false }),
        application('report-generator', { capabilityCode: undefined }),
      ],
      getDesignMode('cabin'),
    );

    expect(result.map((item) => item.key)).toEqual([
      'text-to-image',
      'image-upscale',
    ]);
  });
});
