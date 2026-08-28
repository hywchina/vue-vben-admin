import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import {
  createAiToolkitClient,
  getLoraExecution,
} from '~/utils/domain/capabilities/lora/access';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const jobId = getRouterParam(event, 'id');
  if (!jobId) throw new ApiError(400, 'JOB_ID_REQUIRED', '缺少任务编号');
  const execution = await getLoraExecution(jobId);
  await requireProjectAccess(identity, execution.projectId, 'write');
  if (!execution.externalJobId || execution.status !== 'running') {
    throw new ApiError(
      409,
      'LORA_CHECKPOINT_UNAVAILABLE',
      '当前训练不能立即保存',
    );
  }
  await createAiToolkitClient().requestSave(execution.externalJobId);
  await writeAudit(event, {
    action: 'lora.training.checkpoint.request',
    actor: identity,
    module: 'training',
    targetId: jobId,
    targetType: 'job',
  });
  return { accepted: true, id: jobId };
});
