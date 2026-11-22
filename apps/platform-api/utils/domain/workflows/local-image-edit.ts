export const localImageEditKey = 'local-image-edit';
export const localEditModes = ['mask', 'color', 'number'] as const;
export type LocalEditMode = (typeof localEditModes)[number];

const localEditWorkflows = [
  'inpaint-single',
  'inpaint-reference',
  'region-edit',
  'region-marker-edit',
] as const;

export function localEditWorkflow(mode: LocalEditMode, hasReference: boolean) {
  switch (mode) {
    case 'color': {
      return 'region-edit';
    }
    case 'number': {
      return 'region-marker-edit';
    }
    default: {
      return hasReference ? 'inpaint-reference' : 'inpaint-single';
    }
  }
}

export function localImageModeKey(key: string) {
  return localEditWorkflows.some((workflow) => workflow === key)
    ? localImageEditKey
    : key;
}

// Position 2 is a private derived PNG, kept separate from the base and reference.
export const localImageDraftSlots = new Map(
  [0, 1, 2].map((index) => [index, { acceptedKinds: ['image'] }]),
);

export function hasLocalRegionMarks(value: unknown, mode: 'color' | 'number') {
  if (typeof value !== 'string' || value.length > 1_000_000) return false;
  return value.split('|').some((stroke) => {
    const parts = stroke.split(':');
    const [kind, shape] = parts;
    const markerOrPoints = parts[5];
    const numberedPoints = parts[6];
    if (kind !== 'brush' || !['box', 'free', 'square'].includes(shape ?? ''))
      return false;
    if (
      mode === 'number' &&
      (shape !== 'square' || !/^[1-6]$/.test(markerOrPoints ?? ''))
    )
      return false;
    const points = (numberedPoints ?? markerOrPoints ?? '').split(';');
    const [first] = points;
    return (
      /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(first ?? '') &&
      points.some(
        (point) =>
          point !== first && /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(point),
      )
    );
  });
}
