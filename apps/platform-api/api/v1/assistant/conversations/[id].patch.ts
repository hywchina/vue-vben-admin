import { getRouterParam } from 'h3';
import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireAssistantConversation } from '~/utils/domain/assistant/conversations';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  title: z.string().trim().min(1).max(120),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const conversationId = getRouterParam(event, 'id');
  if (!conversationId) {
    throw new ApiError(400, 'AI_CONVERSATION_ID_REQUIRED', '缺少对话编号');
  }
  const input = await parseBody(event, schema);
  await requireAssistantConversation(identity, conversationId);
  const sql = useDatabase();
  const [updated] = await sql<{ title: string; updatedAt: Date }[]>`
    UPDATE ai_conversations
    SET title = ${input.title}, updated_at = now()
    WHERE id = ${conversationId}
      AND user_id = ${identity.id}
    RETURNING title, updated_at AS "updatedAt"
  `;
  if (!updated) throw new Error('更新 AI 对话失败');
  await writeAudit(event, {
    action: 'assistant.conversation.rename',
    actor: identity,
    details: { titleLength: input.title.length },
    module: 'assistant',
    targetId: conversationId,
    targetType: 'ai-conversation',
  });
  return {
    id: conversationId,
    title: updated.title,
    updatedAt: updated.updatedAt.toISOString(),
  };
});
