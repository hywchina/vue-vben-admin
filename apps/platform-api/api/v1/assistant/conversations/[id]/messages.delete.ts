import { getRouterParam } from 'h3';
import { requireAssistantConversation } from '~/utils/assistant';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { deleteObject } from '~/utils/storage';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const conversationId = getRouterParam(event, 'id');
  if (!conversationId) {
    throw new ApiError(400, 'AI_CONVERSATION_ID_REQUIRED', '缺少对话编号');
  }
  await requireAssistantConversation(identity, conversationId);
  const sql = useDatabase();
  const attachments = await sql<{ objectKey: string }[]>`
    SELECT object_key AS "objectKey"
    FROM ai_attachments
    WHERE conversation_id = ${conversationId}
      AND user_id = ${identity.id}
  `;
  const [counts] = await sql<
    { attachmentCount: number; messageCount: number }[]
  >`
    SELECT
      (SELECT count(*)::integer FROM ai_attachments
        WHERE conversation_id = ${conversationId}) AS "attachmentCount",
      (SELECT count(*)::integer FROM ai_messages
        WHERE conversation_id = ${conversationId}) AS "messageCount"
  `;
  await sql.begin(async (transaction) => {
    await transaction`
      DELETE FROM ai_attachments WHERE conversation_id = ${conversationId}
    `;
    await transaction`
      DELETE FROM ai_messages WHERE conversation_id = ${conversationId}
    `;
    await transaction`
      UPDATE ai_conversations
      SET title = '新对话', updated_at = now()
      WHERE id = ${conversationId}
    `;
  });
  const cleanupResults = await Promise.allSettled(
    attachments.map((attachment) => deleteObject(attachment.objectKey)),
  );
  const cleanupFailures = cleanupResults.filter(
    (result) => result.status === 'rejected',
  ).length;
  if (cleanupFailures > 0) {
    console.error(
      `[AI assistant cleanup] ${cleanupFailures} object(s) could not be removed`,
    );
  }
  await writeAudit(event, {
    action: 'assistant.messages.clear',
    actor: identity,
    details: {
      attachmentCount: counts?.attachmentCount ?? attachments.length,
      cleanupFailures,
      messageCount: counts?.messageCount ?? 0,
    },
    module: 'assistant',
    targetId: conversationId,
    targetType: 'ai-conversation',
  });
  return {
    deletedAttachments: counts?.attachmentCount ?? attachments.length,
    deletedMessages: counts?.messageCount ?? 0,
  };
});
