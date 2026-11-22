import type { CapabilityField } from './types';

export const localImageEditKey = 'local-image-edit';

export const localEditTools = [
  { label: '遮罩', mode: 'mask', workflow: 'inpaint-single' },
  { label: '颜色分区', mode: 'color', workflow: 'region-edit' },
  { label: '编号分区', mode: 'number', workflow: 'region-marker-edit' },
] as const;

export type LocalEditMode = (typeof localEditTools)[number]['mode'];

export interface LocalEditDraft {
  color?: string;
  mode: LocalEditMode;
  number?: string;
}

export function isLocalEditWorkflow(key: string) {
  return (
    key === 'inpaint-reference' ||
    localEditTools.some(({ workflow }) => workflow === key)
  );
}

export function localEditWorkflow(mode: LocalEditMode, hasReference: boolean) {
  if (mode === 'mask' && hasReference) return 'inpaint-reference';
  return (
    localEditTools.find((tool) => tool.mode === mode)?.workflow ??
    'inpaint-single'
  );
}

export function localEditDraft(value: unknown): LocalEditDraft {
  if (!value || typeof value !== 'object') return { mode: 'mask' };
  const draft = value as Partial<LocalEditDraft>;
  return {
    mode:
      localEditTools.find(({ mode }) => mode === draft.mode)?.mode ?? 'mask',
    color: typeof draft.color === 'string' ? draft.color : undefined,
    number: typeof draft.number === 'string' ? draft.number : undefined,
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
