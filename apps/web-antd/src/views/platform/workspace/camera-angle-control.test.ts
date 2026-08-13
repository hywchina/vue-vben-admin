import { describe, expect, it } from 'vitest';

import {
  cameraPrompt,
  closestCameraPreset,
  distanceCameraPresets,
  horizontalCameraPresets,
  normalizeCameraAngle,
  verticalCameraPresets,
} from './camera-angle-control';

describe('camera angle presets', () => {
  it('uses the same preset values as the ComfyUI Qwen multiangle node', () => {
    expect(horizontalCameraPresets.map((item) => item.value)).toEqual([
      0, 45, 90, 135, 180, 225, 270, 315,
    ]);
    expect(verticalCameraPresets.map((item) => item.value)).toEqual([
      -30, 0, 30, 60,
    ]);
    expect(distanceCameraPresets.map((item) => item.value)).toEqual([1, 4, 8]);
  });

  it('normalizes free orbit values and resolves the nearest preset', () => {
    expect(normalizeCameraAngle(-45)).toBe(315);
    expect(normalizeCameraAngle(405)).toBe(45);
    expect(closestCameraPreset(350, horizontalCameraPresets, true).label).toBe(
      '正面视角',
    );
  });

  it('builds prompts with the exact ComfyUI threshold semantics', () => {
    expect(cameraPrompt(180, 30, 1)).toBe(
      '<sks> back view elevated shot wide shot',
    );
    expect(cameraPrompt(35, 0, 5)).toBe(
      '<sks> front-right quarter view eye-level shot medium shot',
    );
    expect(cameraPrompt(315, 60, 8)).toBe(
      '<sks> front-left quarter view high-angle shot close-up',
    );
  });
});
