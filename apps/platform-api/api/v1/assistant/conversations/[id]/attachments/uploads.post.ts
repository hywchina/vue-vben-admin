import { randomUUID } from 'node:crypto';

import { getRouterParam } from 'h3';
import { z } from 'zod';
import {
  assistantAttachmentExtension,
  isAssistantAttachmentSupported,
  requireAssistantConversation,
} from '~/utils/assistant';
import { writeAudit } from '~/utils/audit';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { createUploadUrl } from '~/utils/storage';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(255).default(''),
  sizeBytes: z.number().int().positive(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const conversationId = getRouterParam(event, 'id');
  if (!conversationId) {
    throw new ApiError(400, 'AI_CONVERSATION_ID_REQUIRED', '缺少对话编号');
  }
  await requireAssistantConversation(identity, conversationId);
  const input = await parseBody(event, schema);
  const config = getConfig();
  if (input.sizeBytes > config.aiAssistantMaxAttachmentBytes) {
    throw new ApiError(
      413,
      'AI_ATTACHMENT_TOO_LARGE',
      `附件超过允许的最大大小 ${config.aiAssistantMaxAttachmentBytes} 字节`,
    );
  }
  if (!isAssistantAttachmentSupported(input.filename, input.mimeType)) {
    throw new ApiError(
      415,
      'AI_ATTACHMENT_UNSUPPORTED',
      '仅支持图片、音视频、文本、PDF、Office 文档和 ZIP 文件',
    );
  }

  const attachmentId = randomUUID();
  const mimeType = input.mimeType || 'application/octet-stream';
  const objectKey = `assistant/${identity.id}/${conversationId}/${attachmentId}${assistantAttachmentExtension(input.filename)}`;
  const uploadUrl = await createUploadUrl(objectKey, mimeType);
  const sql = useDatabase();
  const [attachment] = await sql<
    {
      createdAt: Date;
      filename: string;
      id: string;
      mimeType: string;
      sizeBytes: number;
      status: string;
    }[]
  >`
    INSERT INTO ai_attachments (
      id, conversation_id, user_id, object_key, original_filename,
      mime_type, size_bytes
    ) VALUES (
      ${attachmentId}, ${conversationId}, ${identity.id}, ${objectKey},
      ${input.filename}, ${mimeType}, ${input.sizeBytes}
    )
    RETURNING
      id,
      original_filename AS filename,
      mime_type AS "mimeType",
      size_bytes::integer AS "sizeBytes",
      status,
      created_at AS "createdAt"
  `;
  if (!attachment) throw new Error('创建 AI 附件记录失败');
  await writeAudit(event, {
    action: 'assistant.attachment.upload.prepare',
    actor: identity,
    details: {
      filename: input.filename,
      mimeType,
      sizeBytes: input.sizeBytes,
    },
    module: 'assistant',
    targetId: attachmentId,
    targetType: 'ai-attachment',
  });
  return {
    attachment: {
      ...attachment,
      createdAt: attachment.createdAt.toISOString(),
      isImage: mimeType.startsWith('image/'),
    },
    upload: {
      expiresAt: new Date(
        Date.now() + config.s3PresignTtlSeconds * 1000,
      ).toISOString(),
      headers: { 'Content-Type': mimeType },
      method: 'PUT',
      url: uploadUrl,
    },
  };
});
