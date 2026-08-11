import type {
  PixelBuffer,
  RgbColor,
} from '../components/platform/comfy-mask-editor-utils';

import { describe, expect, it } from 'vitest';

import {
  colorSelectFill,
  invertMask,
  paintBucketFill,
  transformedPixels,
} from '../components/platform/comfy-mask-editor-utils';

const black: RgbColor = { b: 0, g: 0, r: 0 };

function pixels(values: number[][], width: number): PixelBuffer {
  return {
    data: new Uint8ClampedArray(values.flat()),
    height: values.length / width,
    width,
  };
}

function alphas(buffer: PixelBuffer) {
  return [...buffer.data].filter((_, index) => index % 4 === 3);
}

describe('comfyUI 遮罩像素工具', () => {
  it('按官方语义在连续区域填充，再次点击完整遮罩区域时清除', () => {
    const mask = pixels(
      [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 255],
      ],
      3,
    );

    expect(paintBucketFill(mask, { x: 0, y: 0 }, 0, 255, black)).toBe(true);
    expect(alphas(mask)).toEqual([255, 255, 255]);
    expect(paintBucketFill(mask, { x: 0, y: 0 }, 0, 255, black)).toBe(true);
    expect(alphas(mask)).toEqual([0, 0, 0]);
  });

  it('颜色选取支持连续区域与整图两种范围', () => {
    const image = pixels(
      [
        [255, 0, 0, 255],
        [0, 0, 255, 255],
        [255, 0, 0, 255],
      ],
      3,
    );
    const connectedMask = pixels(
      [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      3,
    );
    colorSelectFill(
      image,
      connectedMask,
      { x: 0, y: 0 },
      {
        applyWholeImage: false,
        maskBoundary: false,
        maskTolerance: 0,
        method: 'simple',
        opacity: 255,
        tolerance: 0,
      },
      black,
    );
    expect(alphas(connectedMask)).toEqual([255, 0, 0]);

    const wholeMask = pixels(
      [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      3,
    );
    colorSelectFill(
      image,
      wholeMask,
      { x: 0, y: 0 },
      {
        applyWholeImage: true,
        maskBoundary: false,
        maskTolerance: 0,
        method: 'simple',
        opacity: 255,
        tolerance: 0,
      },
      black,
    );
    expect(alphas(wholeMask)).toEqual([255, 0, 255]);
  });

  it('反转遮罩并对三个画布通用的像素变换保持坐标正确', () => {
    const mask = pixels(
      [
        [10, 20, 30, 0],
        [10, 20, 30, 255],
      ],
      2,
    );
    invertMask(mask, black);
    expect(alphas(mask)).toEqual([255, 0]);

    const rotated = transformedPixels(mask, 'rotate-right');
    expect(rotated.width).toBe(1);
    expect(rotated.height).toBe(2);
    expect(alphas(rotated)).toEqual([255, 0]);

    const mirrored = transformedPixels(mask, 'mirror-horizontal');
    expect(alphas(mirrored)).toEqual([0, 255]);
  });
});
