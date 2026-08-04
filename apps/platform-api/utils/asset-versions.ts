import type { H3Event } from 'h3';

import type { CurrentIdentity } from './identity';

import { getAssetView } from './asset-repository';
import { writeAudit } from './audit';
import { useDatabase } from './database';
import { createNotification } from './notifications';
import { requireProjectAccess } from './project-access';
import { ApiError } from './response';
import { deleteObject, inspectObject } from './storage';

export async function completeObjectVersion(
  event: H3Event,
  identity: CurrentIdentity,
  assetId: string,
  version: number,
) {
  const sql = useDatabase();
  const [pending] = await sql<
    {
      expectedSize: number;
      objectKey: string;
      projectId: string;
      status: string;
    }[]
  >`
    SELECT
      a.project_id AS "projectId",
      av.object_key AS "objectKey",
      av.size_bytes::float8 AS "expectedSize",
      av.status
    FROM assets a
    JOIN asset_versions av ON av.asset_id = a.id
    WHERE a.id = ${assetId}
      AND av.version = ${version}
      AND a.deleted_at IS NULL
  `;
  if (!pending)
    throw new ApiError(404, 'ASSET_VERSION_NOT_FOUND', '资产版本不存在');
  await requireProjectAccess(identity, pending.projectId, 'write');
  if (pending.status === 'available') {
    return await getAssetView(assetId, identity.id);
  }
  if (pending.status !== 'pending') {
    throw new ApiError(
      409,
      'ASSET_UPLOAD_FAILED',
      '该上传已失败，请重新创建版本',
    );
  }

  const object = await inspectObject(pending.objectKey);
  if (object.ContentLength !== pending.expectedSize) {
    await deleteObject(pending.objectKey);
    await sql.begin(async (transaction) => {
      await transaction`
        UPDATE asset_versions SET status = 'failed'
        WHERE asset_id = ${assetId} AND version = ${version}
      `;
      await transaction`
        UPDATE assets SET status = 'failed', updated_at = now()
        WHERE id = ${assetId} AND current_version = ${version}
      `;
    });
    throw new ApiError(
      400,
      'UPLOAD_SIZE_MISMATCH',
      '上传文件大小与登记信息不一致',
    );
  }

  await sql.begin(async (transaction) => {
    await transaction`
      UPDATE asset_versions SET
        status = 'available',
        storage_etag = ${object.ETag?.replaceAll('"', '') ?? null},
        completed_at = now()
      WHERE asset_id = ${assetId} AND version = ${version}
    `;
    await transaction`
      UPDATE assets SET
        current_version = ${version},
        status = 'available',
        updated_at = now()
      WHERE id = ${assetId}
    `;
  });
  await writeAudit(event, {
    action: 'asset.upload.complete',
    actor: identity,
    details: { sizeBytes: object.ContentLength, version },
    module: 'asset',
    targetId: assetId,
    targetType: 'asset',
  });
  await createNotification({
    link: '/assets',
    message: `资产的新版本 V${version} 已完成上传并可在项目内使用。`,
    title: '资产已保存',
    type: 'asset',
    userId: identity.id,
  });
  return await getAssetView(assetId, identity.id);
}
