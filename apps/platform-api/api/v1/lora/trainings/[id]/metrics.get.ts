import { getRouterParam } from 'h3';
import { z } from 'zod';
import {
  createAiToolkitClient,
  getLoraExecution,
} from '~/utils/domain/capabilities/lora/access';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  sinceStep: z.coerce.number().int().min(0).optional(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const jobId = getRouterParam(event, 'id');
  if (!jobId) throw new ApiError(400, 'JOB_ID_REQUIRED', '缺少任务编号');
  const execution = await getLoraExecution(jobId);
  await requireProjectAccess(identity, execution.projectId);
  if (!execution.externalJobId) {
    return { key: 'loss', keys: [], points: [] };
  }
  const { sinceStep } = parseQuery(event, querySchema);
  return await createAiToolkitClient().getLoss(
    execution.externalJobId,
    sinceStep,
  );
});
