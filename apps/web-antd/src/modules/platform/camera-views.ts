import type { CapabilityField } from './types';

import {
  cameraViewDescriptors,
  distanceCameraPreset,
  horizontalCameraPreset,
  verticalCameraPreset,
} from './camera-angles';

export interface CameraView {
  enabled: boolean;
  horizontal: number;
  id: string;
  vertical: number;
  zoom: number;
}
export const cameraViewsKey = 'cameraViews';

export function cameraViewValues(value: unknown): CameraView[] {
  return Array.isArray(value)
    ? value.filter((item): item is CameraView =>
        Boolean(
          item &&
          typeof item.id === 'string' &&
          typeof item.enabled === 'boolean' &&
          typeof item.horizontal === 'number' &&
          typeof item.vertical === 'number' &&
          typeof item.zoom === 'number',
        ),
      )
    : [];
}

export function cameraViewLabel(view: CameraView) {
  return horizontalCameraPreset(view.horizontal).label;
}

export function cameraViewDescription(view: CameraView) {
  return `${cameraViewLabel(view)} / ${verticalCameraPreset(view.vertical).label} / ${distanceCameraPreset(view.zoom).label}`;
}

export function restoreCameraViews(
  fields: CapabilityField[],
  values: Record<string, unknown>,
) {
  if (values[cameraViewsKey] !== undefined) return values[cameraViewsKey];
  const defaults = cameraViewValues(
    fields.find(({ key }) => key === cameraViewsKey)?.defaultValue,
  );
  const legacy = cameraViewDescriptors(fields, values);
  const count = values.generationCount;
  return defaults.map((view, index) => {
    const oldView = legacy[index];
    return oldView
      ? {
          ...view,
          enabled: typeof count !== 'number' || index < count,
          horizontal: oldView.horizontal,
          vertical: verticalCameraPreset(oldView.vertical).value,
          zoom:
            distanceCameraPreset(oldView.zoom).value === 4
              ? 5
              : distanceCameraPreset(oldView.zoom).value,
        }
      : { ...view };
  });
}

export function setCameraViewParameters(
  values: Record<string, unknown>,
  next: unknown,
) {
  const previous = cameraViewValues(values[cameraViewsKey])
    .filter(({ enabled }) => enabled)
    .map(({ id }) => id);
  const selected = cameraViewValues(next)
    .filter(({ enabled }) => enabled)
    .map(({ id }) => id);
  values[cameraViewsKey] = next;
  if (previous.join(',') !== selected.join(','))
    values.generationCount = Math.max(1, selected.length);
}

export function cameraCountField(
  field: CapabilityField,
  values: Record<string, unknown>,
) {
  return field.key === 'generationCount' && values[cameraViewsKey] !== undefined
    ? {
        ...field,
        min: Math.max(
          1,
          cameraViewValues(values[cameraViewsKey]).filter(
            ({ enabled }) => enabled,
          ).length,
        ),
      }
    : field;
}
