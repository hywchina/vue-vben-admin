import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  assertDesignModeApplications,
  designModeApplicationsSchema,
  designModeSchema,
} from '~/utils/domain/design-mode-applications';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:application:write');
  const parsed = designModeSchema.safeParse(
    getRouterParam(event, 'designMode'),
  );
  if (!parsed.success)
    throw new ApiError(400, 'VALIDATION_ERROR', '无效的设计模块');
  const mode = parsed.data;
  const input = await parseBody(event, designModeApplicationsSchema);
  const sql = useDatabase();
  const saved = await sql.begin(async (tx) => {
    const allowed = await tx<
      { key: string }[]
    >`SELECT a.key FROM applications a JOIN capabilities c ON c.app_key = a.key AND c.status = 'published' JOIN capability_workflows cw ON cw.capability_code = c.code AND cw.active = true JOIN workflow_versions wv ON wv.id = cw.workflow_version_id JOIN workflow_definitions wd ON wd.id = wv.workflow_id AND wd.status = 'published' FOR SHARE OF a, c, cw, wd`;
    assertDesignModeApplications(
      input,
      allowed.map((item) => item.key),
    );
    const [current] =
      await tx`SELECT revision FROM design_mode_applications WHERE design_mode = ${mode} FOR UPDATE`;
    if (!current || current.revision !== input.expectedRevision)
      throw new ApiError(
        409,
        'DESIGN_MODE_CONFLICT',
        '配置已被其他管理员修改，请重新加载',
      );
    const [result] =
      await tx`UPDATE design_mode_applications SET application_keys = ${tx.json(input.applicationKeys)}, default_image_application_key = ${input.defaultImageApplicationKey}, revision = revision + 1, updated_by = ${identity.id}, updated_at = now() WHERE design_mode = ${mode} RETURNING design_mode AS "designMode", application_keys AS "applicationKeys", default_image_application_key AS "defaultImageApplicationKey", revision`;
    return result;
  });
  await writeAudit(event, {
    action: 'design_mode.update',
    actor: identity,
    module: 'application',
    targetType: 'design_mode',
    targetId: mode,
    details: {
      applicationKeys: input.applicationKeys,
      defaultImageApplicationKey: input.defaultImageApplicationKey,
      revision: saved?.revision,
    },
  });
  return saved;
});
