import { createHash } from 'node:crypto';

import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { inspectOfficeTemplate } from '~/utils/domain/capabilities/report/templates/package';
import {
  parseReportTemplateId,
  requireReportTemplate,
  templateView,
} from '~/utils/domain/capabilities/report/templates/repository';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { deleteObject, inspectObject, readObject } from '~/utils/storage';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const id = parseReportTemplateId(getRouterParam(event, 'id'));
  const row = await requireReportTemplate(identity, id, 'write');
  if (row.status !== 'pending') return templateView(row);
  const head = await inspectObject(row.objectKey);
  if (head.ContentLength !== row.sizeBytes || row.sizeBytes > 20 * 1024 * 1024)
    throw new ApiError(
      400,
      'REPORT_TEMPLATE_SIZE_INVALID',
      '模板实际大小与申报不一致',
    );
  const bytes = await readObject(row.objectKey);
  let manifest;
  try {
    manifest = inspectOfficeTemplate(bytes, row.format);
  } catch (error) {
    throw new ApiError(
      400,
      'REPORT_TEMPLATE_INVALID',
      error instanceof Error ? error.message : '无法识别模板',
    );
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  // Copy the inspected bytes to an immutable source: a still-valid upload URL must
  // never be able to change a reviewed template or a queued job's source file.
  const immutableKey = `${row.objectKey}.${sha256}`;
  const { storeObject } = await import('~/utils/storage');
  const { reportMimeType } =
    await import('~/utils/domain/capabilities/report/schema');
  await storeObject(immutableKey, reportMimeType(row.format), bytes);
  const sql = useDatabase();
  const changed =
    await sql`UPDATE report_templates SET manifest = ${sql.json(JSON.parse(JSON.stringify(manifest)))}, sha256 = ${sha256}, object_key = ${immutableKey}, status = 'draft', updated_at = now() WHERE id = ${id} AND status = 'pending' AND deleted_at IS NULL RETURNING id`;
  const current = await requireReportTemplate(identity, id);
  if (changed.length === 0 && current.objectKey !== immutableKey)
    await deleteObject(immutableKey).catch(() => undefined);
  await deleteObject(row.objectKey).catch(() => undefined);
  await writeAudit(event, {
    action: 'report.template.inspect',
    actor: identity,
    module: 'report',
    targetId: id,
    targetType: 'report-template',
    details: {
      format: row.format,
      sizeBytes: bytes.byteLength,
      elementCount: manifest.elements.length,
    },
  });
  return templateView(current);
});
