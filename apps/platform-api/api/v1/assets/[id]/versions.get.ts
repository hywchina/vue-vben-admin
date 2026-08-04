import { getRouterParam } from 'h3';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  const sql = useDatabase();
  const [asset] = await sql<{ projectId: string }[]>`
    SELECT project_id AS "projectId" FROM assets
    WHERE id = ${assetId} AND deleted_at IS NULL
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  await requireProjectAccess(identity, asset.projectId);

  const versions = await sql<
    {
      createdAt: Date;
      createdBy: string;
      id: string;
      mimeType: string;
      originalFilename: null | string;
      sha256: null | string;
      sizeBytes: number;
      status: string;
      storageKind: string;
      version: number;
    }[]
  >`
    SELECT
      av.id,
      av.version,
      av.storage_kind AS "storageKind",
      av.original_filename AS "originalFilename",
      av.mime_type AS "mimeType",
      av.size_bytes::float8 AS "sizeBytes",
      av.sha256,
      av.status,
      u.real_name AS "createdBy",
      av.created_at AS "createdAt"
    FROM asset_versions av
    JOIN users u ON u.id = av.created_by
    WHERE av.asset_id = ${assetId}
    ORDER BY av.version DESC
  `;
  return versions.map((version) => ({
    ...version,
    createdAt: version.createdAt.toISOString(),
  }));
});
