import { writeAudit } from '~/utils/audit';
import { deleteWorkflowDefinition } from '~/utils/domain/workflows/repository';
import { getUuidParam } from '~/utils/http/resource-id';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:workflow:write');
  const id = getUuidParam(event);
  if (!id) throw new ApiError(400, 'WORKFLOW_ID_REQUIRED', '缺少工作流编号');
  const result = await deleteWorkflowDefinition(id, identity.id);
  await writeAudit(event, {
    action: 'workflow.delete',
    actor: identity,
    module: 'workflow',
    targetId: id,
    targetType: 'workflow',
    details: { softDeleted: true },
  });
  return result;
});
