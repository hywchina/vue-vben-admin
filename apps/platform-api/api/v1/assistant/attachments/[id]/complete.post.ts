import { getRouterParam } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { deleteObject, inspectObject } from '~/utils/storage';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const attachmentId = getRouterParam(event, 'id');
  if (!attachmentId) {
    throw new ApiError(400, 'AI_ATTACHMENT_ID_REQUIRED', '缺少附件编号');
  }
  const sql = useDatabase();
  const [attachment] = await sql<
    {
      expectedSize: number;
      filename: string;
      mimeType: string;
      objectKey: string;
      status: string;
    }[]
  >`
    SELECT
      attachment.object_key AS "objectKey",
      attachment.original_filename AS filename,
      attachment.mime_type AS "mimeType",
      attachment.size_bytes::float8 AS "expectedSize",
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
  if (attachment.status === 'available') {
    return { id: attachmentId, status: 'available' };
  }
  if (attachment.status !== 'pending') {
    throw new ApiError(409, 'AI_ATTACHMENT_UPLOAD_FAILED', '附件上传已失败');
  }
  const object = await inspectObject(attachment.objectKey);
  if (object.ContentLength !== attachment.expectedSize) {
    await deleteObject(attachment.objectKey);
    await sql`
      UPDATE ai_attachments SET status = 'failed'
      WHERE id = ${attachmentId}
    `;
    await writeAudit(event, {
      action: 'assistant.attachment.upload.complete',
      actor: identity,
      details: {
        expectedSize: attachment.expectedSize,
        uploadedSize: object.ContentLength,
      },
      module: 'assistant',
      result: 'failed',
      targetId: attachmentId,
      targetType: 'ai-attachment',
    });
    throw new ApiError(
      400,
      'AI_ATTACHMENT_SIZE_MISMATCH',
      '上传文件大小与登记信息不一致',
    );
  }
  await sql`
    UPDATE ai_attachments
    SET status = 'available', completed_at = now()
    WHERE id = ${attachmentId}
  `;
  await writeAudit(event, {
    action: 'assistant.attachment.upload.complete',
    actor: identity,
    details: {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: object.ContentLength,
    },
    module: 'assistant',
    targetId: attachmentId,
    targetType: 'ai-attachment',
  });
  return { id: attachmentId, status: 'available' };
});
