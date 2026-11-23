import { randomUUID } from 'node:crypto';

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
import { copyObject, deleteObject } from '~/utils/storage';
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
  const [source] = await sql`
    SELECT a.project_id, a.saved_at, a.name, a.description, v.id AS version_id,
      v.object_key, v.original_filename, v.mime_type, v.size_bytes
    FROM assets a JOIN asset_versions v ON v.asset_id = a.id AND v.version = a.current_version
    WHERE a.id = ${assetId} AND a.kind = 'image' AND a.status = 'available'
      AND a.deleted_at IS NULL AND v.status = 'available' AND v.storage_kind = 'object'
  `;
  if (source && source.project_id !== projectId) {
    await requireProjectAccess(identity, source.project_id);
    requirePermission(identity, 'platform:asset:write');
    if (!source.saved_at)
      throw new ApiError(
        404,
        'DESIGN_INPUT_NOT_FOUND',
        '跨项目只能选择已入库图片',
      );
    const [existing] = await sql`
      SELECT a.id FROM assets a JOIN asset_versions v ON v.asset_id = a.id AND v.version = a.current_version
      JOIN design_input_assets d ON d.asset_id = a.id
      WHERE a.project_id = ${projectId} AND a.deleted_at IS NULL AND a.status = 'available'
        AND v.status = 'available' AND d.design_conversation_id = ${conversationId}
        AND d.created_by = ${identity.id} AND v.metadata ->> 'sourceAssetVersionId' = ${source.version_id}
    `;
    if (existing) return await getAssetView(existing.id, identity.id);
    const id = randomUUID();
    const versionId = randomUUID();
    const objectKey = `${projectId}/${id}/v1/${versionId}`;
    await copyObject(source.object_key, objectKey);
    try {
      await sql.begin(async (transaction) => {
        await transaction`
          INSERT INTO assets (id, project_id, name, description, kind, owner_id, status, saved_at)
          VALUES (${id}, ${projectId}, ${source.name}, ${source.description}, 'image', ${identity.id}, 'available', NULL)
        `;
        await transaction`
          INSERT INTO asset_versions (id, asset_id, version, storage_kind, object_key, original_filename,
            mime_type, size_bytes, status, metadata, created_by, completed_at)
          VALUES (${versionId}, ${id}, 1, 'object', ${objectKey}, ${source.original_filename},
            ${source.mime_type}, ${source.size_bytes}, 'available',
            ${transaction.json({ sourceAssetId: assetId, sourceProjectId: source.project_id, sourceAssetVersionId: source.version_id })}, ${identity.id}, now())
        `;
        await transaction`
          INSERT INTO design_input_assets (asset_id, design_conversation_id, created_by)
          VALUES (${id}, ${conversationId}, ${identity.id})
        `;
      });
    } catch (error) {
      await deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
    await writeAudit(event, {
      action: 'design.input.import',
      actor: identity,
      module: 'design',
      targetId: id,
      targetType: 'asset',
      details: {
        conversationId,
        sourceAssetId: assetId,
        sourceProjectId: source.project_id,
      },
    });
    return await getAssetView(id, identity.id);
  }
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
