import type { PlatformApplication } from '#/modules/platform/types';

import { describe, expect, it } from 'vitest';

import {
  applicationsForDesignMode,
  designModeForApplication,
  designModes,
  getDesignMode,
} from '#/modules/platform/design-modes';
import { designImageResultActions } from '#/modules/platform/design-result-actions';

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
      'component',
      'cmf',
      'cabin',
      'report',
    ]);
    expect(getDesignMode('report').standalonePath).toBe('/report-generation');
    expect(designModes.map((mode) => mode.backgroundImage)).toEqual([
      '/design-modes/component.webp',
      '/design-modes/cmf.webp',
      '/design-modes/cabin.webp',
      '/design-modes/report.webp',
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

  it('keeps each image mode quick-tool order and placeholder stable', () => {
    expect(
      getDesignMode('component').primaryTools?.map((tool) => tool.label),
    ).toEqual([
      '文生图',
      '局部重绘',
      '标记修改',
      '多图融合',
      '多角度生成',
      '三维生成',
      '图像放大',
      '图片理解',
    ]);
    expect(
      getDesignMode('cabin').primaryTools?.map((tool) => tool.label),
    ).toEqual([
      '文生图',
      '标记生成',
      '局部重绘',
      '部件/材质融合',
      '平面图填色',
      '环境更改',
      '图像放大',
      '图像理解',
    ]);
    expect(
      getDesignMode('cmf').primaryTools?.map((tool) => tool.label),
    ).toEqual(['文生图', '局部重绘', '多图融合', '图像放大', '图片理解']);
    expect(getDesignMode('cmf').placeholder).toBe(
      '描述你的设计需求，如生成二方连续/四方连续、颜色、面料材质、图案形式、风格、图像尺寸的纹样……',
    );
    expect(getDesignMode('component').placeholder).toBe(
      '描述你的设计需求，如生成部件类型、角度、颜色、表面材质、图像尺寸等……',
    );
    expect(getDesignMode('cabin').placeholder).toBe(
      '描述你的设计需求，如生成客室类型、画面角度、部件颜色、材质、图像尺寸等……',
    );
  });

  it('keeps shared applications in the selected mode', () => {
    expect(designModeForApplication('text-to-image', 'cmf').key).toBe('cmf');
    expect(designModeForApplication('multiview-to-3d', 'cabin').key).toBe(
      'component',
    );
  });

  it('keeps mode-specific image result actions in the required order', () => {
    expect(
      designImageResultActions('component').map((item) => item.label),
    ).toEqual([
      '下载',
      '添加至资产中心',
      '重新绘制',
      '局部重绘',
      '标记修改',
      '多图融合',
      '图像放大',
      '图像理解',
      '多角度生成',
      '三维生成',
    ]);
    expect(designImageResultActions('cabin').map((item) => item.label)).toEqual(
      [
        '下载',
        '添加至资产中心',
        '重新绘制',
        '局部重绘',
        '标记修改',
        '部件/材质融合',
        '图像放大',
        '环境更改',
        '图像理解',
        '多角度生成',
      ],
    );
  });
});
