import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const sql = useDatabase();
  if (!input.parentId && input.name.toLocaleLowerCase() === '收藏') {
    throw new ApiError(
      409,
      'ASSET_FOLDER_NAME_RESERVED',
      '“收藏”是系统文件夹名称',
    );
  }
  if (input.parentId) {
    const [parent] = await sql<{ id: string; kind: string }[]>`
      SELECT id, kind FROM asset_folders
      WHERE id = ${input.parentId}
        AND project_id = ${input.projectId}
        AND deleted_at IS NULL
    `;
    if (!parent) {
      throw new ApiError(400, 'ASSET_FOLDER_NOT_FOUND', '上级文件夹不存在');
    }
    if (parent.kind === 'favorites') {
      throw new ApiError(
        400,
        'ASSET_FAVORITES_FOLDER_READ_ONLY',
        '收藏文件夹不能创建子文件夹',
      );
    }
  }
  let folder:
    | undefined
    | {
        createdAt: Date;
        id: string;
        kind: 'normal';
        name: string;
        parentId: null | string;
        updatedAt: Date;
      };
  try {
    [folder] = await sql`
      INSERT INTO asset_folders (project_id, parent_id, name, created_by)
      VALUES (${input.projectId}, ${input.parentId ?? null}, ${input.name}, ${identity.id})
      RETURNING
        id, parent_id AS "parentId", name,
        kind,
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ApiError(
        409,
        'ASSET_FOLDER_NAME_EXISTS',
        '同级目录已有同名文件夹',
      );
    }
    throw error;
  }
  if (!folder) throw new Error('创建资产文件夹失败');
  await writeAudit(event, {
    action: 'asset.folder.create',
    actor: identity,
    details: {
      name: folder.name,
      parentId: folder.parentId,
      projectId: input.projectId,
    },
    module: 'asset',
    targetId: folder.id,
    targetType: 'asset_folder',
  });
  return {
    ...folder,
    assetCount: 0,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
});
