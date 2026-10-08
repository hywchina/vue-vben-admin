import type { PlatformApplication } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  defaultGenerationApplicationKey,
  designGenerationCategories,
  designGenerationCategory,
  generationApplications,
  isDesignGenerationApplication,
} from '#/modules/platform/design-generation';
import {
  applicationsForDesignMode,
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
    icon: 'lucide:image',
    key,
    name: key,
    outputAssetTypes: [],
    provider: 'test',
    shortName: key,
    status: 'available',
    updatedAt: '2026-10-08T00:00:00.000Z',
    visible: true,
    ...options,
  };
}

const applications = [
  application('text-to-image'),
  application('image-upscale'),
  application('inpaint-single'),
  application('text-to-image-lora'),
  application('text-chat'),
  application('future-workflow'),
  application('hidden', { visible: false }),
  application('unbound', { capabilityCode: undefined }),
];

describe('design generation categories', () => {
  it('keeps text-to-image as the first category and only workflow', () => {
    expect(designGenerationCategories.map((item) => item.label)).toEqual([
      '文生图',
      '图生图',
    ]);
    expect(
      generationApplications(applications, 'text').map((item) => item.key),
    ).toEqual(['text-to-image']);
    expect(defaultGenerationApplicationKey(applications, 'text')).toBe(
      'text-to-image',
    );
  });

  it('excludes text generation while retaining LoRA and new published workflows', () => {
    expect(
      generationApplications(applications, 'image').map((item) => item.key),
    ).toEqual([
      'image-upscale',
      'inpaint-single',
      'text-to-image-lora',
      'future-workflow',
    ]);
    expect(isDesignGenerationApplication('text-chat')).toBe(false);
    expect(isDesignGenerationApplication('text-to-image-lora')).toBe(true);
  });

  it('always defaults image-to-image to inpaint rather than the first list item', () => {
    expect(defaultGenerationApplicationKey(applications, 'image')).toBe(
      'inpaint-single',
    );
  });

  it('does not silently substitute another workflow if a default is unavailable', () => {
    expect(
      defaultGenerationApplicationKey([application('image-upscale')], 'image'),
    ).toBeUndefined();
    expect(
      defaultGenerationApplicationKey(
        [application('inpaint-single', { visible: false })],
        'image',
      ),
    ).toBeUndefined();
    expect(
      defaultGenerationApplicationKey(
        [application('text-to-image', { capabilityCode: undefined })],
        'text',
      ),
    ).toBeUndefined();
  });

  it('derives the category for historical replay and output editing without extra state', () => {
    expect(designGenerationCategory('text-to-image')).toBe('text');
    for (const key of [
      'inpaint-single',
      'image-upscale',
      'multi-image-edit',
      'camera-control-multi',
      'text-to-image-lora',
    ]) {
      expect(designGenerationCategory(key)).toBe('image');
    }
  });

  it('preserves the same published image function list across all three business modes', () => {
    const keys = (mode: 'cabin' | 'cmf' | 'component') =>
      generationApplications(
        applicationsForDesignMode(applications, getDesignMode(mode)),
        'image',
      ).map((item) => item.key);
    expect(keys('component')).toEqual(keys('cabin'));
    expect(keys('cmf')).toEqual(keys('cabin'));
    expect(keys('cabin')).not.toContain('text-chat');
    expect(keys('cabin')).toContain('text-to-image-lora');
  });
});
