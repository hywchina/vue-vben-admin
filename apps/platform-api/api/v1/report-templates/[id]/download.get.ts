import { getRouterParam } from 'h3';
import {
  parseReportTemplateId,
  requireReportTemplate,
} from '~/utils/domain/capabilities/report/templates/repository';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { createDownloadUrl } from '~/utils/storage';
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:read');
  const row = await requireReportTemplate(
    identity,
    parseReportTemplateId(getRouterParam(event, 'id')),
  );
  if (row.status === 'pending')
    throw new ApiError(409, 'REPORT_TEMPLATE_NOT_READY', '模板尚未完成上传');
  return { url: await createDownloadUrl(row.objectKey, row.filename) };
});
