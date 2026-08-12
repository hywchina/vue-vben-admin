import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { createPreviewUrl } from '~/utils/storage';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const sql = useDatabase();
  const [user] = await sql<
    {
      avatarMimeType: null | string;
      avatarObjectKey: null | string;
      publicId: string;
    }[]
  >`
    SELECT
      public_id AS "publicId",
      avatar_object_key AS "avatarObjectKey",
      avatar_mime_type AS "avatarMimeType"
    FROM users
    WHERE id = ${identity.id}
  `;
  let avatar = '/rail-logo.svg';
  if (user?.avatarObjectKey && user.avatarMimeType) {
    avatar = await createPreviewUrl(
      user.avatarObjectKey,
      user.avatarMimeType,
    ).catch(() => '/rail-logo.svg');
  }
  return {
    avatar,
    department: identity.department,
    email: identity.email,
    homePath: identity.homePath,
    id: identity.id,
    introduction: identity.introduction,
    publicId: user?.publicId,
    realName: identity.realName,
    roles: identity.roles,
    username: identity.username,
  };
});
