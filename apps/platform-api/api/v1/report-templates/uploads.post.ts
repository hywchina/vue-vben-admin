import { randomUUID } from 'node:crypto';

import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { reportMimeType } from '~/utils/domain/capabilities/report/schema';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { createUploadUrl } from '~/utils/storage';
import { parseBody } from '~/utils/validation';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(
    event,
    z.object({
      projectId: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      filename: z.string().min(1).max(255),
      sizeBytes: z
        .number()
        .int()
        .positive()
        .max(20 * 1024 * 1024),
    }),
  );
  await requireProjectAccess(identity, input.projectId, 'write');
  let format: 'docx' | 'pptx' | null = null;
  if (/\.docx$/iu.test(input.filename)) format = 'docx';
  else if (/\.pptx$/iu.test(input.filename)) format = 'pptx';
  if (!format)
    throw new ApiError(
      400,
      'REPORT_TEMPLATE_FORMAT_INVALID',
      '请先将模板另存为 DOCX 或 PPTX，不支持旧版格式或含宏文件',
    );
  const id = randomUUID();
  const objectKey = `${input.projectId}/report-templates/${id}/source.${format}`;
  const url = await createUploadUrl(objectKey, reportMimeType(format));
  const sql = useDatabase();
  await sql`INSERT INTO report_templates(id, project_id, name, format, filename, object_key, size_bytes, created_by) VALUES (${id}, ${input.projectId}, ${input.name}, ${format}, ${input.filename}, ${objectKey}, ${input.sizeBytes}, ${identity.id})`;
  await writeAudit(event, {
    action: 'report.template.upload',
    actor: identity,
    module: 'report',
    targetId: id,
    targetType: 'report-template',
    details: { format, sizeBytes: input.sizeBytes },
  });
  return {
    id,
    upload: {
      url,
      method: 'PUT',
      headers: { 'Content-Type': reportMimeType(format) },
    },
  };
});
