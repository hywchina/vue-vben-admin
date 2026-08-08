import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { createWorkflowDefinition } from '~/utils/domain/workflows/repository';
import { workflowVersionSchema } from '~/utils/domain/workflows/schema';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z][a-z0-9-]*$/),
  description: z.string().trim().max(2000).default(''),
  name: z.string().trim().min(1).max(200),
  publish: z.boolean().default(false),
  version: workflowVersionSchema,
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:workflow:write');
  const input = await parseBody(event, schema);
  const created = await createWorkflowDefinition(input, identity.id);
  await writeAudit(event, {
    action: 'workflow.create',
    actor: identity,
    details: { code: input.code, publish: input.publish },
    module: 'workflow',
    targetId: created.id,
    targetType: 'workflow',
  });
  return created;
});
