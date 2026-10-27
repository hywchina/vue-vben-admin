import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import {
  requireReportTemplate,
  templateView,
} from '~/utils/domain/capabilities/report/templates/repository';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:read');
  const { projectId } = parseQuery(
    event,
    z.object({ projectId: z.string().uuid() }),
  );
  await requireProjectAccess(identity, projectId);
  const sql = useDatabase();
  const rows = await sql<
    { id: string }[]
  >`SELECT id FROM report_templates WHERE project_id = ${projectId} AND deleted_at IS NULL AND status <> 'pending' ORDER BY created_at DESC LIMIT 200`;
  return Promise.all(
    rows.map(async (row) =>
      templateView(await requireReportTemplate(identity, row.id)),
    ),
  );
});
