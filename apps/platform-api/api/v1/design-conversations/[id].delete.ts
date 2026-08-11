import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireDesignConversation } from '~/utils/domain/design-conversations';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({ projectId: z.string().uuid() });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const conversationId = getRouterParam(event, 'id');
  if (!conversationId) {
    throw new ApiError(
      400,
      'DESIGN_CONVERSATION_ID_REQUIRED',
      '缺少设计会话编号',
    );
  }
  const { projectId } = parseQuery(event, querySchema);
  await requireProjectAccess(identity, projectId, 'write');
  await requireDesignConversation({
    conversationId,
    projectId,
    userId: identity.id,
  });
  const sql = useDatabase();
  const [activeJob] = await sql<{ id: string }[]>`
    SELECT id FROM jobs
    WHERE design_conversation_id = ${conversationId}
      AND status IN ('queued', 'running', 'cancelling')
    LIMIT 1
  `;
  if (activeJob) {
    throw new ApiError(
      409,
      'DESIGN_CONVERSATION_JOB_ACTIVE',
      '当前设计会话仍有进行中的任务，完成或取消后才能删除',
    );
  }
  await sql`
    UPDATE design_conversations
    SET archived_at = now(), updated_at = now()
    WHERE id = ${conversationId}
  `;
  await writeAudit(event, {
    action: 'design.conversation.archive',
    actor: identity,
    details: { projectId },
    module: 'design',
    targetId: conversationId,
    targetType: 'design_conversation',
  });
  return { archived: true, id: conversationId };
});
