import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

// Ignore legacy projectId fields: assistant conversations belong only to users.
const schema = z.object({});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  await parseBody(event, schema);
  const sql = useDatabase();
  const [conversation] = await sql<
    { createdAt: Date; id: string; projectId: null | string; title: string }[]
  >`
    INSERT INTO ai_conversations (user_id, project_id)
    VALUES (${identity.id}, ${null})
    RETURNING
      id,
      project_id AS "projectId",
      title,
      created_at AS "createdAt"
  `;
  if (!conversation) throw new Error('创建 AI 对话失败');
  await writeAudit(event, {
    action: 'assistant.conversation.create',
    actor: identity,
    details: {},
    module: 'assistant',
    targetId: conversation.id,
    targetType: 'ai-conversation',
  });
  return {
    ...conversation,
    createdAt: conversation.createdAt.toISOString(),
    lastMessageAt: null,
    messageCount: 0,
    projectName: null,
    updatedAt: conversation.createdAt.toISOString(),
  };
});
