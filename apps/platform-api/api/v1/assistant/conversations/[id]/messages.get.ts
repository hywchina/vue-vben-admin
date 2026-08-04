import { getRouterParam } from 'h3';
import { requireAssistantConversation } from '~/utils/assistant';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const conversationId = getRouterParam(event, 'id');
  if (!conversationId) {
    throw new ApiError(400, 'AI_CONVERSATION_ID_REQUIRED', '缺少对话编号');
  }
  await requireAssistantConversation(identity, conversationId);
  const sql = useDatabase();
  const messages = await sql<
    {
      content: string;
      createdAt: Date;
      errorCode: null | string;
      id: string;
      role: 'assistant' | 'system' | 'user';
      status: 'completed' | 'failed';
    }[]
  >`
    SELECT
      message.id,
      message.role,
      message.content,
      message.status,
      message.error_code AS "errorCode",
      message.created_at AS "createdAt"
    FROM ai_messages message
    WHERE message.conversation_id = ${conversationId}
    ORDER BY message.created_at, message.id
    LIMIT 500
  `;
  const attachments = await sql<
    {
      createdAt: Date;
      filename: string;
      id: string;
      messageId: string;
      mimeType: string;
      sizeBytes: number;
    }[]
  >`
    SELECT
      attachment.id,
      attachment.message_id AS "messageId",
      attachment.original_filename AS filename,
      attachment.mime_type AS "mimeType",
      attachment.size_bytes::integer AS "sizeBytes",
      attachment.created_at AS "createdAt"
    FROM ai_attachments attachment
    WHERE attachment.conversation_id = ${conversationId}
      AND attachment.user_id = ${identity.id}
      AND attachment.message_id IS NOT NULL
      AND attachment.status = 'available'
    ORDER BY attachment.created_at
  `;
  const attachmentsByMessage = new Map<
    string,
    Array<(typeof attachments)[number]>
  >();
  for (const attachment of attachments) {
    const list = attachmentsByMessage.get(attachment.messageId) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.messageId, list);
  }
  return messages.map((message) => ({
    ...message,
    attachments: (attachmentsByMessage.get(message.id) ?? []).map(
      (attachment) => ({
        ...attachment,
        createdAt: attachment.createdAt.toISOString(),
        isImage: attachment.mimeType.startsWith('image/'),
      }),
    ),
    createdAt: message.createdAt.toISOString(),
  }));
});
