import type { AssistantConversationRecord } from './assistant';
import type { CurrentIdentity } from './identity';

import { z } from 'zod';

import { getConfig } from './config';
import { useDatabase } from './database';
import { createDownloadUrl } from './storage';

const providerResponseSchema = z.union([
  z.object({
    content: z.string().trim().min(1).max(100_000),
    messageId: z.string().trim().max(255).optional(),
  }),
  z.object({
    data: z.object({
      content: z.string().trim().min(1).max(100_000),
      messageId: z.string().trim().max(255).optional(),
    }),
  }),
]);

export class AssistantProviderError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AssistantProviderError';
  }
}

export function parseAssistantProviderResponse(input: unknown) {
  const parsed = providerResponseSchema.safeParse(input);
  if (!parsed.success) {
    throw new AssistantProviderError(
      'AI_ASSISTANT_INVALID_RESPONSE',
      'AI 服务返回格式无效。',
    );
  }
  return 'data' in parsed.data ? parsed.data.data : parsed.data;
}

interface HistoryMessage {
  content: string;
  createdAt: Date;
  id: string;
  role: 'assistant' | 'user';
}

interface HistoryAttachment {
  filename: string;
  messageId: string;
  mimeType: string;
  objectKey: string;
  sizeBytes: number;
}

async function loadProviderMessages(conversationId: string) {
  const sql = useDatabase();
  const messages = await sql<HistoryMessage[]>`
    SELECT * FROM (
      SELECT
        message.id,
        message.role,
        message.content,
        message.created_at AS "createdAt"
      FROM ai_messages message
      WHERE message.conversation_id = ${conversationId}
        AND message.role IN ('user', 'assistant')
        AND message.status = 'completed'
      ORDER BY message.created_at DESC, message.id DESC
      LIMIT 50
    ) recent_message
    ORDER BY recent_message."createdAt", recent_message.id
  `;
  if (messages.length === 0) return [];

  const attachments = await sql<HistoryAttachment[]>`
    SELECT
      attachment.message_id AS "messageId",
      attachment.original_filename AS filename,
      attachment.mime_type AS "mimeType",
      attachment.size_bytes::integer AS "sizeBytes",
      attachment.object_key AS "objectKey"
    FROM ai_attachments attachment
    WHERE attachment.message_id = ANY(${messages.map((message) => message.id)}::uuid[])
      AND attachment.status = 'available'
    ORDER BY attachment.created_at
  `;
  const attachmentsByMessage = new Map<
    string,
    Array<{
      filename: string;
      mimeType: string;
      sizeBytes: number;
      url: string;
    }>
  >();
  await Promise.all(
    attachments.map(async (attachment) => {
      const list = attachmentsByMessage.get(attachment.messageId) ?? [];
      list.push({
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        url: await createDownloadUrl(attachment.objectKey, attachment.filename),
      });
      attachmentsByMessage.set(attachment.messageId, list);
    }),
  );

  return messages.map((message) => ({
    attachments: attachmentsByMessage.get(message.id) ?? [],
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    role: message.role,
  }));
}

export async function requestAssistantReply(input: {
  conversation: AssistantConversationRecord;
  identity: CurrentIdentity;
}) {
  const config = getConfig();
  if (!config.aiAssistantApiUrl) {
    throw new AssistantProviderError(
      'AI_ASSISTANT_NOT_CONFIGURED',
      'AI 服务尚未配置，请联系管理员配置服务地址。',
    );
  }

  const messages = await loadProviderMessages(input.conversation.id);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (config.aiAssistantApiKey) {
    headers.Authorization = `Bearer ${config.aiAssistantApiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(config.aiAssistantApiUrl, {
      body: JSON.stringify({
        conversation: {
          id: input.conversation.id,
          projectId: input.conversation.projectId,
          projectName: input.conversation.projectName,
        },
        messages,
        model: config.aiAssistantModel,
        systemPrompt:
          '你是轨道交通客室智能设计平台的设计辅助助手。回答应准确、简洁，明确区分事实、建议和待确认条件。',
        user: {
          id: input.identity.id,
          realName: input.identity.realName,
          username: input.identity.username,
        },
        version: '2026-08-04',
      }),
      headers,
      method: 'POST',
      signal: AbortSignal.timeout(config.aiAssistantTimeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new AssistantProviderError(
      name === 'TimeoutError' || name === 'AbortError'
        ? 'AI_ASSISTANT_TIMEOUT'
        : 'AI_ASSISTANT_UNAVAILABLE',
      name === 'TimeoutError' || name === 'AbortError'
        ? 'AI 服务响应超时，请稍后重试。'
        : 'AI 服务暂时不可用，请稍后重试。',
    );
  }

  if (!response.ok) {
    throw new AssistantProviderError(
      response.status === 429
        ? 'AI_ASSISTANT_RATE_LIMITED'
        : 'AI_ASSISTANT_UPSTREAM_ERROR',
      response.status === 429
        ? 'AI 服务请求过于频繁，请稍后重试。'
        : 'AI 服务返回异常，请稍后重试。',
    );
  }

  const responseText = await response.text();
  if (responseText.length > 1_000_000) {
    throw new AssistantProviderError(
      'AI_ASSISTANT_RESPONSE_TOO_LARGE',
      'AI 服务返回内容过大，无法保存。',
    );
  }

  let responseBody: unknown;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    throw new AssistantProviderError(
      'AI_ASSISTANT_INVALID_RESPONSE',
      'AI 服务返回格式无效。',
    );
  }
  return parseAssistantProviderResponse(responseBody);
}
