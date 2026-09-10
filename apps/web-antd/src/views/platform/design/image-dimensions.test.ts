import { describe, expect, it } from 'vitest';

import {
  linkedSize,
  resolveTemplateSize,
  sizeRatio,
  syncPromptRatio,
} from '#/modules/platform/image-dimensions';
const limit = { min: 256, max: 2048, step: 8 };
describe('image aspect ratio and template dimensions', () => {
  it('links both directions and handles portrait and square', () => {
    expect(linkedSize('16:9', 2048, 'width', limit, limit)).toEqual({
      width: 2048,
      height: 1152,
    });
    expect(linkedSize('16:9', 576, 'height', limit, limit)).toEqual({
      width: 1024,
      height: 576,
    });
    expect(linkedSize('9:16', 2048, 'width', limit, limit)).toEqual({
      width: 1152,
      height: 2048,
    });
    expect(linkedSize('1:1', 1024, 'width', limit, limit)).toEqual({
      width: 1024,
      height: 1024,
    });
    expect(sizeRatio(1920, 1080)).toBe('16:9');
  });
  it('respects bounds and steps while preserving exact ratio', () => {
    const value = linkedSize('16:9', 1000, 'width', limit, limit);
    expect(value).toEqual({ width: 1024, height: 576 });
    expect(() => linkedSize('100:1', 1024, 'width', limit, limit)).toThrow(
      '无法满足',
    );
  });
  it('applies exact template dimensions and ratio-only values without silently changing invalid sizes', () => {
    const current = { width: 2048, height: 1080 };
    expect(
      resolveTemplateSize({ width: 1024, height: 1024 }, current, limit, limit),
    ).toEqual({ width: 1024, height: 1024 });
    expect(
      resolveTemplateSize({ aspectRatio: '16:9' }, current, limit, limit),
    ).toEqual({ width: 2048, height: 1152 });
    expect(() =>
      resolveTemplateSize({ width: 999, height: 999 }, current, limit, limit),
    ).toThrow('步长');
    expect(() =>
      resolveTemplateSize(
        { width: 1024, height: 1024, aspectRatio: '16:9' },
        current,
        limit,
        limit,
      ),
    ).toThrow('不一致');
  });
});

it('updates only the dedicated ratio line and does not add it before template use', () => {
  const size = { width: 2048, height: 1152 };
  expect(syncPromptRatio('保留用户文字', size)).toBe('保留用户文字');
  const text = syncPromptRatio(
    '保留用户文字',
    { width: 1024, height: 1024 },
    true,
  );
  expect(syncPromptRatio(text, size)).toBe(
    '保留用户文字\n画面比例：16:9（2048×1152）。',
  );
  expect(syncPromptRatio(syncPromptRatio(text, size), size, true)).toBe(
    syncPromptRatio(text, size),
  );
});
