import type { CurrentIdentity } from '../../identity';
import type { AssistantConversationRecord } from './conversations';

import { z } from 'zod';

import { getConfig } from '../../config';
import { useDatabase } from '../../database';
import { createDownloadUrl } from '../../storage';

const openAiProviderResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().trim().min(1).max(100_000),
        }),
      }),
    )
    .min(1),
  id: z.string().trim().min(1).max(255).optional(),
});

const legacyProviderResponseSchema = z.union([
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
  const openAiResponse = openAiProviderResponseSchema.safeParse(input);
  if (openAiResponse.success) {
    const [choice] = openAiResponse.data.choices;
    if (choice) {
      return {
        content: choice.message.content,
        messageId: openAiResponse.data.id,
      };
    }
  }

  const legacyResponse = legacyProviderResponseSchema.safeParse(input);
  if (legacyResponse.success) {
    return 'data' in legacyResponse.data
      ? legacyResponse.data.data
      : legacyResponse.data;
  }

  throw new AssistantProviderError(
    'AI_ASSISTANT_INVALID_RESPONSE',
    'AI 服务返回格式无效。',
  );
}

export type AssistantProviderContentPart =
  | { image_url: { url: string }; type: 'image_url' }
  | { text: string; type: 'text' }
  | { type: 'video_url'; video_url: { url: string } };

export interface AssistantProviderMessage {
  content: AssistantProviderContentPart[] | string;
  role: 'assistant' | 'system' | 'user';
}

export function buildAssistantProviderMessage(input: {
  attachments: Array<{
    filename: string;
    mimeType: string;
    url: string;
  }>;
  content: string;
  role: 'assistant' | 'user';
}): AssistantProviderMessage {
  if (input.attachments.length === 0) {
    return { content: input.content, role: input.role };
  }

  const content: AssistantProviderContentPart[] = [];
  if (input.content.trim()) {
    content.push({ text: input.content, type: 'text' });
  }
  const unsupportedFilenames: string[] = [];
  for (const attachment of input.attachments) {
    if (attachment.mimeType.startsWith('image/')) {
      content.push({ image_url: { url: attachment.url }, type: 'image_url' });
    } else if (attachment.mimeType.startsWith('video/')) {
      content.push({ type: 'video_url', video_url: { url: attachment.url } });
    } else {
      unsupportedFilenames.push(attachment.filename);
    }
  }
  if (unsupportedFilenames.length > 0) {
    content.push({
      text: `用户同时附加了以下文件，但当前对话接口未传递其正文：${unsupportedFilenames.join('、')}。不得声称已读取这些文件，应请用户粘贴文本或转为受支持的图像。`,
      type: 'text',
    });
  }
  return {
    content:
      content.length > 0
        ? content
        : [{ text: '请根据用户附件进行回答。', type: 'text' }],
    role: input.role,
  };
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

async function loadProviderMessages(conversationId: string, userId: string) {
  const sql = useDatabase();
  const messages = await sql<HistoryMessage[]>`
    SELECT * FROM (
      SELECT
        message.id,
        message.role,
        message.content,
        message.created_at AS "createdAt"
      FROM ai_messages message
      JOIN ai_conversations conversation
        ON conversation.id = message.conversation_id
      WHERE message.conversation_id = ${conversationId}
        AND conversation.user_id = ${userId}
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
      AND attachment.user_id = ${userId}
      AND attachment.status = 'available'
    ORDER BY attachment.created_at
  `;
  const preparedAttachments = await Promise.all(
    attachments.map(async (attachment) => {
      return {
        filename: attachment.filename,
        messageId: attachment.messageId,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        url: await createDownloadUrl(attachment.objectKey, attachment.filename),
      };
    }),
  );
  const attachmentsByMessage = new Map<
    string,
    Array<(typeof preparedAttachments)[number]>
  >();
  for (const attachment of preparedAttachments) {
    const list = attachmentsByMessage.get(attachment.messageId) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(attachment.messageId, list);
  }

  return messages.map((message) =>
    buildAssistantProviderMessage({
      attachments: attachmentsByMessage.get(message.id) ?? [],
      content: message.content,
      role: message.role,
    }),
  );
}

export async function requestAssistantCompletion(
  input: {
    apiKey: string;
    apiUrl: string;
    messages: AssistantProviderMessage[];
    model: string;
    sessionId: string;
    timeoutMs: number;
  },
  fetcher: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await fetcher(input.apiUrl, {
      body: JSON.stringify({
        messages: input.messages,
        model: input.model,
        sess_id: input.sessionId,
        stream: false,
      }),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
      signal: AbortSignal.timeout(input.timeoutMs),
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
    if (response.status === 401 || response.status === 403) {
      throw new AssistantProviderError(
        'AI_ASSISTANT_AUTH_FAILED',
        'AI 服务鉴权失败，请联系管理员检查 API Key。',
      );
    }
    if (response.status === 429) {
      throw new AssistantProviderError(
        'AI_ASSISTANT_RATE_LIMITED',
        'AI 服务请求过于频繁，请稍后重试。',
      );
    }
    if (response.status === 400 || response.status === 422) {
      throw new AssistantProviderError(
        'AI_ASSISTANT_REQUEST_REJECTED',
        'AI 服务不接受当前模型或消息格式，请联系管理员检查配置。',
      );
    }
    throw new AssistantProviderError(
      'AI_ASSISTANT_UPSTREAM_ERROR',
      'AI 服务返回异常，请稍后重试。',
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

export async function requestAssistantReply(input: {
  conversation: AssistantConversationRecord;
  identity: CurrentIdentity;
}) {
  const config = getConfig();
  if (!config.aiAssistantApiUrl || !config.aiAssistantApiKey) {
    throw new AssistantProviderError(
      'AI_ASSISTANT_NOT_CONFIGURED',
      'AI 服务尚未完整配置，请联系管理员配置服务地址和 API Key。',
    );
  }

  const history = await loadProviderMessages(
    input.conversation.id,
    input.identity.id,
  );
  const messages: AssistantProviderMessage[] = [
    {
      content:
        '你是轨道交通客室智能设计平台的设计辅助助手。回答应准确、简洁，明确区分事实、建议和待确认条件。不得声称已读取当前接口没有传递正文的附件。',
      role: 'system',
    },
    ...history,
  ];
  return requestAssistantCompletion({
    apiKey: config.aiAssistantApiKey,
    apiUrl: config.aiAssistantApiUrl,
    messages,
    model: config.aiAssistantModel,
    sessionId: input.conversation.id,
    timeoutMs: config.aiAssistantTimeoutMs,
  });
}
