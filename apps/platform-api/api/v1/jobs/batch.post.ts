import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  jobIds: z.array(z.string().uuid()).min(1).max(200),
  operation: z.literal('archive'),
  projectId: z.string().uuid(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const jobIds = [...new Set(input.jobIds)];
  if (jobIds.length !== input.jobIds.length) {
    throw new ApiError(400, 'DUPLICATE_JOB_IDS', '批量操作中不能重复选择任务');
  }
  const sql = useDatabase();
  const jobs = await sql<{ id: string; status: string }[]>`
    SELECT id, status FROM jobs
    WHERE id IN ${sql(jobIds)}
      AND project_id = ${input.projectId}
      AND archived_at IS NULL
  `;
  if (jobs.length !== jobIds.length) {
    throw new ApiError(
      400,
      'INVALID_BATCH_JOBS',
      '部分任务不存在或不属于当前项目',
    );
  }
  const active = jobs.filter((job) =>
    ['cancelling', 'queued', 'running'].includes(job.status),
  );
  if (active.length > 0) {
    throw new ApiError(
      409,
      'ACTIVE_JOB_ARCHIVE_FORBIDDEN',
      '运行中的任务不能删除，请先取消任务',
    );
  }
  await sql`
    UPDATE jobs
    SET archived_at = now(), archived_by = ${identity.id}, updated_at = now()
    WHERE id IN ${sql(jobIds)} AND archived_at IS NULL
  `;
  await writeAudit(event, {
    action: 'job.batch.archive',
    actor: identity,
    details: { jobCount: jobIds.length, projectId: input.projectId },
    module: 'job',
    targetId: input.projectId,
    targetType: 'project',
  });
  return { archivedCount: jobIds.length };
});
