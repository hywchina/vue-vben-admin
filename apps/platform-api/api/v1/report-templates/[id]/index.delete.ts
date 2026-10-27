import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  parseReportTemplateId,
  requireReportTemplate,
} from '~/utils/domain/capabilities/report/templates/repository';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const row = await requireReportTemplate(
    identity,
    parseReportTemplateId(getRouterParam(event, 'id')),
    'write',
  );
  const sql = useDatabase();
  await sql`UPDATE report_templates SET deleted_at = now(), updated_at = now() WHERE id = ${row.id}`;
  await writeAudit(event, {
    action: 'report.template.archive',
    actor: identity,
    module: 'report',
    targetId: row.id,
    targetType: 'report-template',
  });
  return { archived: true };
});
