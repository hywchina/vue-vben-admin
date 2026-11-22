import { getRouterParam } from 'h3';
import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { requireDesignConversation } from '~/utils/domain/design-conversations';
import { getDesignInputAssets } from '~/utils/domain/design-input-assets';
import {
  assertWorkspaceDraftParameterKeys,
  draftAssetSelection,
  workspaceDraftAssetSelection,
} from '~/utils/domain/workflows/drafts';
import {
  localEditModes,
  localEditWorkflow,
  localImageDraftSlots,
  localImageEditKey,
} from '~/utils/domain/workflows/local-image-edit';
import {
  referenceImageDraftSlots,
  referenceImageEditKey,
  referenceImageWorkflow,
} from '~/utils/domain/workflows/reference-image-edit';
import { getCapabilityByAppKey } from '~/utils/domain/workflows/repository';
import { getUuidParam } from '~/utils/http/resource-id';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const localDraftSchema = z.object({
  mode: z.enum(localEditModes),
  color: z.string().max(1_000_000).optional(),
  number: z.string().max(1_000_000).optional(),
});
const schema = z.object({
  designMode: z.enum(['cabin', 'cmf', 'component']).default('cabin'),
  inputAssetIds: z
    .record(z.string(), z.string().uuid())
    .refine(
      (value) => Object.keys(value).length <= 100,
      '输入位不能超过 100 个',
    ),
  parameterValues: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length <= 200, '参数不能超过 200 个'),
  projectId: z.string().uuid(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const conversationId = getUuidParam(event);
  const appKey = getRouterParam(event, 'appKey');
  if (!conversationId || !appKey) {
    throw new ApiError(
      400,
      'DESIGN_DRAFT_SCOPE_REQUIRED',
      '缺少设计会话或应用编号',
    );
  }
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, input.projectId, 'write');
  await requireDesignConversation({
    conversationId,
    projectId: input.projectId,
    userId: identity.id,
  });
  const sql = useDatabase();
  const [application] = await sql<{ visible: boolean }[]>`
    SELECT visible FROM applications WHERE key = ${appKey}
  `;
  if (
    !application ||
    (!application.visible && !hasAdministrativeRole(identity))
  ) {
    throw new ApiError(404, 'WORKFLOW_NOT_READY', '工作流尚未就绪');
  }
  const referenceEdit = appKey === referenceImageEditKey;
  const localEdit = appKey === localImageEditKey;
  const draftSlots = new Map([
    [localImageEditKey, localImageDraftSlots],
    [referenceImageEditKey, referenceImageDraftSlots],
  ]);
  const stagedSlots = draftSlots.get(appKey);
  const assetIds = Object.values(input.inputAssetIds);
  const { localEdit: localMeta, ...workflowParameters } = input.parameterValues;
  const localDraft = localEdit
    ? localDraftSchema.safeParse(localMeta)
    : undefined;
  if (localDraft && !localDraft.success)
    throw new ApiError(
      400,
      'WORKFLOW_DRAFT_PARAMETER_INVALID',
      '局部编辑草稿工具无效',
    );
  const draftParameters = localEdit
    ? workflowParameters
    : input.parameterValues;
  let workflowKey = referenceEdit
    ? referenceImageWorkflow(assetIds.length || 1)
    : appKey;
  if (localDraft?.success)
    workflowKey = localEditWorkflow(
      localDraft.data.mode,
      Boolean(input.inputAssetIds['1']),
    );
  const capability = workflowKey && (await getCapabilityByAppKey(workflowKey));
  if (!stagedSlots && !capability) {
    throw new ApiError(404, 'WORKFLOW_NOT_READY', '工作流尚未就绪');
  }
  try {
    if (capability)
      assertWorkspaceDraftParameterKeys(
        capability.parameterSchema,
        draftParameters,
      );
    else if (Object.keys(draftParameters).some((key) => key !== 'prompt'))
      throw new Error('当前工作流暂不可用，仅可保存编辑指令');
  } catch (error) {
    throw new ApiError(
      400,
      'WORKFLOW_DRAFT_PARAMETER_INVALID',
      error instanceof Error ? error.message : '工作流草稿参数无效',
    );
  }
  const assets = await getDesignInputAssets({
    assetIds,
    conversationId,
    projectId: input.projectId,
    userId: identity.id,
  });
  let inputAssetIds: Record<string, string>;
  try {
    inputAssetIds = stagedSlots
      ? draftAssetSelection(stagedSlots, input.inputAssetIds, assets)
      : workspaceDraftAssetSelection(
          capability && capability.parameterSchema,
          input.inputAssetIds,
          assets,
        );
    if (
      localEdit &&
      inputAssetIds['2'] &&
      assets.find(({ id }) => id === inputAssetIds['2'])?.derivedFromAssetId !==
        inputAssetIds['0']
    )
      throw new Error('遮罩必须来自当前底图');
  } catch (error) {
    throw new ApiError(
      400,
      'WORKFLOW_DRAFT_ASSET_INVALID',
      error instanceof Error ? error.message : '工作流草稿资产无效',
    );
  }
  const [draft] = await sql<{ updatedAt: Date }[]>`
    INSERT INTO design_conversation_drafts (
      conversation_id, app_key, design_mode, parameter_values, input_asset_ids
    ) VALUES (
      ${conversationId},
      ${appKey},
      ${input.designMode},
      ${sql.json(JSON.parse(JSON.stringify(input.parameterValues)))},
      ${sql.json(inputAssetIds)}
    )
    ON CONFLICT (conversation_id, app_key, design_mode) DO UPDATE SET
      parameter_values = EXCLUDED.parameter_values,
      input_asset_ids = EXCLUDED.input_asset_ids,
      updated_at = now()
    RETURNING updated_at AS "updatedAt"
  `;
  return {
    inputAssetIds,
    parameterValues: input.parameterValues,
    updatedAt: draft?.updatedAt.toISOString(),
  };
});
