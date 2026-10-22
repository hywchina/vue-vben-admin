import type { CaptureCrop } from './capture-frame';

import { describe, expect, it, vi } from 'vitest';

import { copyCaptureMaskAlpha, drawCapturedFrame } from './capture-frame';

describe('capture preview and submitted frame coordinates', () => {
  it.each([
    { x: 741, y: 211, width: 691, height: 1010 },
    { x: 320, y: 260, width: 1200, height: 600 },
    { x: 0, y: 0, width: 200, height: 200 },
  ])(
    'uses identical source crop and aspect for preview and upload: %s',
    (area) => {
      const crop: CaptureCrop = {
        ...area,
        sourceWidth: 2560,
        sourceHeight: 1440,
      };
      const draw = vi.fn();
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: draw }),
      } as unknown as HTMLCanvasElement;
      const video = { videoWidth: 2560, videoHeight: 1440 } as HTMLVideoElement;
      drawCapturedFrame(canvas, video, crop, 480);
      const previewDimensions = [canvas.width, canvas.height] as const;
      drawCapturedFrame(canvas, video, crop);
      expect(draw.mock.calls.map((call) => call.slice(1, 5))).toEqual([
        [area.x, area.y, area.width, area.height],
        [area.x, area.y, area.width, area.height],
      ]);
      expect([canvas.width, canvas.height]).toEqual([area.width, area.height]);
      expect(Math.max(...previewDimensions)).toBeLessThanOrEqual(480);
      expect(previewDimensions[0] / previewDimensions[1]).toBeCloseTo(
        area.width / area.height,
        2,
      );
    },
  );

  it('ignores stale crop when the source resolution changes', () => {
    const draw = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: draw }),
    } as unknown as HTMLCanvasElement;
    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    drawCapturedFrame(canvas, video, {
      x: 741,
      y: 211,
      width: 691,
      height: 1010,
      sourceWidth: 2560,
      sourceHeight: 1440,
    });
    expect(draw).toHaveBeenCalledWith(video, 0, 0, 640, 480, 0, 0, 640, 480);
  });
});

describe('live mask preservation', () => {
  it('keeps the new frame RGB and uses the edited mask alpha', () => {
    const frame = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    copyCaptureMaskAlpha(
      frame,
      new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 128]),
    );
    expect([...frame]).toEqual([10, 20, 30, 0, 40, 50, 60, 128]);
  });
  it('rejects a changed mask size', () => {
    expect(() =>
      copyCaptureMaskAlpha(new Uint8ClampedArray(4), new Uint8ClampedArray(8)),
    ).toThrow('实时画面与遮罩尺寸不匹配');
  });
});
