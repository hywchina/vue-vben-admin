import type { TransactionSql } from 'postgres';

import type { Database } from '../../infrastructure/database';

import { ApiError } from '../../http/response';

/** A category is the root namespace; folders organize assets within it. */
export function assertAssetFolderCategory(
  category: null | string | undefined,
  folderCategory: null | string | undefined,
) {
  if ((category ?? null) !== (folderCategory ?? null)) {
    throw new ApiError(
      400,
      'ASSET_CATEGORY_MISMATCH',
      '只能选择资产业务大类下的子目录，不能通过保存、移动或复制改变大类',
    );
  }
}

export interface AssetSaveScope {
  generationCategory: 'cabin' | 'cmf' | 'component' | 'report' | null;
  projectId: string;
  savedAt: Date | null;
  source: string;
  status: string;
}
export async function getAssetSaveScope(
  sql: Database | TransactionSql,
  assetId: string,
  lock = false,
) {
  const [asset] = await sql<AssetSaveScope[]>`
    SELECT a.project_id AS "projectId",
      CASE WHEN a.saved_at IS NOT NULL THEN a.generation_category
        ELSE COALESCE(j.design_mode,a.generation_category,
          CASE WHEN a.source_app_key='report-generator' THEN 'report' END)
      END AS "generationCategory",
      a.saved_at AS "savedAt",a.source,a.status
    FROM assets a LEFT JOIN jobs j ON j.id=a.source_job_id AND j.project_id=a.project_id
    WHERE a.id=${assetId} AND a.deleted_at IS NULL
    ${lock ? sql`FOR UPDATE OF a` : sql``}
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '生成结果不存在');
  return asset;
}
export async function applyAssetSaveJobContext(
  sql: Database | TransactionSql,
  asset: AssetSaveScope,
  assetId: string,
  userId: string,
  jobId?: string,
) {
  if (!jobId) return;
  const [context] = await sql<
    { category: AssetSaveScope['generationCategory'] }[]
  >`
    SELECT design_mode AS category FROM jobs j
    WHERE j.id=${jobId} AND j.project_id=${asset.projectId} AND j.created_by=${userId}
      AND (EXISTS(SELECT 1 FROM job_outputs o WHERE o.job_id=j.id AND o.asset_id=${assetId})
        OR EXISTS(SELECT 1 FROM job_inputs i WHERE i.job_id=j.id AND (i.asset_id=${assetId} OR i.annotation_asset_id=${assetId})))
  `;
  if (!context)
    throw new ApiError(400, 'ASSET_SAVE_CONTEXT_INVALID', '图片不属于指定任务');
  if (
    !asset.savedAt &&
    (asset.source !== 'workflow' || !asset.generationCategory)
  )
    asset.generationCategory = context.category ?? asset.generationCategory;
}
