import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { getRouterParam } from 'h3';
import { z } from 'zod';
import { validateMimeForKind } from '~/utils/assets';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { createUploadUrl, ensureStorageBucket } from '~/utils/storage';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  const input = await parseBody(event, schema);
  if (input.sizeBytes > getConfig().maxUploadBytes) {
    throw new ApiError(413, 'FILE_TOO_LARGE', '文件超过平台允许的最大大小');
  }
  await ensureStorageBucket();

  const sql = useDatabase();
  const versionId = randomUUID();
  const prepared = await sql.begin(async (transaction) => {
    const [asset] = await transaction<
      { kind: Parameters<typeof validateMimeForKind>[0]; projectId: string }[]
    >`
      SELECT project_id AS "projectId", kind
      FROM assets
      WHERE id = ${assetId} AND deleted_at IS NULL
      FOR UPDATE
    `;
    if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
    await requireProjectAccess(identity, asset.projectId, 'write');
    if (!validateMimeForKind(asset.kind, input.mimeType)) {
      throw new ApiError(
        400,
        'MIME_KIND_MISMATCH',
        '新版本文件类型与资产类型不匹配',
      );
    }

    const [versionRow] = await transaction<{ version: number }[]>`
      SELECT COALESCE(max(version), 0)::integer + 1 AS version
      FROM asset_versions
      WHERE asset_id = ${assetId}
    `;
    const version = versionRow?.version ?? 1;
    const extension = extname(input.filename)
      .toLowerCase()
      .replaceAll(/[^.\da-z]/g, '')
      .slice(0, 16);
    const objectKey = `${asset.projectId}/${assetId}/v${version}/${versionId}${extension}`;

    await transaction`
      INSERT INTO asset_versions (
        id, asset_id, version, storage_kind, object_key, original_filename,
        mime_type, size_bytes, created_by
      ) VALUES (
        ${versionId}, ${assetId}, ${version}, 'object', ${objectKey},
        ${input.filename}, ${input.mimeType}, ${input.sizeBytes}, ${identity.id}
      )
    `;
    return { objectKey, projectId: asset.projectId, version };
  });

  const uploadUrl = await createUploadUrl(prepared.objectKey, input.mimeType);
  await writeAudit(event, {
    action: 'asset.version.upload.prepare',
    actor: identity,
    details: { filename: input.filename, version: prepared.version },
    module: 'asset',
    targetId: assetId,
    targetType: 'asset',
  });
  return {
    expiresAt: new Date(
      Date.now() + getConfig().s3PresignTtlSeconds * 1000,
    ).toISOString(),
    headers: { 'Content-Type': input.mimeType },
    method: 'PUT',
    url: uploadUrl,
    version: prepared.version,
  };
});
