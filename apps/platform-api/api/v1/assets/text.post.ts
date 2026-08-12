import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';

import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const textSchema = z.object({
  content: z.string().min(1),
  description: z.string().trim().max(2000).optional().default(''),
  folderId: z.string().uuid().optional(),
  mimeType: z
    .enum(['application/json', 'text/markdown', 'text/plain'])
    .optional()
    .default('text/plain'),
  name: z.string().trim().min(1).max(200),
  projectId: z.string().uuid(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const input = await parseBody(event, textSchema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const contentBytes = Buffer.byteLength(input.content, 'utf8');
  if (contentBytes > getConfig().maxInlineTextBytes) {
    throw new ApiError(413, 'TEXT_TOO_LARGE', '文本内容过大，请改为文件上传');
  }

  const assetId = randomUUID();
  const extensionByMimeType = {
    'application/json': '.json',
    'text/markdown': '.md',
    'text/plain': '.txt',
  } as const;
  const extension = extensionByMimeType[input.mimeType];
  const originalFilename = input.name.toLowerCase().endsWith(extension)
    ? input.name
    : `${input.name}${extension}`;
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
  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO assets (
        id, project_id, folder_id, name, description, kind, owner_id, status
      ) VALUES (
        ${assetId}, ${input.projectId}, ${input.folderId ?? null},
        ${input.name}, ${input.description},
        'text', ${identity.id}, 'available'
      )
    `;
    await transaction`
      INSERT INTO asset_versions (
        asset_id, version, storage_kind, text_content, original_filename,
        mime_type, size_bytes, sha256, status, created_by, completed_at
      ) VALUES (
        ${assetId}, 1, 'inline', ${input.content}, ${originalFilename},
        ${input.mimeType}, ${contentBytes},
        ${createHash('sha256').update(input.content).digest('hex')},
        'available', ${identity.id}, now()
      )
    `;
    for (const tag of new Set(input.tags)) {
      await transaction`
        INSERT INTO asset_tags (asset_id, tag) VALUES (${assetId}, ${tag})
      `;
    }
  });

  await writeAudit(event, {
    action: 'asset.text.create',
    actor: identity,
    details: { sizeBytes: contentBytes },
    module: 'asset',
    targetId: assetId,
    targetType: 'asset',
  });
  return await getAssetView(assetId, identity.id);
});
