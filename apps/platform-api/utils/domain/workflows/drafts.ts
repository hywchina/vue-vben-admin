import { splitImageGenerationParameters } from './image-generation-count';
import { isWorkflowMediaParameter, workflowParameterSchema } from './schema';

export interface WorkspaceDraftAsset {
  id: string;
  kind: string;
}

export function assertWorkspaceDraftParameterKeys(
  parameterSchema: unknown,
  parameterValues: Record<string, unknown>,
  allowImageGenerationCount = false,
  allowCameraViews = false,
) {
  if (allowImageGenerationCount) {
    const { views, workflowParameters } =
      splitImageGenerationParameters(parameterValues);
    if (views && !allowCameraViews) throw new Error('当前功能不支持多视角选择');
    parameterValues = workflowParameters;
  }
  const definitions = workflowParameterSchema.array().parse(parameterSchema);
  const allowed = new Set(
    definitions.flatMap((field) =>
      !isWorkflowMediaParameter(field) || field.type === 'region'
        ? [field.key]
        : [],
    ),
  );
  const unknown = Object.keys(parameterValues).filter(
    (key) => !allowed.has(key),
  );
  if (unknown.length > 0) {
    throw new Error(`草稿包含未公开的工作流参数：${unknown.join('、')}`);
  }
}

export function workspaceDraftAssetSelection(
  parameterSchema: unknown,
  inputAssetIds: Record<string, string>,
  assets: WorkspaceDraftAsset[],
  strict = true,
) {
  const definitions = workflowParameterSchema.array().parse(parameterSchema);
  const mediaByIndex = new Map(
    definitions.flatMap((field) =>
      isWorkflowMediaParameter(field) && field.assetIndex !== undefined
        ? [[field.assetIndex, field] as const]
        : [],
    ),
  );
  return draftAssetSelection(mediaByIndex, inputAssetIds, assets, strict);
}

export function draftAssetSelection(
  mediaByIndex: ReadonlyMap<number, { acceptedKinds: readonly string[] }>,
  inputAssetIds: Record<string, string>,
  assets: WorkspaceDraftAsset[],
  strict = true,
) {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const sanitized: Record<string, string> = {};
  const selectedAssetIds = new Set<string>();

  for (const [rawIndex, assetId] of Object.entries(inputAssetIds)) {
    const index = Number(rawIndex);
    const field =
      Number.isInteger(index) && index >= 0 && index <= 99
        ? mediaByIndex.get(index)
        : undefined;
    const asset = assetById.get(assetId);
    const valid =
      field &&
      asset &&
      !selectedAssetIds.has(assetId) &&
      field.acceptedKinds.some((kind) => kind === asset.kind);
    if (!valid) {
      if (strict) {
        throw new Error(`草稿输入位 ${rawIndex} 的资产不存在或类型不兼容`);
      }
      continue;
    }
    sanitized[String(index)] = assetId;
    selectedAssetIds.add(assetId);
  }
  return sanitized;
}
