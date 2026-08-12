import { randomUUID } from 'node:crypto';

import { getHeader, readMultipartFormData } from 'h3';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import {
  avatarFileExtension,
  detectAvatarMimeType,
  MAX_AVATAR_BYTES,
  readImageDimensions,
} from '~/utils/domain/users/avatar';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';
import { createPreviewUrl, deleteObject, storeObject } from '~/utils/storage';

const MAX_MULTIPART_BYTES = MAX_AVATAR_BYTES + 512 * 1024;

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const contentLength = Number(getHeader(event, 'content-length') ?? 0);
  if (contentLength > MAX_MULTIPART_BYTES) {
    throw new ApiError(413, 'AVATAR_TOO_LARGE', '头像不能超过 5 MB');
  }
  const parts = await readMultipartFormData(event);
  const file = parts?.find((part) => part.name === 'file' && part.filename);
  if (!file || file.data.byteLength === 0) {
    throw new ApiError(400, 'AVATAR_FILE_REQUIRED', '请选择头像文件');
  }
  if (file.data.byteLength > MAX_AVATAR_BYTES) {
    throw new ApiError(413, 'AVATAR_TOO_LARGE', '头像不能超过 5 MB');
  }
  const detectedMimeType = detectAvatarMimeType(file.data);
  if (!detectedMimeType || file.type !== detectedMimeType) {
    throw new ApiError(
      400,
      'AVATAR_TYPE_INVALID',
      '头像仅支持 PNG、JPEG 或 WebP 图片',
    );
  }
  const dimensions = readImageDimensions(file.data, detectedMimeType);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    throw new ApiError(400, 'AVATAR_IMAGE_INVALID', '无法读取头像图片尺寸');
  }
  if (dimensions.width !== dimensions.height) {
    throw new ApiError(400, 'AVATAR_MUST_BE_SQUARE', '头像必须先裁剪为正方形');
  }

  const objectKey = `users/${identity.id}/avatars/${randomUUID()}.${avatarFileExtension(detectedMimeType)}`;
  await storeObject(objectKey, detectedMimeType, file.data);

  const sql = useDatabase();
  let oldObjectKey: null | string = null;
  try {
    oldObjectKey = await sql.begin(async (transaction) => {
      const [current] = await transaction<{ objectKey: null | string }[]>`
        SELECT avatar_object_key AS "objectKey"
        FROM users
        WHERE id = ${identity.id} AND status = 'enabled'
        FOR UPDATE
      `;
      if (!current) throw new ApiError(404, 'USER_NOT_FOUND', '用户不存在');
      await transaction`
        UPDATE users
        SET
          avatar_object_key = ${objectKey},
          avatar_mime_type = ${detectedMimeType},
          avatar_updated_at = now(),
          updated_at = now()
        WHERE id = ${identity.id}
      `;
      return current.objectKey;
    });
  } catch (error) {
    await deleteObject(objectKey).catch(() => undefined);
    throw error;
  }

  if (oldObjectKey && oldObjectKey !== objectKey) {
    await deleteObject(oldObjectKey).catch((error) => {
      console.warn(`清理旧头像对象 ${oldObjectKey} 失败`, error);
    });
  }
  await writeAudit(event, {
    action: 'user.avatar.update',
    actor: identity,
    details: {
      mimeType: detectedMimeType,
      sizeBytes: file.data.byteLength,
      dimensions,
    },
    module: 'identity',
    targetId: identity.id,
    targetType: 'user',
  });
  return {
    avatar: await createPreviewUrl(objectKey, detectedMimeType),
    mimeType: detectedMimeType,
    sizeBytes: file.data.byteLength,
  };
});
