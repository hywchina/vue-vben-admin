import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { getUuidParam } from '~/utils/http/resource-id';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({ projectId: z.string().uuid() });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const conversationId = getUuidParam(event);
  const jobId = getUuidParam(event, 'jobId');
  if (!conversationId || !jobId) {
    throw new ApiError(400, 'DESIGN_ROUND_ID_REQUIRED', '缺少会话或轮次编号');
  }
  const { projectId } = parseQuery(event, querySchema);
  await requireProjectAccess(identity, projectId, 'write');
  const sql = useDatabase();
  await sql.begin(async (transaction) => {
    const [round] = await transaction<{ archived: boolean; status: string }[]>`
      SELECT
        job.design_round_archived_at IS NOT NULL AS archived,
        job.status
      FROM jobs job
      JOIN design_conversations conversation ON conversation.id = job.design_conversation_id
      WHERE job.id = ${jobId}
        AND job.project_id = ${projectId}
        AND job.created_by = ${identity.id}
        AND job.archived_at IS NULL
        AND conversation.id = ${conversationId}
        AND conversation.project_id = ${projectId}
        AND conversation.user_id = ${identity.id}
        AND conversation.archived_at IS NULL
      FOR UPDATE OF job, conversation
    `;
    if (!round) {
      throw new ApiError(
        404,
        'DESIGN_ROUND_NOT_FOUND',
        '轮次不存在或不属于当前会话',
      );
    }
    if (round.archived) return;
    if (['cancelling', 'queued', 'running'].includes(round.status)) {
      throw new ApiError(
        409,
        'DESIGN_ROUND_ACTIVE',
        '本轮任务正在执行，请完成或停止后再删除',
      );
    }
    await transaction`
      UPDATE jobs SET design_round_archived_at = now() WHERE id = ${jobId}
    `;
    await writeAudit(
      event,
      {
        action: 'design.round.archive',
        actor: identity,
        details: { conversationId, projectId },
        module: 'design',
        targetId: jobId,
        targetType: 'job',
      },
      transaction,
    );
  });
  return { archived: true, id: jobId };
});
