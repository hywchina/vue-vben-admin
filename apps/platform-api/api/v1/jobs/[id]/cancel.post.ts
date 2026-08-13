import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const jobId = getRouterParam(event, 'id');
  if (!jobId) throw new ApiError(400, 'JOB_ID_REQUIRED', '缺少任务编号');
  const sql = useDatabase();
  const [job] = await sql<{ projectId: string; status: string }[]>`
    SELECT project_id AS "projectId", status FROM jobs WHERE id = ${jobId}
  `;
  if (!job) throw new ApiError(404, 'JOB_NOT_FOUND', '任务不存在');
  await requireProjectAccess(identity, job.projectId, 'write');
  if (!['queued', 'running'].includes(job.status)) {
    throw new ApiError(409, 'JOB_NOT_CANCELLABLE', '当前任务状态不能取消');
  }

  const [execution] = await sql<
    { externalJobId: null | string; status: string }[]
  >`
    SELECT
      status,
      external_job_id AS "externalJobId"
    FROM job_executions
    WHERE job_id = ${jobId}
  `;
  await (execution
    ? sql.begin(async (transaction) => {
        await transaction`
        UPDATE job_executions
        SET
          status = 'cancel_requested',
          next_poll_at = now(),
          lease_expires_at = null,
          updated_at = now()
        WHERE job_id = ${jobId}
      `;
        await transaction`
        UPDATE jobs
        SET
          status = 'cancelling',
          stage = '正在取消 ComfyUI 任务',
          updated_at = now()
        WHERE id = ${jobId}
      `;
      })
    : sql`
      UPDATE jobs
      SET
        status = 'cancelled',
        progress = CASE WHEN progress > 99 THEN 99 ELSE progress END,
        stage = '已由用户取消',
        completed_at = now(),
        updated_at = now()
      WHERE id = ${jobId}
      `);
  await writeAudit(event, {
    action: 'job.cancel',
    actor: identity,
    details: {
      cancellationMode: execution ? 'worker' : 'ledger-only',
      previousStatus: job.status,
    },
    module: 'job',
    targetId: jobId,
    targetType: 'job',
  });
  return {
    id: jobId,
    status: execution ? 'cancelling' : 'cancelled',
  };
});
