import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { updateWorkflowDefinition } from '~/utils/domain/workflows/repository';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  description: z.string().trim().max(2000).default(''),
  name: z.string().trim().min(1).max(200),
  status: z.enum(['disabled', 'draft', 'published']),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:workflow:write');
  const workflowId = getRouterParam(event, 'id');
  if (!workflowId) {
    throw new ApiError(400, 'WORKFLOW_ID_REQUIRED', '缺少工作流编号');
  }
  const input = await parseBody(event, schema);
  const updated = await updateWorkflowDefinition(
    workflowId,
    input,
    identity.id,
  );
  await writeAudit(event, {
    action: 'workflow.update',
    actor: identity,
    details: { status: input.status },
    module: 'workflow',
    targetId: workflowId,
    targetType: 'workflow',
  });
  return updated;
});
