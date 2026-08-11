import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireDesignConversation } from '~/utils/domain/design-conversations';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
});

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
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, input.projectId, 'write');
  await requireDesignConversation({
    conversationId,
    projectId: input.projectId,
    userId: identity.id,
  });
  const sql = useDatabase();
  const [updated] = await sql<{ title: string; updatedAt: Date }[]>`
    UPDATE design_conversations
    SET title = ${input.title}, updated_at = now()
    WHERE id = ${conversationId}
    RETURNING title, updated_at AS "updatedAt"
  `;
  if (!updated) throw new Error('更新设计会话失败');
  await writeAudit(event, {
    action: 'design.conversation.rename',
    actor: identity,
    details: { projectId: input.projectId, titleLength: input.title.length },
    module: 'design',
    targetId: conversationId,
    targetType: 'design_conversation',
  });
  return {
    id: conversationId,
    ...updated,
    updatedAt: updated.updatedAt.toISOString(),
  };
});
