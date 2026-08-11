import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(120).optional(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, schema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const sql = useDatabase();
  const [conversation] = await sql<
    { createdAt: Date; id: string; title: string; updatedAt: Date }[]
  >`
    INSERT INTO design_conversations (user_id, project_id, title)
    VALUES (
      ${identity.id},
      ${input.projectId},
      ${input.title ?? '新设计会话'}
    )
    RETURNING id, title, created_at AS "createdAt", updated_at AS "updatedAt"
  `;
  if (!conversation) throw new Error('创建设计会话失败');
  await writeAudit(event, {
    action: 'design.conversation.create',
    actor: identity,
    details: { projectId: input.projectId },
    module: 'design',
    targetId: conversation.id,
    targetType: 'design_conversation',
  });
  return {
    ...conversation,
    activeJobCount: 0,
    createdAt: conversation.createdAt.toISOString(),
    lastAppKey: null,
    roundCount: 0,
    updatedAt: conversation.updatedAt.toISOString(),
  };
});
