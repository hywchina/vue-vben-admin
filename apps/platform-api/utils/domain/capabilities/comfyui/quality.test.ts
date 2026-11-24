import { describe, expect, it } from 'vitest';

import { constrainCameraScene, finalText } from './quality';

describe('generated content quality', () => {
  it('keeps the camera trigger and every planned view inside the original cabin', () => {
    const graph = {
      camera: {
        class_type: 'QwenMultiangleCameraNode',
        inputs: { horizontal_angle: 180, vertical_angle: 30, zoom: 1 },
      },
      first: {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { prompt: ['camera', 0] },
      },
      second: {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { prompt: '<sks> right side view eye-level shot medium shot' },
      },
    };
    const result = constrainCameraScene(graph, 'cabin');
    expect(result.first?.inputs.prompt).toContain(
      '<sks> back view elevated shot wide shot',
    );
    expect(result.second?.inputs.prompt).toContain('INSIDE');
    expect(result.second?.inputs.prompt).toContain('right side view');
  });
  it('does not change unrelated image-edit instructions', () => {
    const graph = {
      edit: {
        class_type: 'TextEncodeQwenImageEditPlus',
        inputs: { prompt: 'red seat' },
      },
    };
    expect(constrainCameraScene(graph, 'cabin')).toEqual(graph);
  });
  it('strips complete reasoning and refuses truncated reasoning-only replies', () => {
    expect(finalText('<think>draft</think>\n最终正文')).toBe('最终正文');
    expect(() => finalText('<think>incomplete')).toThrow('最终正文');
    expect(finalText('正文\n<think>incomplete')).toBe('正文');
  });
  it('retains supplied dimensions, removes invented measurements, and keeps prose numbers', () => {
    const text = finalText(
      '1. 通道 800 mm，座椅 45 cm。第2部分。',
      '通道暂定800 mm，尚未验证',
    );
    expect(text).toContain('800 mm');
    expect(text).not.toContain('45 cm');
    expect(text).toContain('待确认参数');
    expect(text).toContain('第2部分');
    expect(finalText('通道≥800mm', '通道≤800mm')).not.toContain('800');
    expect(finalText('GB/T 1234 与比例1:1', 'GB/T 12345、1:12')).not.toContain(
      'GB/T 1234',
    );
    const other = finalText(
      '提供事实：每排8个座位，应急面积≥10%，角度12°～15°。',
      '设计方案',
    );
    expect(other).not.toMatch(/8个座位|10%|12°|15°|提供事实/);
    expect(finalText('尺寸800毫米。', '暂定800 mm')).toContain('800毫米');
  });
});
