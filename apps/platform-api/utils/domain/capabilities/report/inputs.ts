import type { CurrentIdentity } from '../../../identity';

import { useDatabase } from '../../../database';
import { ApiError } from '../../../response';
import { requireProjectAccess } from '../../projects/access';
import { REPORT_SUPPORTED_IMAGE_MIME_TYPES } from './schema';

export async function loadReportImages(
  identity: CurrentIdentity,
  assetIds: string[],
) {
  const sql = useDatabase();
  const assets =
    assetIds.length > 0
      ? await sql<
          {
            filename: string;
            id: string;
            mimeType: 'image/jpeg' | 'image/png';
            name: string;
            objectKey: string;
            projectId: string;
            sizeBytes: number;
          }[]
        >`
        SELECT asset.id, asset.project_id AS "projectId", asset.name,
          version.original_filename AS filename, version.mime_type AS "mimeType",
          version.object_key AS "objectKey", version.size_bytes::float8 AS "sizeBytes"
        FROM assets asset
        JOIN asset_versions version
          ON version.asset_id = asset.id AND version.version = asset.current_version
        WHERE asset.id IN ${sql(assetIds)}
          AND asset.kind = 'image' AND asset.status = 'available'
          AND asset.saved_at IS NOT NULL AND asset.deleted_at IS NULL
          AND version.status = 'available' AND version.storage_kind = 'object'
      `
      : [];
  if (assets.length !== assetIds.length) {
    throw new ApiError(
      400,
      'REPORT_IMAGE_ASSET_INVALID',
      '报告图片不存在、未加入资产或已失效',
    );
  }
  for (const projectId of new Set(assets.map((asset) => asset.projectId))) {
    await requireProjectAccess(identity, projectId);
  }
  if (
    assets.some(
      (asset) => !REPORT_SUPPORTED_IMAGE_MIME_TYPES.includes(asset.mimeType),
    )
  ) {
    throw new ApiError(
      400,
      'REPORT_IMAGE_FORMAT_UNSUPPORTED',
      '报告当前仅支持 PNG 和 JPEG 图片',
    );
  }
  if (
    assets.reduce((sum, asset) => sum + asset.sizeBytes, 0) >
    100 * 1024 * 1024
  ) {
    throw new ApiError(
      413,
      'REPORT_INPUT_TOO_LARGE',
      '报告图片总大小超过 100 MiB',
    );
  }
  return assets;
}
