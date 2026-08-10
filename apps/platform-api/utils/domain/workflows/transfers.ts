import { isWorkflowMediaParameter, workflowParameterSchema } from './schema';

export interface WorkflowTransferSelection {
  assetId: string;
  targetAssetIndex: number;
}

export function selectWorkflowTransferAssetIndex(
  parameterSchema: unknown,
  assetKind: string,
  occupiedIndexes: Iterable<number>,
) {
  const occupied = new Set(occupiedIndexes);
  return workflowTransferCompatibleAssetIndexes(
    parameterSchema,
    assetKind,
  ).find((assetIndex) => !occupied.has(assetIndex));
}

export function workflowTransferCompatibleAssetIndexes(
  parameterSchema: unknown,
  assetKind: string,
) {
  const definitions = workflowParameterSchema.array().parse(parameterSchema);
  return definitions
    .filter(
      (field) =>
        isWorkflowMediaParameter(field) &&
        field.assetIndex !== undefined &&
        field.acceptedKinds.includes(
          assetKind as (typeof field.acceptedKinds)[number],
        ),
    )
    .map((field) => field.assetIndex as number)
    .toSorted((left, right) => left - right);
}

export function assertWorkflowTransferSelections(
  transfers: WorkflowTransferSelection[],
  inputAssetIds: string[],
) {
  for (const transfer of transfers) {
    if (inputAssetIds[transfer.targetAssetIndex] !== transfer.assetId) {
      throw new Error('流转资产与目标工作流输入位不一致');
    }
  }
}
