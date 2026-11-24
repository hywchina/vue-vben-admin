import { useDatabase } from '~/utils/database';
import { getUuidParam } from '~/utils/http/resource-id';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';

// Resolve an owned conversation's project before loading a project-scoped draft.
// Project administrators do not gain access to another user's private session.
export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:read');
  const id = getUuidParam(event);
  if (!id)
    throw new ApiError(
      400,
      'DESIGN_CONVERSATION_ID_REQUIRED',
      '缺少设计会话编号',
    );
  const sql = useDatabase();
  const [conversation] = await sql<
    {
      id: string;
      lastContext: null | { appKey: string; designMode: string };
      projectId: string;
      title: string;
    }[]
  >`
    SELECT id, project_id AS "projectId", title, (
      SELECT jsonb_build_object('appKey', context.app_key, 'designMode', context.design_mode)
      FROM (
        SELECT app_key, design_mode, updated_at AS activity_at, 1 AS priority
        FROM design_conversation_drafts WHERE conversation_id = ${id}
        UNION ALL
        SELECT app_key, design_mode, created_at AS activity_at, 0 AS priority
        FROM jobs WHERE design_conversation_id = ${id}
          AND archived_at IS NULL AND design_round_archived_at IS NULL
      ) context
      ORDER BY context.activity_at DESC, context.priority DESC, context.app_key
      LIMIT 1
    ) AS "lastContext" FROM design_conversations
    WHERE id = ${id} AND user_id = ${identity.id} AND archived_at IS NULL
  `;
  if (!conversation)
    throw new ApiError(
      404,
      'DESIGN_CONVERSATION_NOT_FOUND',
      '设计会话不存在、已归档或不属于当前用户',
    );
  await requireProjectAccess(identity, conversation.projectId);
  return conversation;
});
