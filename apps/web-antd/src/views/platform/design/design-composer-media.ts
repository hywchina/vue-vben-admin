import type { CapabilityField } from '#/modules/platform/types';

const imageMediaTypes = new Set(['asset', 'capture', 'mask', 'region']);

export const referenceImageSlots: CapabilityField[] = [
  '底图',
  '设计参考',
  '材质参考',
].map((label, assetIndex) => ({
  acceptedKinds: ['image'],
  advanced: false,
  assetIndex,
  integer: false,
  key: `referenceImage${assetIndex + 1}`,
  label,
  options: [],
  required: assetIndex === 0,
  type: 'asset',
  uiControl: 'default',
}));

export const referenceImagePlaceholders = [
  '以图1为底图，描述你想修改的内容',
  '以图1为底图，参考图2调整设计',
  '以图1为空间基础，融入图2的设计和图3的材质',
];

export function compactImageSelection(
  selection: Readonly<Record<string, string>>,
) {
  return Object.fromEntries(
    Object.values(selection)
      .filter(Boolean)
      .map((id, index) => [index, id]),
  );
}

export interface MediaAssetAssignmentResult {
  acceptedAssetIds: string[];
  discardedCount: number;
  duplicateCount: number;
  nextSelections: Record<number, string>;
}

export function orderedImageMediaFields(fields: readonly CapabilityField[]) {
  return fields
    .filter(
      (field) =>
        field.assetIndex !== undefined &&
        imageMediaTypes.has(field.type) &&
        field.acceptedKinds.includes('image'),
    )
    .toSorted(
      (left, right) => (left.assetIndex ?? 0) - (right.assetIndex ?? 0),
    );
}

export function mediaInputProgress(
  fields: readonly CapabilityField[],
  selections: Readonly<Record<number, string>>,
) {
  const orderedFields = orderedImageMediaFields(fields);
  const filled = orderedFields.filter(
    (field) =>
      field.assetIndex !== undefined && Boolean(selections[field.assetIndex]),
  ).length;
  const required = orderedFields.filter((field) => field.required).length;
  return {
    capacity: orderedFields.length,
    filled,
    missingRequired: orderedFields.filter(
      (field) =>
        field.required &&
        field.assetIndex !== undefined &&
        !selections[field.assetIndex],
    ).length,
    required,
  };
}

export function assignMediaAssetIds(
  fields: readonly CapabilityField[],
  selections: Readonly<Record<number, string>>,
  incomingAssetIds: readonly string[],
): MediaAssetAssignmentResult {
  const nextSelections = { ...selections };
  const selectedIds = new Set(Object.values(nextSelections).filter(Boolean));
  const emptyFields = orderedImageMediaFields(fields).filter(
    (field) =>
      field.assetIndex !== undefined && !nextSelections[field.assetIndex],
  );
  const acceptedAssetIds: string[] = [];
  let duplicateCount = 0;
  let discardedCount = 0;

  for (const assetId of incomingAssetIds) {
    if (selectedIds.has(assetId)) {
      duplicateCount += 1;
      continue;
    }
    const field = emptyFields.shift();
    if (!field || field.assetIndex === undefined) {
      discardedCount += 1;
      continue;
    }
    nextSelections[field.assetIndex] = assetId;
    selectedIds.add(assetId);
    acceptedAssetIds.push(assetId);
  }

  return {
    acceptedAssetIds,
    discardedCount,
    duplicateCount,
    nextSelections,
  };
}

export function moveMediaAsset(
  fields: readonly CapabilityField[],
  selections: Readonly<Record<number, string>>,
  sourceAssetIndex: number,
  direction: -1 | 1,
) {
  const occupiedIndexes = orderedImageMediaFields(fields).flatMap((field) => {
    const assetIndex = field.assetIndex;
    return assetIndex !== undefined && selections[assetIndex]
      ? [assetIndex]
      : [];
  });
  const sourcePosition = occupiedIndexes.indexOf(sourceAssetIndex);
  const targetAssetIndex = occupiedIndexes[sourcePosition + direction];
  if (sourcePosition === -1 || targetAssetIndex === undefined) return undefined;
  const sourceAssetId = selections[sourceAssetIndex];
  const targetAssetId = selections[targetAssetIndex];
  if (!sourceAssetId || !targetAssetId) return undefined;
  return {
    ...selections,
    [sourceAssetIndex]: targetAssetId,
    [targetAssetIndex]: sourceAssetId,
  };
}
