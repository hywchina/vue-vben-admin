import { getRouterParam } from 'h3';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { createPreviewUrl } from '~/utils/storage';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:read');
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');

  const sql = useDatabase();
  const [asset] = await sql<
    {
      mimeType: string;
      objectKey: null | string;
      projectId: string;
      status: string;
      storageKind: 'inline' | 'object';
      textContent: null | string;
    }[]
  >`
    SELECT
      a.project_id AS "projectId",
      a.status,
      av.storage_kind AS "storageKind",
      av.object_key AS "objectKey",
      av.text_content AS "textContent",
      av.mime_type AS "mimeType"
    FROM assets a
    JOIN asset_versions av
      ON av.asset_id = a.id AND av.version = a.current_version
    WHERE a.id = ${assetId} AND a.deleted_at IS NULL
  `;

  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  await requireProjectAccess(identity, asset.projectId);
  if (asset.status !== 'available') {
    throw new ApiError(409, 'ASSET_NOT_READY', '资产尚未完成上传');
  }
  if (asset.storageKind === 'inline') {
    return {
      content: asset.textContent ?? '',
      mimeType: asset.mimeType,
      mode: 'inline',
    };
  }
  const previewableObject =
    asset.mimeType.startsWith('image/') ||
    asset.mimeType.startsWith('video/') ||
    asset.mimeType.startsWith('audio/') ||
    asset.mimeType.startsWith('text/') ||
    asset.mimeType === 'application/json' ||
    asset.mimeType === 'application/pdf';
  if (!asset.objectKey || !previewableObject) {
    throw new ApiError(
      415,
      'ASSET_PREVIEW_UNSUPPORTED',
      '该资产不支持浏览器内预览，请下载后查看',
    );
  }

  return {
    expiresAt: new Date(
      Date.now() + getConfig().s3PresignTtlSeconds * 1000,
    ).toISOString(),
    mimeType: asset.mimeType,
    mode: 'url',
    url: await createPreviewUrl(asset.objectKey, asset.mimeType),
  };
});
