import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const sql = useDatabase();
  const conversations = await sql<
    {
      createdAt: Date;
      id: string;
      lastMessageAt: Date | null;
      messageCount: number;
      projectId: null | string;
      projectName: null | string;
      title: string;
      updatedAt: Date;
    }[]
  >`
    SELECT
      conversation.id,
      conversation.project_id AS "projectId",
      project.name AS "projectName",
      conversation.title,
      conversation.created_at AS "createdAt",
      conversation.updated_at AS "updatedAt",
      max(message.created_at) AS "lastMessageAt",
      count(message.id)::integer AS "messageCount"
    FROM ai_conversations conversation
    LEFT JOIN projects project ON project.id = conversation.project_id
    LEFT JOIN ai_messages message
      ON message.conversation_id = conversation.id
    WHERE conversation.user_id = ${identity.id}
    GROUP BY conversation.id, project.id
    ORDER BY conversation.updated_at DESC
    LIMIT 100
  `;
  return conversations.map((conversation) => ({
    ...conversation,
    createdAt: conversation.createdAt.toISOString(),
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    updatedAt: conversation.updatedAt.toISOString(),
  }));
});
