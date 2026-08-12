import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ name: z.string().trim().min(1).max(120) });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const folderId = getRouterParam(event, 'id');
  if (!folderId)
    throw new ApiError(400, 'ASSET_FOLDER_ID_REQUIRED', '缺少文件夹编号');
  const { name } = await parseBody(event, schema);
  const sql = useDatabase();
  const [current] = await sql<
    { kind: 'favorites' | 'normal'; name: string; projectId: string }[]
  >`
    SELECT name, kind, project_id AS "projectId"
    FROM asset_folders
    WHERE id = ${folderId} AND deleted_at IS NULL
  `;
  if (!current)
    throw new ApiError(404, 'ASSET_FOLDER_NOT_FOUND', '文件夹不存在');
  await requireProjectAccess(identity, current.projectId, 'write');
  if (current.kind === 'favorites') {
    throw new ApiError(
      400,
      'ASSET_FAVORITES_FOLDER_READ_ONLY',
      '收藏文件夹不能重命名',
    );
  }
  try {
    await sql`
      UPDATE asset_folders SET name = ${name}, updated_at = now()
      WHERE id = ${folderId} AND deleted_at IS NULL
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
  await writeAudit(event, {
    action: 'asset.folder.rename',
    actor: identity,
    details: { after: name, before: current.name },
    module: 'asset',
    targetId: folderId,
    targetType: 'asset_folder',
  });
  return { id: folderId, name };
});
