import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { copyObject, deleteObject } from '~/utils/storage';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(200),
  operation: z.enum(['copy', 'delete', 'move']),
  projectId: z.string().uuid(),
  targetFolderId: z.string().uuid().nullable().optional(),
});

interface SourceAsset {
  description: string;
  id: string;
  kind: string;
  metadata: Record<string, unknown>;
  mimeType: string;
  name: string;
  objectKey: null | string;
  originalFilename: null | string;
  sizeBytes: number;
  source: 'upload' | 'workflow';
  sourceAppKey: null | string;
  sourceJobId: null | string;
  storageKind: 'inline' | 'object';
  textContent: null | string;
}

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const uniqueAssetIds = [...new Set(input.assetIds)];
  if (uniqueAssetIds.length !== input.assetIds.length) {
    throw new ApiError(
      400,
      'DUPLICATE_ASSET_IDS',
      '批量操作中不能重复选择资产',
    );
  }
  const sql = useDatabase();
  if (input.operation !== 'delete' && input.targetFolderId) {
    const [folder] = await sql<{ id: string; kind: string }[]>`
      SELECT id, kind FROM asset_folders
      WHERE id = ${input.targetFolderId}
        AND project_id = ${input.projectId}
        AND deleted_at IS NULL
    `;
    if (!folder)
      throw new ApiError(400, 'ASSET_FOLDER_NOT_FOUND', '目标文件夹不存在');
    if (folder.kind === 'favorites') {
      throw new ApiError(
        400,
        'ASSET_FAVORITES_FOLDER_READ_ONLY',
        '收藏文件夹只接受收藏软链接',
      );
    }
  }
  const sources = await sql<SourceAsset[]>`
    SELECT
      asset.id,
      asset.name,
      asset.description,
      asset.kind,
      asset.source,
      asset.source_app_key AS "sourceAppKey",
      asset.source_job_id AS "sourceJobId",
      version.storage_kind AS "storageKind",
      version.object_key AS "objectKey",
      version.text_content AS "textContent",
      version.original_filename AS "originalFilename",
      version.mime_type AS "mimeType",
      version.size_bytes::float8 AS "sizeBytes",
      version.metadata
    FROM assets asset
    JOIN asset_versions version
      ON version.asset_id = asset.id
      AND version.version = asset.current_version
    WHERE asset.id IN ${sql(uniqueAssetIds)}
      AND asset.project_id = ${input.projectId}
      AND asset.deleted_at IS NULL
      AND asset.saved_at IS NOT NULL
      AND asset.status = 'available'
  `;
  if (sources.length !== uniqueAssetIds.length) {
    throw new ApiError(
      400,
      'INVALID_BATCH_ASSETS',
      '部分资产不存在、未登记或不属于当前项目',
    );
  }

  let result: {
    copiedAssetIds?: string[];
    deletedCount?: number;
    movedCount?: number;
  };
  let cleanupFailures = 0;
  if (input.operation === 'move') {
    await sql`
      UPDATE assets SET folder_id = ${input.targetFolderId ?? null}, updated_at = now()
      WHERE id IN ${sql(uniqueAssetIds)}
    `;
    result = { movedCount: uniqueAssetIds.length };
  } else if (input.operation === 'delete') {
    await sql.begin(async (transaction) => {
      await transaction`DELETE FROM asset_favorites WHERE asset_id IN ${transaction(uniqueAssetIds)}`;
      await transaction`
        UPDATE assets SET status = 'deleted', deleted_at = now(), updated_at = now()
        WHERE id IN ${transaction(uniqueAssetIds)} AND deleted_at IS NULL
      `;
    });
    const keys = [
      ...new Set(
        sources.flatMap((source) =>
          source.objectKey ? [source.objectKey] : [],
        ),
      ),
    ];
    const cleanup = await Promise.allSettled(
      keys.map((objectKey) => deleteObject(objectKey)),
    );
    cleanupFailures = cleanup.filter(
      (item) => item.status === 'rejected',
    ).length;
    result = { deletedCount: uniqueAssetIds.length };
  } else {
    const copies = sources.map((source) => {
      const assetId = randomUUID();
      const versionId = randomUUID();
      const extension = extname(source.originalFilename ?? '')
        .toLowerCase()
        .replaceAll(/[^.\da-z]/g, '')
        .slice(0, 16);
      return {
        ...source,
        assetId,
        targetObjectKey:
          source.storageKind === 'object'
            ? `${input.projectId}/${assetId}/v1/${versionId}${extension}`
            : null,
        versionId,
      };
    });
    const copiedObjectKeys: string[] = [];
    try {
      for (const copy of copies) {
        if (copy.objectKey && copy.targetObjectKey) {
          await copyObject(copy.objectKey, copy.targetObjectKey);
          copiedObjectKeys.push(copy.targetObjectKey);
        }
      }
      await sql.begin(async (transaction) => {
        for (const copy of copies) {
          await transaction`
            INSERT INTO assets (
              id, project_id, folder_id, name, description, kind, source,
              source_app_key, source_job_id, owner_id, status, saved_at
            ) VALUES (
              ${copy.assetId}, ${input.projectId}, ${input.targetFolderId ?? null},
              ${`${copy.name} - 副本`}, ${copy.description}, ${copy.kind}, ${copy.source},
              ${copy.sourceAppKey}, ${copy.sourceJobId}, ${identity.id}, 'available', now()
            )
          `;
          await transaction`
            INSERT INTO asset_versions (
              id, asset_id, version, storage_kind, object_key, text_content,
              original_filename, mime_type, size_bytes, status, metadata,
              created_by, completed_at
            ) VALUES (
              ${copy.versionId}, ${copy.assetId}, 1, ${copy.storageKind},
              ${copy.targetObjectKey}, ${copy.textContent}, ${copy.originalFilename},
              ${copy.mimeType}, ${copy.sizeBytes}, 'available',
              ${transaction.json({ ...copy.metadata, copiedFromAssetId: copy.id })},
              ${identity.id}, now()
            )
          `;
          await transaction`
            INSERT INTO asset_tags (asset_id, tag)
            SELECT ${copy.assetId}, tag FROM asset_tags WHERE asset_id = ${copy.id}
          `;
        }
      });
    } catch (error) {
      await Promise.allSettled(
        copiedObjectKeys.map((objectKey) => deleteObject(objectKey)),
      );
      throw error;
    }
    result = { copiedAssetIds: copies.map((copy) => copy.assetId) };
  }
  await writeAudit(event, {
    action: `asset.batch.${input.operation}`,
    actor: identity,
    details: {
      assetCount: uniqueAssetIds.length,
      cleanupFailures,
      projectId: input.projectId,
      targetFolderId: input.targetFolderId ?? null,
    },
    module: 'asset',
    targetId: input.projectId,
    targetType: 'project',
  });
  return result;
});
