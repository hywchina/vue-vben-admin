import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  projectId: z.string().uuid().optional(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = await parseBody(event, schema);
  const sql = useDatabase();
  let projectName: null | string = null;
  if (input.projectId) {
    await requireProjectAccess(identity, input.projectId);
    const [project] = await sql<{ name: string }[]>`
      SELECT name FROM projects WHERE id = ${input.projectId}
    `;
    projectName = project?.name ?? null;
  }
  const [conversation] = await sql<
    { createdAt: Date; id: string; projectId: null | string; title: string }[]
  >`
    INSERT INTO ai_conversations (user_id, project_id)
    VALUES (${identity.id}, ${input.projectId ?? null})
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
    details: { projectId: input.projectId ?? null },
    module: 'assistant',
    targetId: conversation.id,
    targetType: 'ai-conversation',
  });
  return {
    ...conversation,
    createdAt: conversation.createdAt.toISOString(),
    lastMessageAt: null,
    messageCount: 0,
    projectName,
    updatedAt: conversation.createdAt.toISOString(),
  };
});
