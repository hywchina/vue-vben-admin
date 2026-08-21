import type { PlatformApplication } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  applicationsForDesignModule,
  DESIGN_MODULES,
  promptTemplateText,
} from './design-modules';

function application(key: string, name: string) {
  return { key, name } as PlatformApplication;
}

describe('design business modules', () => {
  it('orders real applications by the selected business context', () => {
    const cmf = DESIGN_MODULES.find((item) => item.key === 'cmf');
    expect(cmf).toBeDefined();
    if (!cmf) return;
    const result = applicationsForDesignModule(
      [
        application('image-upscale', '图像放大'),
        application('text-to-image', '文生图'),
        application('camera-control-multi', '多角度'),
      ],
      cmf,
    );

    expect(result.map((item) => item.key)).toEqual([
      'text-to-image',
      'image-upscale',
      'camera-control-multi',
    ]);
  });

  it('keeps report generation explicitly unavailable', () => {
    expect(DESIGN_MODULES.find((item) => item.key === 'report')).toMatchObject({
      recommendedAppKeys: [],
      status: 'planned',
    });
  });

  it('formats a selected prompt template without hiding its category', () => {
    expect(promptTemplateText('材质', '皮革')).toBe('材质：皮革');
  });
});
