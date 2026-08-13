export interface CameraPreset {
  label: string;
  prompt: string;
  value: number;
}

export const horizontalCameraPresets: CameraPreset[] = [
  { label: '正面视角', prompt: 'front view', value: 0 },
  { label: '右前方视角', prompt: 'front-right quarter view', value: 45 },
  { label: '右侧视角', prompt: 'right side view', value: 90 },
  { label: '右后方视角', prompt: 'back-right quarter view', value: 135 },
  { label: '背面视角', prompt: 'back view', value: 180 },
  { label: '左后方视角', prompt: 'back-left quarter view', value: 225 },
  { label: '左侧视角', prompt: 'left side view', value: 270 },
  { label: '左前方视角', prompt: 'front-left quarter view', value: 315 },
];

export const verticalCameraPresets: CameraPreset[] = [
  { label: '仰拍', prompt: 'low-angle shot', value: -30 },
  { label: '平视', prompt: 'eye-level shot', value: 0 },
  { label: '高角度', prompt: 'elevated shot', value: 30 },
  { label: '俯拍', prompt: 'high-angle shot', value: 60 },
];

export const distanceCameraPresets: CameraPreset[] = [
  { label: '远景', prompt: 'wide shot', value: 1 },
  { label: '中景', prompt: 'medium shot', value: 4 },
  { label: '特写', prompt: 'close-up', value: 8 },
];

export function normalizeCameraAngle(value: number) {
  return ((value % 360) + 360) % 360;
}

export function closestCameraPreset(
  value: number,
  presets: CameraPreset[],
  circular = false,
) {
  const first = presets[0];
  if (!first) throw new Error('Camera presets must not be empty');
  let closest = first;
  for (const preset of presets.slice(1)) {
    const rawDifference = Math.abs(value - preset.value);
    const difference = circular
      ? Math.min(rawDifference, Math.abs(rawDifference - 360))
      : rawDifference;
    const closestRawDifference = Math.abs(value - closest.value);
    const closestDifference = circular
      ? Math.min(closestRawDifference, Math.abs(closestRawDifference - 360))
      : closestRawDifference;
    if (difference < closestDifference) closest = preset;
  }
  return closest;
}

export function cameraPrompt(
  horizontal: number,
  vertical: number,
  zoom: number,
) {
  const horizontalPreset = closestCameraPreset(
    normalizeCameraAngle(horizontal),
    horizontalCameraPresets,
    true,
  );
  let verticalPreset = verticalCameraPresets[3];
  if (vertical < -15) verticalPreset = verticalCameraPresets[0];
  else if (vertical < 15) verticalPreset = verticalCameraPresets[1];
  else if (vertical < 45) verticalPreset = verticalCameraPresets[2];

  let distancePreset = distanceCameraPresets[2];
  if (zoom < 2) distancePreset = distanceCameraPresets[0];
  else if (zoom < 6) distancePreset = distanceCameraPresets[1];

  if (!verticalPreset || !distancePreset) {
    throw new Error('Camera presets must not be empty');
  }
  return `<sks> ${horizontalPreset.prompt} ${verticalPreset.prompt} ${distancePreset.prompt}`;
}
