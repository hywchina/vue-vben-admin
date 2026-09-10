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
  const { attachments, messageCount } = await sql.begin(async (transaction) => {
    const [owned] =
      await transaction`SELECT id FROM ai_conversations WHERE id = ${conversationId} AND user_id = ${identity.id} FOR UPDATE`;
    if (!owned)
      throw new ApiError(404, 'AI_CONVERSATION_NOT_FOUND', '对话不存在');
    const attachments = await transaction<
      { objectKey: string }[]
    >`SELECT object_key AS "objectKey" FROM ai_attachments WHERE conversation_id = ${conversationId} AND user_id = ${identity.id}`;
    const [counts] = await transaction<
      { count: number }[]
    >`SELECT count(*)::integer AS count FROM ai_messages WHERE conversation_id = ${conversationId}`;
    await transaction`DELETE FROM ai_conversations WHERE id = ${conversationId} AND user_id = ${identity.id}`;
    return { attachments, messageCount: counts?.count ?? 0 };
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
    action: 'assistant.conversation.delete',
    actor: identity,
    details: {
      attachmentCount: attachments.length,
      cleanupFailures,
      messageCount,
    },
    module: 'assistant',
    targetId: conversationId,
    targetType: 'ai-conversation',
  });
  return {
    deleted: true,
    deletedAttachments: attachments.length,
    deletedMessages: messageCount,
  };
});
