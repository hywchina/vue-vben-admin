import { getRouterParam } from 'h3';
import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { requireDesignConversation } from '~/utils/domain/design-conversations';
import { getDesignInputAssets } from '~/utils/domain/design-input-assets';
import { workspaceDraftAssetSelection } from '~/utils/domain/workflows/drafts';
import { getCapabilityByAppKey } from '~/utils/domain/workflows/repository';
import { getUuidParam } from '~/utils/http/resource-id';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  projectId: z.string().uuid(),
  designMode: z.enum(['cabin', 'cmf', 'component']).default('cabin'),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const conversationId = getUuidParam(event);
  const appKey = getRouterParam(event, 'appKey');
  if (!conversationId || !appKey) {
    throw new ApiError(
      400,
      'DESIGN_DRAFT_SCOPE_REQUIRED',
      '缺少设计会话或应用编号',
    );
  }
  const { projectId, designMode } = parseQuery(event, querySchema);
  await requireProjectAccess(identity, projectId);
  await requireDesignConversation({
    conversationId,
    projectId,
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
  const capability = await getCapabilityByAppKey(appKey);
  if (!capability) {
    throw new ApiError(404, 'WORKFLOW_NOT_READY', '工作流尚未就绪');
  }
  const [draft] = await sql<
    {
      inputAssetIds: Record<string, string>;
      parameterValues: Record<string, unknown>;
      updatedAt: Date;
    }[]
  >`
    SELECT
      parameter_values AS "parameterValues",
      input_asset_ids AS "inputAssetIds",
      updated_at AS "updatedAt"
    FROM design_conversation_drafts
    WHERE conversation_id = ${conversationId}
      AND app_key = ${appKey}
      AND design_mode = ${designMode}
  `;
  if (!draft) {
    return { inputAssetIds: {}, parameterValues: {}, updatedAt: undefined };
  }
  const assetIds = Object.values(draft.inputAssetIds);
  const assets = await getDesignInputAssets({
    assetIds,
    conversationId,
    projectId,
    userId: identity.id,
  });
  return {
    inputAssetIds: workspaceDraftAssetSelection(
      capability.parameterSchema,
      draft.inputAssetIds,
      assets,
      false,
    ),
    parameterValues: draft.parameterValues,
    updatedAt: draft.updatedAt.toISOString(),
  };
});
