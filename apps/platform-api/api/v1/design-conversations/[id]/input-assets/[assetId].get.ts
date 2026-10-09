import { getRouterParam } from 'h3';
import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { requireDesignConversation } from '~/utils/domain/design-conversations';
import { getDesignInputAssets } from '~/utils/domain/design-input-assets';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const scope = z
    .object({ conversationId: z.string().uuid(), assetId: z.string().uuid() })
    .safeParse({
      conversationId: getRouterParam(event, 'id'),
      assetId: getRouterParam(event, 'assetId'),
    });
  if (!scope.success)
    throw new ApiError(400, 'DESIGN_INPUT_SCOPE_INVALID', '会话或图片编号无效');
  const { conversationId, assetId } = scope.data;
  const { projectId } = parseQuery(
    event,
    z.object({ projectId: z.string().uuid() }),
  );
  await requireProjectAccess(identity, projectId);
  await requireDesignConversation({
    conversationId,
    projectId,
    userId: identity.id,
  });
  const assets = await getDesignInputAssets({
    assetIds: [assetId],
    conversationId,
    projectId,
    userId: identity.id,
  });
  if (assets.length === 0)
    throw new ApiError(
      404,
      'DESIGN_INPUT_NOT_FOUND',
      '图片未入库且不属于当前会话，或已不可用',
    );
  const view = await getAssetView(assetId, identity.id);
  if (!view) throw new ApiError(404, 'DESIGN_INPUT_NOT_FOUND', '图片已不可用');
  return view;
});
