import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  parseReportTemplateId,
  requireReportTemplate,
  templateView,
  validateTemplateBindings,
} from '~/utils/domain/capabilities/report/templates/repository';
import { templateConfigurationSchema } from '~/utils/domain/capabilities/report/templates/schema';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const id = parseReportTemplateId(getRouterParam(event, 'id'));
  const input = await parseBody(
    event,
    z.object({
      name: z.string().trim().min(1).max(120),
      revision: z.number().int().positive(),
      configuration: templateConfigurationSchema,
    }),
  );
  const row = await requireReportTemplate(identity, id, 'write');
  if (row.status === 'pending')
    throw new ApiError(409, 'REPORT_TEMPLATE_NOT_READY', '请先完成上传和解析');
  validateTemplateBindings(row.manifest, input.configuration);
  const sql = useDatabase();
  const changed =
    await sql`UPDATE report_templates SET name = ${input.name}, configuration = ${sql.json(input.configuration)}, status = 'ready', revision = revision + 1, updated_at = now() WHERE id = ${id} AND revision = ${input.revision} AND deleted_at IS NULL RETURNING id`;
  if (changed.length === 0)
    throw new ApiError(
      409,
      'REPORT_TEMPLATE_REVISION_CONFLICT',
      '模板已由其他用户更新，请刷新后重试',
    );
  await writeAudit(event, {
    action: 'report.template.configure',
    actor: identity,
    module: 'report',
    targetId: id,
    targetType: 'report-template',
    details: { revision: input.revision + 1, format: row.format },
  });
  return templateView(await requireReportTemplate(identity, id));
});
