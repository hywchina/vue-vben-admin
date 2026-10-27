import { z } from 'zod';
import { reportMimeType } from '~/utils/domain/capabilities/report/schema';
import {
  getStarterTemplate,
  STARTER_NAMES,
} from '~/utils/domain/capabilities/report/templates/starters';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { createDownloadUrl, storeObject } from '~/utils/storage';
import { parseQuery } from '~/utils/validation';
export default apiHandler(async (event) => {
  requirePermission(await requireIdentity(event), 'platform:job:read');
  const { format, kind } = parseQuery(
    event,
    z.object({
      format: z.enum(['docx', 'pptx']),
      kind: z.enum(['report', 'contract', 'patent', 'bid']).default('report'),
    }),
  );
  const { source, snapshot } = await getStarterTemplate(format, kind);
  const key = `report-template-starters/${snapshot.sha256}.${format}`;
  await storeObject(key, reportMimeType(format), source);
  return {
    url: await createDownloadUrl(key, `${STARTER_NAMES[kind]}.${format}`),
  };
});
