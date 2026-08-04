import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { deleteObject } from '~/utils/storage';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const attachmentId = getRouterParam(event, 'id');
  if (!attachmentId) {
    throw new ApiError(400, 'AI_ATTACHMENT_ID_REQUIRED', '缺少附件编号');
  }
  const sql = useDatabase();
  const [attachment] = await sql<
    { messageId: null | string; objectKey: string }[]
  >`
    SELECT
      attachment.message_id AS "messageId",
      attachment.object_key AS "objectKey"
    FROM ai_attachments attachment
    JOIN ai_conversations conversation
      ON conversation.id = attachment.conversation_id
    WHERE attachment.id = ${attachmentId}
      AND attachment.user_id = ${identity.id}
      AND conversation.user_id = ${identity.id}
  `;
  if (!attachment) {
    throw new ApiError(404, 'AI_ATTACHMENT_NOT_FOUND', '附件不存在');
  }
  if (attachment.messageId) {
    throw new ApiError(
      409,
      'AI_ATTACHMENT_ALREADY_SENT',
      '已发送的附件不能单独删除',
    );
  }
  await sql`
    DELETE FROM ai_attachments
    WHERE id = ${attachmentId} AND message_id IS NULL
  `;
  let cleanupFailed = false;
  try {
    await deleteObject(attachment.objectKey);
  } catch (error) {
    cleanupFailed = true;
    console.error('[AI assistant attachment cleanup]', error);
  }
  await writeAudit(event, {
    action: 'assistant.attachment.remove',
    actor: identity,
    details: { cleanupFailed },
    module: 'assistant',
    targetId: attachmentId,
    targetType: 'ai-attachment',
  });
  return { deleted: true };
});
