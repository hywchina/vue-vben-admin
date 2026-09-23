import { describe, expect, it } from 'vitest';

import {
  cameraPrompt,
  cameraViewDescriptors,
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

  it('maps persisted single and multi camera fields to output descriptors', () => {
    const fields = [
      cameraField('multi1Horizontal', 'camera-horizontal', '镜头 1', 45),
      cameraField('multi1Vertical', 'camera-vertical', '镜头 1', 0),
      cameraField('multi1Zoom', 'camera-zoom', '镜头 1', 5),
      cameraField('multi2Horizontal', 'camera-horizontal', '镜头 2', 180),
      cameraField('multi2Vertical', 'camera-vertical', '镜头 2', 0),
      cameraField('multi2Zoom', 'camera-zoom', '镜头 2', 5),
    ];
    expect(
      cameraViewDescriptors(fields, {
        multi1Horizontal: 90,
        multi2Vertical: 30,
      }).map((view) => ({
        distance: view.distanceLabel,
        horizontal: view.horizontalLabel,
        vertical: view.verticalLabel,
      })),
    ).toEqual([
      { distance: '中景', horizontal: '右侧视角', vertical: '平视' },
      { distance: '中景', horizontal: '背面视角', vertical: '高角度' },
    ]);
  });
});

function cameraField(
  key: string,
  uiControl: 'camera-horizontal' | 'camera-vertical' | 'camera-zoom',
  uiGroup: string,
  defaultValue: number,
) {
  return {
    acceptedKinds: [],
    advanced: false,
    defaultValue,
    integer: false,
    key,
    label: key,
    options: [],
    required: true,
    step: 1,
    type: 'number' as const,
    uiControl,
    uiGroup,
  };
}
