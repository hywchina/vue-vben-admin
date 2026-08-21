import { getRouterParam } from 'h3';
import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const saveWorkflowOutputSchema = z
  .object({
    folderId: z.string().uuid().optional(),
  })
  .default({});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  const input = await parseBody(event, saveWorkflowOutputSchema);

  const sql = useDatabase();
  const [asset] = await sql<
    {
      projectId: string;
      savedAt: Date | null;
      source: string;
      status: string;
    }[]
  >`
    SELECT
      project_id AS "projectId",
      saved_at AS "savedAt",
      source,
      status
    FROM assets
    WHERE id = ${assetId} AND deleted_at IS NULL
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '生成结果不存在');
  await requireProjectAccess(identity, asset.projectId, 'write');
  if (asset.source !== 'workflow' || asset.status !== 'available') {
    throw new ApiError(
      409,
      'WORKFLOW_OUTPUT_NOT_READY',
      '当前记录不是可加入资产的工作流结果',
    );
  }

  if (input.folderId) {
    const [folder] = await sql<{ id: string; kind: string }[]>`
      SELECT id, kind
      FROM asset_folders
      WHERE id = ${input.folderId}
        AND project_id = ${asset.projectId}
        AND deleted_at IS NULL
    `;
    if (!folder) {
      throw new ApiError(400, 'ASSET_FOLDER_NOT_FOUND', '目标文件夹不存在');
    }
    if (folder.kind === 'favorites') {
      throw new ApiError(
        400,
        'ASSET_FAVORITES_FOLDER_READ_ONLY',
        '不能直接把资产登记到收藏文件夹',
      );
    }
  }

  if (!asset.savedAt) {
    await sql`
      UPDATE assets
      SET
        saved_at = now(),
        folder_id = ${input.folderId ?? null},
        description = regexp_replace(
          description,
          '，等待用户确认是否保存到资产中心。$',
          '，已由用户保存到资产中心。'
        ),
        updated_at = now()
      WHERE id = ${assetId} AND deleted_at IS NULL
    `;
    await writeAudit(event, {
      action: 'asset.workflow-output.save',
      actor: identity,
      details: { folderId: input.folderId ?? null, source: asset.source },
      module: 'asset',
      targetId: assetId,
      targetType: 'asset',
    });
  }

  return await getAssetView(assetId, identity.id);
});
