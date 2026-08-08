import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { addWorkflowVersion } from '~/utils/domain/workflows/repository';
import { workflowVersionSchema } from '~/utils/domain/workflows/schema';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:workflow:write');
  const workflowId = getRouterParam(event, 'id');
  if (!workflowId) {
    throw new ApiError(400, 'WORKFLOW_ID_REQUIRED', '缺少工作流编号');
  }
  const input = await parseBody(event, workflowVersionSchema);
  const created = await addWorkflowVersion(workflowId, input, identity.id);
  await writeAudit(event, {
    action: 'workflow.version.create',
    actor: identity,
    details: { version: created.version },
    module: 'workflow',
    targetId: workflowId,
    targetType: 'workflow',
  });
  return created;
});
