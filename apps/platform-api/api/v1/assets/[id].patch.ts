import { getRouterParam } from 'h3';
import { z } from 'zod';
import { getAssetView } from '~/utils/asset-repository';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ name: z.string().trim().min(1).max(200) });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:asset:write');
  const assetId = getRouterParam(event, 'id');
  if (!assetId) throw new ApiError(400, 'ASSET_ID_REQUIRED', '缺少资产编号');
  const { name } = await parseBody(event, schema);
  const sql = useDatabase();
  const [asset] = await sql<{ name: string; projectId: string }[]>`
    SELECT name, project_id AS "projectId"
    FROM assets
    WHERE id = ${assetId} AND deleted_at IS NULL
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
  await requireProjectAccess(identity, asset.projectId, 'write');

  if (asset.name !== name) {
    await sql`
      UPDATE assets
      SET name = ${name}, updated_at = now()
      WHERE id = ${assetId} AND deleted_at IS NULL
    `;
    await writeAudit(event, {
      action: 'asset.rename',
      actor: identity,
      details: { after: name, before: asset.name },
      module: 'asset',
      targetId: assetId,
      targetType: 'asset',
    });
  }

  return await getAssetView(assetId, identity.id);
});
