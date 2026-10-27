import { getRouterParam } from 'h3';
import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireAssetContentAccess } from '~/utils/domain/assets/content-access';
import { requireDesignConversation } from '~/utils/domain/design-conversations';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

// Referencing an owned working image does not publish it to project members.
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const scope = z
    .object({ conversationId: z.string().uuid(), assetId: z.string().uuid() })
    .safeParse({
      conversationId: getRouterParam(event, 'id'),
      assetId: getRouterParam(event, 'assetId'),
    });
  if (!scope.success)
    throw new ApiError(400, 'DESIGN_INPUT_SCOPE_INVALID', '会话或图片编号无效');
  const { projectId } = await parseBody(
    event,
    z.object({ projectId: z.string().uuid() }),
  );
  const { conversationId, assetId } = scope.data;
  await requireProjectAccess(identity, projectId, 'write');
  await requireDesignConversation({
    conversationId,
    projectId,
    userId: identity.id,
  });
  await requireAssetContentAccess(assetId, identity.id);
  const sql = useDatabase();
  const [asset] = await sql`
    SELECT a.id FROM assets a
    JOIN asset_versions v ON v.asset_id = a.id AND v.version = a.current_version
    WHERE a.id = ${assetId} AND a.project_id = ${projectId}
      AND a.kind = 'image' AND a.status = 'available' AND a.deleted_at IS NULL
      AND v.status = 'available'
  `;
  if (!asset)
    throw new ApiError(
      404,
      'DESIGN_INPUT_NOT_FOUND',
      '图片已不可用或不属于当前项目',
    );
  const added = await sql`
    INSERT INTO design_input_assets (asset_id, design_conversation_id, created_by)
    VALUES (${assetId}, ${conversationId}, ${identity.id})
    ON CONFLICT DO NOTHING RETURNING asset_id
  `;
  if (added.length > 0)
    await writeAudit(event, {
      action: 'design.input.reference',
      actor: identity,
      module: 'design',
      targetId: assetId,
      targetType: 'asset',
      details: { conversationId },
    });
  return await getAssetView(assetId, identity.id);
});
