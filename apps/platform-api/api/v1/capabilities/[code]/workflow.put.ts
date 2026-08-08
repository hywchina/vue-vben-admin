import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { bindCapabilityWorkflow } from '~/utils/domain/workflows/repository';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ workflowVersionId: z.string().uuid() });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:workflow:write');
  const code = getRouterParam(event, 'code');
  if (!code) {
    throw new ApiError(400, 'CAPABILITY_CODE_REQUIRED', '缺少能力编码');
  }
  const input = await parseBody(event, schema);
  const binding = await bindCapabilityWorkflow(
    code,
    input.workflowVersionId,
    identity.id,
  );
  await writeAudit(event, {
    action: 'capability.workflow.bind',
    actor: identity,
    details: { workflowVersionId: input.workflowVersionId },
    module: 'workflow',
    targetId: code,
    targetType: 'capability',
  });
  return binding;
});
