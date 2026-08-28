import { getRouterParam } from 'h3';
import { useDatabase } from '~/utils/database';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { createPreviewUrl } from '~/utils/storage';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const projectId = getRouterParam(event, 'id');
  if (!projectId)
    throw new ApiError(400, 'PROJECT_ID_REQUIRED', '缺少项目编号');
  await requireProjectAccess(identity, projectId);
  const sql = useDatabase();
  const [project] = await sql<{ ownerId: string }[]>`
    SELECT owner_id AS "ownerId"
    FROM projects
    WHERE id = ${projectId} AND archived_at IS NULL
  `;
  if (!project) throw new ApiError(404, 'PROJECT_NOT_FOUND', '项目不存在');
  const members = await sql<
    {
      assetCount: number;
      avatarMimeType: null | string;
      avatarObjectKey: null | string;
      department: string;
      jobCount: number;
      joinedAt: Date;
      name: string;
      projectRole: 'editor' | 'owner' | 'viewer';
      publicId: string;
      userId: string;
      username: string;
    }[]
  >`
    SELECT
      member.user_id AS "userId",
      user_account.public_id AS "publicId",
      user_account.username,
      user_account.real_name AS name,
      user_account.department,
      user_account.avatar_object_key AS "avatarObjectKey",
      user_account.avatar_mime_type AS "avatarMimeType",
      member.project_role AS "projectRole",
      member.joined_at AS "joinedAt",
      count(DISTINCT asset.id) FILTER (
        WHERE asset.deleted_at IS NULL AND asset.saved_at IS NOT NULL
      )::integer AS "assetCount",
      count(DISTINCT job.id) FILTER (
        WHERE job.archived_at IS NULL
      )::integer AS "jobCount"
    FROM project_members member
    JOIN users user_account ON user_account.id = member.user_id
    LEFT JOIN assets asset
      ON asset.project_id = member.project_id AND asset.owner_id = member.user_id
    LEFT JOIN jobs job
      ON job.project_id = member.project_id AND job.created_by = member.user_id
    WHERE member.project_id = ${projectId}
    GROUP BY member.project_id, member.user_id, member.project_role, member.joined_at,
      user_account.id
    ORDER BY
      CASE member.project_role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END,
      member.joined_at ASC
  `;
  return {
    canInvite:
      project.ownerId === identity.id || hasAdministrativeRole(identity),
    items: await Promise.all(
      members.map(async ({ avatarMimeType, avatarObjectKey, ...member }) => ({
        ...member,
        avatar:
          avatarObjectKey && avatarMimeType
            ? await createPreviewUrl(avatarObjectKey, avatarMimeType).catch(
                () => null,
              )
            : null,
        joinedAt: member.joinedAt.toISOString(),
      })),
    ),
    projectId,
  };
});
