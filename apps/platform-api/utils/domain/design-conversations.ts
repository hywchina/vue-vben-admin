import { useDatabase } from '~/utils/database';
import { ApiError } from '~/utils/response';

export interface DesignConversationRecord {
  archivedAt: Date | null;
  id: string;
  projectId: string;
  title: string;
  userId: string;
}

export async function requireDesignConversation(input: {
  allowArchived?: boolean;
  conversationId: string;
  projectId: string;
  userId: string;
}) {
  const sql = useDatabase();
  const [conversation] = await sql<DesignConversationRecord[]>`
    SELECT
      id,
      user_id AS "userId",
      project_id AS "projectId",
      title,
      archived_at AS "archivedAt"
    FROM design_conversations
    WHERE id = ${input.conversationId}
      AND user_id = ${input.userId}
      AND project_id = ${input.projectId}
      AND (${input.allowArchived ?? false} OR archived_at IS NULL)
  `;
  if (!conversation) {
    throw new ApiError(
      404,
      'DESIGN_CONVERSATION_NOT_FOUND',
      '设计会话不存在、已归档或不属于当前用户与项目',
    );
  }
  return conversation;
}
