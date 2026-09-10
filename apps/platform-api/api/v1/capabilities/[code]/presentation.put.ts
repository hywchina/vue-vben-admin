import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { assertQuickFieldKeys } from '~/utils/domain/workflows/presentation';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  quickFieldKeys: z.array(z.string().min(1).max(200)).max(200),
  workflowVersionId: z.string().uuid(),
});
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:workflow:write');
  const code = getRouterParam(event, 'code');
  if (!code)
    throw new ApiError(400, 'CAPABILITY_CODE_REQUIRED', '缺少能力编码');
  const input = await parseBody(event, schema);
  const sql = useDatabase();
  await sql.begin(async (transaction) => {
    const [current] = await transaction<
      { id: string; parameterSchema: unknown }[]
    >`
      SELECT wv.id, wv.parameter_schema AS "parameterSchema"
      FROM capabilities c
      JOIN capability_workflows cw ON cw.capability_code = c.code AND cw.active = true
      JOIN workflow_versions wv ON wv.id = cw.workflow_version_id
      JOIN workflow_definitions wd ON wd.id = wv.workflow_id
      WHERE c.code = ${code} AND c.status = 'published' AND wd.status = 'published'
      FOR SHARE OF c, cw, wd
    `;
    if (!current)
      throw new ApiError(404, 'CAPABILITY_NOT_FOUND', '能力不存在或尚未发布');
    if (current.id !== input.workflowVersionId) {
      throw new ApiError(
        409,
        'CAPABILITY_VERSION_CHANGED',
        '工作流版本已变化，请重新打开参数展示设置',
      );
    }
    assertQuickFieldKeys(current.parameterSchema, input.quickFieldKeys);
    await transaction`
      INSERT INTO capability_parameter_presentations (capability_code, quick_field_keys, updated_by)
      VALUES (${code}, ${transaction.json(input.quickFieldKeys)}, ${identity.id})
      ON CONFLICT (capability_code) DO UPDATE SET
        quick_field_keys = EXCLUDED.quick_field_keys,
        updated_by = EXCLUDED.updated_by, updated_at = now()
    `;
  });
  await writeAudit(event, {
    action: 'capability.presentation.update',
    actor: identity,
    details: { quickFieldKeys: input.quickFieldKeys },
    module: 'workflow',
    targetId: code,
    targetType: 'capability',
  });
  return input;
});
