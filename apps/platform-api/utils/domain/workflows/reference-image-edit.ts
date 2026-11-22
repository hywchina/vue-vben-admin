export const referenceImageEditKey = 'reference-image-edit';
const referenceWorkflows = [
  'single-image-edit',
  'image-edit-kv',
  'multi-image-edit',
] as const;

export function referenceImageWorkflow(imageCount: number) {
  return referenceWorkflows[imageCount - 1];
}

export function referenceImageModeKey(appKey: string) {
  return referenceWorkflows.some((key) => key === appKey)
    ? referenceImageEditKey
    : appKey;
}

// The staged draft can hold all three positions before a workflow is selected.
export const referenceImageDraftSlots = new Map(
  referenceWorkflows.map((_, index) => [index, { acceptedKinds: ['image'] }]),
);
