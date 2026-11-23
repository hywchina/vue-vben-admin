import type { CapabilityField } from './types';

export const localImageEditKey = 'local-image-edit';

export const localEditTools = [
  { label: '遮罩', mode: 'mask', workflow: 'inpaint-single' },
  { label: '区域标记', mode: 'number', workflow: 'region-marker-edit' },
] as const;

// Keep the former color mode readable for existing drafts and history.
export type LocalEditMode = 'color' | 'mask' | 'number';

export interface LocalEditDraft {
  color?: string;
  mode: LocalEditMode;
  number?: string;
}

export function isLocalEditWorkflow(key: string) {
  return (
    key === 'inpaint-reference' ||
    key === 'region-edit' ||
    localEditTools.some(({ workflow }) => workflow === key)
  );
}

export function localEditWorkflow(mode: LocalEditMode, hasReference: boolean) {
  if (mode === 'color') return 'region-marker-edit';
  if (mode === 'mask' && hasReference) return 'inpaint-reference';
  return (
    localEditTools.find((tool) => tool.mode === mode)?.workflow ??
    'inpaint-single'
  );
}

export function localEditDraft(value: unknown): LocalEditDraft {
  if (!value || typeof value !== 'object') return { mode: 'mask' };
  const draft = value as Partial<LocalEditDraft>;
  const marks = draft.mode === 'color' ? draft.color : draft.number;
  return {
    mode:
      draft.mode === 'color'
        ? 'number'
        : (localEditTools.find(({ mode }) => mode === draft.mode)?.mode ??
          'mask'),
    color: typeof draft.color === 'string' ? draft.color : undefined,
    number: typeof marks === 'string' ? marks : undefined,
  };
}

export const localEditImageFields: CapabilityField[] = [
  '编辑底图',
  '遮罩参考图（选填）',
].map((label, assetIndex) => ({
  acceptedKinds: ['image'],
  advanced: false,
  assetIndex,
  integer: false,
  key: assetIndex === 0 ? 'localEditBase' : 'localEditReference',
  label,
  options: [],
  required: assetIndex === 0,
  type: 'asset',
  uiControl: 'default',
}));
