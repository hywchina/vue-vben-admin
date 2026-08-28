import { getRouterParam } from 'h3';
import { useDatabase } from '~/utils/database';
import { getLoraExecution } from '~/utils/domain/capabilities/lora/access';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const jobId = getRouterParam(event, 'id');
  if (!jobId) throw new ApiError(400, 'JOB_ID_REQUIRED', '缺少任务编号');
  const execution = await getLoraExecution(jobId);
  await requireProjectAccess(identity, execution.projectId);
  const sql = useDatabase();
  const [job] = await sql<
    {
      completedAt: Date | null;
      createdAt: Date;
      error: null | Record<string, unknown>;
      name: string;
      parameters: Record<string, unknown>;
      progress: number;
      publicId: string;
      stage: string;
      status: string;
    }[]
  >`
    SELECT
      public_id AS "publicId", name, status, progress, stage, parameters,
      error, created_at AS "createdAt", completed_at AS "completedAt"
    FROM jobs
    WHERE id = ${jobId}
  `;
  if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', '任务不存在');
  return {
    ...job,
    completedAt: job.completedAt?.toISOString(),
    createdAt: job.createdAt.toISOString(),
    executionStatus: execution.status,
    externalReference: execution.externalJobId ?? undefined,
    gpuIds: execution.gpuIds,
    id: jobId,
  };
});
