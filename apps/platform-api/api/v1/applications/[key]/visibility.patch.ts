import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ visible: z.boolean() });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:application:write');
  const key = getRouterParam(event, 'key');
  if (!key) {
    throw new ApiError(400, 'APPLICATION_KEY_REQUIRED', '缺少应用标识');
  }
  const input = await parseBody(event, schema);
  const sql = useDatabase();
  const [application] = await sql<
    { key: string; updatedAt: Date; visible: boolean }[]
  >`
    UPDATE applications
    SET visible = ${input.visible}, updated_at = now()
    WHERE key = ${key}
    RETURNING key, visible, updated_at AS "updatedAt"
  `;
  if (!application) {
    throw new ApiError(404, 'APPLICATION_NOT_FOUND', '应用不存在');
  }
  await writeAudit(event, {
    action: 'application.visibility.update',
    actor: identity,
    details: { visible: application.visible },
    module: 'application',
    targetId: application.key,
    targetType: 'application',
  });
  return {
    ...application,
    updatedAt: application.updatedAt.toISOString(),
  };
});
