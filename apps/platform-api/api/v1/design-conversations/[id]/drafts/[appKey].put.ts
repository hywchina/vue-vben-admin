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
  imageGenerationCountField,
  splitImageGenerationParameters,
} from '~/utils/domain/workflows/image-generation-count';
import {
  localEditModes,
  localEditWorkflow,
  localImageDraftSlots,
  localImageEditKey,
} from '~/utils/domain/workflows/local-image-edit';
import { splitOptionalLora } from '~/utils/domain/workflows/optional-lora';
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
  regionPrompts: z
    .record(
      z
        .string()
        .regex(/^(number_[1-6]|color_(black|white|red|green|blue|gray))$/),
      z.string().max(2000),
    )
    .optional(),
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
  writeToken: z
    .object({
      writerId: z.string().uuid(),
      sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      baseRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    })
    .strict()
    .optional(),
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
        Boolean(imageGenerationCountField(capability.appKey)),
        capability.appKey === 'camera-control-multi',
      );
    else {
      const { views, workflowParameters: remaining } =
        splitImageGenerationParameters(
          splitOptionalLora(draftParameters).workflowParameters,
        );
      if (views) throw new Error('当前功能不支持多视角选择');
      if (Object.keys(remaining).some((key) => key !== 'prompt'))
        throw new Error('当前工作流暂不可用，仅可保存编辑指令和生成数量');
    }
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
  const token = input.writeToken;
  const [draft] = await sql<{ revision: number; updatedAt: Date }[]>`
    INSERT INTO design_conversation_drafts (
      conversation_id, app_key, design_mode, parameter_values, input_asset_ids,
      revision, writer_id, writer_sequence
    ) SELECT
      ${conversationId},
      ${appKey},
      ${input.designMode},
      ${sql.json(JSON.parse(JSON.stringify(input.parameterValues)))},
      ${sql.json(inputAssetIds)},
      1, ${token?.writerId ?? null}::uuid, ${token?.sequence ?? 0}
    WHERE ${!token || token.baseRevision === 0} OR EXISTS (
      SELECT 1 FROM design_conversation_drafts
      WHERE conversation_id = ${conversationId} AND app_key = ${appKey}
        AND design_mode = ${input.designMode}
    )
    ON CONFLICT (conversation_id, app_key, design_mode) DO UPDATE SET
      parameter_values = EXCLUDED.parameter_values,
      input_asset_ids = EXCLUDED.input_asset_ids,
      updated_at = now(),
      revision = design_conversation_drafts.revision + 1,
      writer_id = EXCLUDED.writer_id,
      writer_sequence = EXCLUDED.writer_sequence
    WHERE ${!token}
      OR (design_conversation_drafts.writer_id = EXCLUDED.writer_id
        AND design_conversation_drafts.writer_sequence < EXCLUDED.writer_sequence)
      OR (design_conversation_drafts.writer_id IS DISTINCT FROM EXCLUDED.writer_id
        AND design_conversation_drafts.revision = ${token?.baseRevision ?? 0})
    RETURNING updated_at AS "updatedAt", revision::float8 AS revision
  `;
  if (!draft) {
    const [current] = await sql<
      {
        revision: number;
        sequence: number;
        updatedAt: Date;
        writerId: null | string;
      }[]
    >`
      SELECT writer_id AS "writerId", writer_sequence::float8 AS sequence,
        revision::float8 AS revision, updated_at AS "updatedAt"
      FROM design_conversation_drafts
      WHERE conversation_id = ${conversationId} AND app_key = ${appKey}
        AND design_mode = ${input.designMode}
    `;
    if (
      token &&
      current?.writerId === token.writerId &&
      current.sequence >= token.sequence
    )
      return {
        applied: false,
        revision: current.revision,
        updatedAt: current.updatedAt.toISOString(),
      };
    throw new ApiError(
      409,
      'DESIGN_DRAFT_CONFLICT',
      '草稿已在其他页面更新，请先保留当前内容，再重新载入',
    );
  }
  return {
    inputAssetIds,
    parameterValues: input.parameterValues,
    updatedAt: draft?.updatedAt.toISOString(),
    revision: draft.revision,
    applied: true,
  };
});
