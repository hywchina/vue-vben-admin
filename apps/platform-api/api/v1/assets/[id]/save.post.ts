import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  applyAssetSaveJobContext,
  assertAssetFolderCategory,
  getAssetSaveScope,
} from '~/utils/domain/assets/category';
import { requireAssetContentAccess } from '~/utils/domain/assets/content-access';
import { getUuidParam } from '~/utils/http/resource-id';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const saveWorkflowOutputSchema = z
  .object({
    folderId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
  })
  .default({});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getUuidParam(event);
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  const input = await parseBody(event, saveWorkflowOutputSchema);

  const sql = useDatabase();
  const scope = await getAssetSaveScope(sql, assetId);
  await requireProjectAccess(identity, scope.projectId, 'write');
  await requireAssetContentAccess(assetId, identity.id);
  await sql.begin(async (transaction) => {
    const asset = await getAssetSaveScope(transaction, assetId, true);
    if (asset.status !== 'available') {
      throw new ApiError(
        409,
        'WORKFLOW_OUTPUT_NOT_READY',
        '当前图片或生成结果尚不可加入资产中心',
      );
    }

    await applyAssetSaveJobContext(
      transaction,
      asset,
      assetId,
      identity.id,
      input.jobId,
    );
    if (input.folderId) {
      const [folder] = await transaction<
        { generationCategory: null | string; id: string; kind: string }[]
      >`
      SELECT id, kind, generation_category AS "generationCategory"
      FROM asset_folders
      WHERE id = ${input.folderId}
        AND project_id = ${asset.projectId}
        AND deleted_at IS NULL
      FOR SHARE
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
      assertAssetFolderCategory(
        asset.generationCategory,
        folder.generationCategory,
      );
    }

    if (!asset.savedAt) {
      await transaction`
      UPDATE assets
      SET
        saved_at = now(),
        generation_category = ${asset.generationCategory},
        folder_id = ${input.folderId ?? null},
        description = regexp_replace(
          description,
          '，等待用户确认是否保存到资产中心。$',
          '，已由用户保存到资产中心。'
        ),
        updated_at = now()
      WHERE id = ${assetId} AND deleted_at IS NULL
    `;
      await writeAudit(
        event,
        {
          action: 'asset.workflow-output.save',
          actor: identity,
          details: { folderId: input.folderId ?? null, source: asset.source },
          module: 'asset',
          targetId: assetId,
          targetType: 'asset',
        },
        transaction,
      );
    }
  });

  return await getAssetView(assetId, identity.id);
});
