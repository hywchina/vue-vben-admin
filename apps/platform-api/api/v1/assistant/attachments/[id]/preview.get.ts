import { getRouterParam } from 'h3';
import { getConfig } from '~/utils/config';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { createPreviewUrl } from '~/utils/storage';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const attachmentId = getRouterParam(event, 'id');
  if (!attachmentId) {
    throw new ApiError(400, 'AI_ATTACHMENT_ID_REQUIRED', '缺少附件编号');
  }
  const sql = useDatabase();
  const [attachment] = await sql<
    { mimeType: string; objectKey: string; status: string }[]
  >`
    SELECT
      attachment.object_key AS "objectKey",
      attachment.mime_type AS "mimeType",
      attachment.status
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
  if (attachment.status !== 'available') {
    throw new ApiError(409, 'AI_ATTACHMENT_NOT_READY', '附件尚未上传完成');
  }
  if (!attachment.mimeType.startsWith('image/')) {
    throw new ApiError(
      415,
      'AI_ATTACHMENT_PREVIEW_UNSUPPORTED',
      '该附件不支持图片预览',
    );
  }
  return {
    expiresAt: new Date(
      Date.now() + getConfig().s3PresignTtlSeconds * 1000,
    ).toISOString(),
    url: await createPreviewUrl(attachment.objectKey, attachment.mimeType),
  };
});
