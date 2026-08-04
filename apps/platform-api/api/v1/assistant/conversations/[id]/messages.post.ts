import { getRouterParam } from 'h3';
import { z } from 'zod';
import {
  deriveAssistantConversationTitle,
  requireAssistantConversation,
} from '~/utils/assistant';
import {
  AssistantProviderError,
  requestAssistantReply,
} from '~/utils/assistant-provider';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z
  .object({
    attachmentIds: z.array(z.string().uuid()).max(8).default([]),
    content: z.string().max(20_000).default(''),
  })
  .refine(
    (input) =>
      input.content.trim().length > 0 || input.attachmentIds.length > 0,
    { message: '请输入消息或添加附件' },
  );

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const conversationId = getRouterParam(event, 'id');
  if (!conversationId) {
    throw new ApiError(400, 'AI_CONVERSATION_ID_REQUIRED', '缺少对话编号');
  }
  const conversation = await requireAssistantConversation(
    identity,
    conversationId,
  );
  const input = await parseBody(event, schema);
  const attachmentIds = [...new Set(input.attachmentIds)];
  if (attachmentIds.length !== input.attachmentIds.length) {
    throw new ApiError(400, 'AI_ATTACHMENT_DUPLICATED', '附件列表中存在重复项');
  }

  const sql = useDatabase();
  const attachments =
    attachmentIds.length === 0
      ? []
      : await sql<{ filename: string; id: string }[]>`
          SELECT id, original_filename AS filename
          FROM ai_attachments
          WHERE id = ANY(${attachmentIds}::uuid[])
            AND conversation_id = ${conversationId}
            AND user_id = ${identity.id}
            AND message_id IS NULL
            AND status = 'available'
        `;
  if (attachments.length !== attachmentIds.length) {
    throw new ApiError(
      400,
      'AI_ATTACHMENT_INVALID',
      '附件不存在、尚未上传完成或已被使用',
    );
  }

  const content = input.content.trim();
  const title = deriveAssistantConversationTitle(
    content,
    attachments[0]?.filename,
  );
  const userMessage = await sql.begin(async (transaction) => {
    const [message] = await transaction<{ createdAt: Date; id: string }[]>`
      INSERT INTO ai_messages (conversation_id, role, content)
      VALUES (${conversationId}, 'user', ${content})
      RETURNING id, created_at AS "createdAt"
    `;
    if (!message) throw new Error('创建 AI 用户消息失败');
    if (attachmentIds.length > 0) {
      const linkedAttachments = await transaction<{ id: string }[]>`
        UPDATE ai_attachments
        SET message_id = ${message.id}
        WHERE id = ANY(${attachmentIds}::uuid[])
          AND conversation_id = ${conversationId}
          AND user_id = ${identity.id}
          AND message_id IS NULL
          AND status = 'available'
        RETURNING id
      `;
      if (linkedAttachments.length !== attachmentIds.length) {
        throw new ApiError(
          409,
          'AI_ATTACHMENT_ALREADY_USED',
          '附件已被其他消息使用，请重新选择',
        );
      }
    }
    await transaction`
      UPDATE ai_conversations
      SET
        title = CASE WHEN title = '新对话' THEN ${title} ELSE title END,
        updated_at = now()
      WHERE id = ${conversationId}
    `;
    return message;
  });

  try {
    const reply = await requestAssistantReply({ conversation, identity });
    const [assistantMessage] = await sql<
      { content: string; createdAt: Date; id: string }[]
    >`
      INSERT INTO ai_messages (
        conversation_id, role, content, external_message_id
      ) VALUES (
        ${conversationId}, 'assistant', ${reply.content},
        ${reply.messageId ?? null}
      )
      RETURNING id, content, created_at AS "createdAt"
    `;
    if (!assistantMessage) throw new Error('保存 AI 回复失败');
    await sql`
      UPDATE ai_conversations SET updated_at = now()
      WHERE id = ${conversationId}
    `;
    await writeAudit(event, {
      action: 'assistant.message.send',
      actor: identity,
      details: {
        attachmentCount: attachmentIds.length,
        contentLength: content.length,
        providerResult: 'success',
      },
      module: 'assistant',
      targetId: conversationId,
      targetType: 'ai-conversation',
    });
    return {
      assistantMessage: {
        ...assistantMessage,
        attachments: [],
        createdAt: assistantMessage.createdAt.toISOString(),
        errorCode: null,
        role: 'assistant' as const,
        status: 'completed' as const,
      },
      serviceError: null,
      userMessageId: userMessage.id,
    };
  } catch (error) {
    if (!(error instanceof AssistantProviderError)) {
      console.error('[AI assistant provider]', error);
    }
    const providerError =
      error instanceof AssistantProviderError
        ? error
        : new AssistantProviderError(
            'AI_ASSISTANT_INTERNAL_ERROR',
            'AI 服务暂时无法处理请求，请稍后重试。',
          );
    const [assistantMessage] = await sql<
      { content: string; createdAt: Date; id: string }[]
    >`
      INSERT INTO ai_messages (
        conversation_id, role, content, status, error_code
      ) VALUES (
        ${conversationId}, 'assistant', ${providerError.message}, 'failed',
        ${providerError.code}
      )
      RETURNING id, content, created_at AS "createdAt"
    `;
    if (!assistantMessage) {
      throw new Error('保存 AI 错误消息失败', { cause: error });
    }
    await sql`
      UPDATE ai_conversations SET updated_at = now()
      WHERE id = ${conversationId}
    `;
    await writeAudit(event, {
      action: 'assistant.message.send',
      actor: identity,
      details: {
        attachmentCount: attachmentIds.length,
        contentLength: content.length,
        errorCode: providerError.code,
        providerResult: 'failed',
      },
      module: 'assistant',
      result: 'failed',
      targetId: conversationId,
      targetType: 'ai-conversation',
    });
    return {
      assistantMessage: {
        ...assistantMessage,
        attachments: [],
        createdAt: assistantMessage.createdAt.toISOString(),
        errorCode: providerError.code,
        role: 'assistant' as const,
        status: 'failed' as const,
      },
      serviceError: {
        code: providerError.code,
        message: providerError.message,
      },
      userMessageId: userMessage.id,
    };
  }
});
