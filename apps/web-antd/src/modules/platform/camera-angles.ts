import type { CapabilityField } from './types';

export interface CameraPreset {
  label: string;
  prompt: string;
  value: number;
}

export interface CameraViewDescriptor {
  distanceLabel: string;
  horizontal: number;
  horizontalLabel: string;
  id: string;
  index: number;
  vertical: number;
  verticalLabel: string;
  zoom: number;
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

export function horizontalCameraPreset(value: number) {
  return closestCameraPreset(
    normalizeCameraAngle(value),
    horizontalCameraPresets,
    true,
  );
}

export function verticalCameraPreset(value: number) {
  if (value < -15) return required(verticalCameraPresets[0]);
  if (value < 15) return required(verticalCameraPresets[1]);
  if (value < 45) return required(verticalCameraPresets[2]);
  return required(verticalCameraPresets[3]);
}

export function distanceCameraPreset(value: number) {
  if (value < 2) return required(distanceCameraPresets[0]);
  if (value < 6) return required(distanceCameraPresets[1]);
  return required(distanceCameraPresets[2]);
}

export function cameraPrompt(
  horizontal: number,
  vertical: number,
  zoom: number,
) {
  const horizontalPreset = horizontalCameraPreset(horizontal);
  const verticalPreset = verticalCameraPreset(vertical);
  const distancePreset = distanceCameraPreset(zoom);
  return `<sks> ${horizontalPreset.prompt} ${verticalPreset.prompt} ${distancePreset.prompt}`;
}

export function cameraViewDescriptors(
  fields: CapabilityField[],
  values: Record<string, unknown>,
) {
  const groups = new Map<
    string,
    {
      horizontal?: CapabilityField;
      vertical?: CapabilityField;
      zoom?: CapabilityField;
    }
  >();
  for (const field of fields) {
    if (!field.uiControl.startsWith('camera-')) continue;
    const id = field.uiGroup ?? '镜头 1';
    const group = groups.get(id) ?? {};
    if (field.uiControl === 'camera-horizontal') group.horizontal = field;
    if (field.uiControl === 'camera-vertical') group.vertical = field;
    if (field.uiControl === 'camera-zoom') group.zoom = field;
    groups.set(id, group);
  }

  return [...groups.entries()]
    .toSorted(
      ([left], [right]) => cameraGroupOrder(left) - cameraGroupOrder(right),
    )
    .map<CameraViewDescriptor>(([id, group], index) => {
      const horizontal = fieldNumber(group.horizontal, values);
      const vertical = fieldNumber(group.vertical, values);
      const zoom = fieldNumber(group.zoom, values);
      return {
        distanceLabel: distanceCameraPreset(zoom).label,
        horizontal,
        horizontalLabel: horizontalCameraPreset(horizontal).label,
        id,
        index,
        vertical,
        verticalLabel: verticalCameraPreset(vertical).label,
        zoom,
      };
    });
}

function cameraGroupOrder(value: string) {
  const match = value.match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function fieldNumber(
  field: CapabilityField | undefined,
  values: Record<string, unknown>,
) {
  if (!field) return 0;
  const value = values[field.key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return typeof field.defaultValue === 'number' ? field.defaultValue : 0;
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Camera preset is missing');
  return value;
}
