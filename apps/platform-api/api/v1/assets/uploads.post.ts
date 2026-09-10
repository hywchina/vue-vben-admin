import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { ASSET_KINDS, validateFileForKind } from '~/utils/assets';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { ASSET_GENERATION_CATEGORIES } from '~/utils/domain/assets/query';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { createUploadUrl } from '~/utils/storage';
import { parseBody } from '~/utils/validation';

const uploadSchema = z.object({
  description: z.string().trim().max(2000).optional().default(''),
  derivedFromAssetId: z.string().uuid().optional(),
  filename: z.string().trim().min(1).max(255),
  folderId: z.string().uuid().optional(),
  generationCategory: z.enum(ASSET_GENERATION_CATEGORIES).optional(),
  kind: z.enum(ASSET_KINDS),
  mimeType: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(200),
  projectId: z.string().uuid(),
  sizeBytes: z.number().int().positive(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const input = await parseBody(event, uploadSchema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const config = getConfig();
  if (input.sizeBytes > config.maxUploadBytes) {
    throw new ApiError(
      413,
      'FILE_TOO_LARGE',
      `文件超过允许的最大大小 ${config.maxUploadBytes} 字节`,
    );
  }
  if (!validateFileForKind(input.kind, input.mimeType, input.filename)) {
    throw new ApiError(400, 'MIME_KIND_MISMATCH', '文件与所选文件类型不匹配');
  }

  const assetId = randomUUID();
  const versionId = randomUUID();
  const extension = extname(input.filename)
    .toLowerCase()
    .replaceAll(/[^.\da-z]/g, '')
    .slice(0, 16);
  const objectKey = `${input.projectId}/${assetId}/v1/${versionId}${extension}`;
  const uploadUrl = await createUploadUrl(objectKey, input.mimeType);
  const sql = useDatabase();

  if (input.folderId) {
    const [folder] = await sql<{ id: string; kind: string }[]>`
      SELECT id, kind FROM asset_folders
      WHERE id = ${input.folderId}
        AND project_id = ${input.projectId}
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

  if (input.derivedFromAssetId) {
    if (input.kind !== 'image') {
      throw new ApiError(
        400,
        'INVALID_DERIVED_ASSET',
        '只有图片资产可以登记原始图片血缘',
      );
    }
    const [sourceAsset] = await sql<{ id: string }[]>`
      SELECT id
      FROM assets
      WHERE id = ${input.derivedFromAssetId}
        AND project_id = ${input.projectId}
        AND kind = 'image'
        AND status = 'available'
        AND saved_at IS NOT NULL
        AND deleted_at IS NULL
    `;
    if (!sourceAsset) {
      throw new ApiError(
        400,
        'INVALID_DERIVED_ASSET',
        '原始图片不存在、未加入资产或不属于当前项目',
      );
    }
  }

  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO assets (
        id, project_id, folder_id, generation_category, name, description, kind, owner_id
      ) VALUES (
        ${assetId}, ${input.projectId}, ${input.folderId ?? null}, ${input.generationCategory ?? null},
        ${input.name}, ${input.description},
        ${input.kind}, ${identity.id}
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        id, asset_id, version, storage_kind, object_key, original_filename,
        mime_type, size_bytes, metadata, created_by
      ) VALUES (
        ${versionId}, ${assetId}, 1, 'object', ${objectKey}, ${input.filename},
        ${input.mimeType}, ${input.sizeBytes},
        ${transaction.json(
          input.derivedFromAssetId
            ? { derivedFromAssetId: input.derivedFromAssetId }
            : {},
        )},
        ${identity.id}
      )
    `;
    for (const tag of new Set(input.tags)) {
      await transaction`
        INSERT INTO asset_tags (asset_id, tag) VALUES (${assetId}, ${tag})
      `;
    }
  });

  await writeAudit(event, {
    action: 'asset.upload.prepare',
    actor: identity,
    details: {
      filename: input.filename,
      derivedFromAssetId: input.derivedFromAssetId,
      kind: input.kind,
      sizeBytes: input.sizeBytes,
    },
    module: 'asset',
    targetId: assetId,
    targetType: 'asset',
  });

  return {
    asset: await getAssetView(assetId, identity.id),
    upload: {
      expiresAt: new Date(
        Date.now() + config.s3PresignTtlSeconds * 1000,
      ).toISOString(),
      headers: { 'Content-Type': input.mimeType },
      method: 'PUT',
      url: uploadUrl,
      version: 1,
    },
  };
});
