import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  fromPath: z.string().trim().max(512).optional(),
  path: z.string().trim().min(1).max(512),
  title: z.string().trim().max(128).optional(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = await parseBody(event, schema);
  await writeAudit(event, {
    action: 'page.view',
    actor: identity,
    details: {
      fromPath: input.fromPath ?? null,
      title: input.title ?? null,
    },
    module: 'navigation',
    targetId: input.path,
    targetType: 'page',
  });
  return { recorded: true };
});
