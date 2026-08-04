import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity, requirePermission } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const createProjectSchema = z.object({
  description: z.string().trim().max(2000).optional().default(''),
  name: z.string().trim().min(1).max(160),
  stage: z
    .enum(['concept', 'design', 'delivery'])
    .optional()
    .default('concept'),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:project:write');
  const input = await parseBody(event, createProjectSchema);
  const sql = useDatabase();

  const project = await sql.begin(async (transaction) => {
    const [sequence] = await transaction<{ value: string }[]>`
      SELECT nextval('project_code_seq')::text AS value
    `;
    const code = `CR-${new Date().getUTCFullYear()}-${String(sequence?.value ?? '1').padStart(4, '0')}`;
    const [created] = await transaction<
      {
        code: string;
        description: string;
        id: string;
        name: string;
        stage: string;
        updatedAt: Date;
      }[]
    >`
      INSERT INTO projects (code, name, description, stage, owner_id)
      VALUES (${code}, ${input.name}, ${input.description}, ${input.stage}, ${identity.id})
      RETURNING
        id, code, name, description, stage, updated_at AS "updatedAt"
    `;
    if (!created) throw new Error('创建项目失败');

    await transaction`
      INSERT INTO project_members (project_id, user_id, project_role)
      VALUES (${created.id}, ${identity.id}, 'owner')
    `;
    await transaction`
      INSERT INTO user_preferences (user_id, current_project_id)
      VALUES (${identity.id}, ${created.id})
      ON CONFLICT (user_id) DO UPDATE SET
        current_project_id = EXCLUDED.current_project_id,
        updated_at = now()
    `;
    return created;
  });

  await writeAudit(event, {
    action: 'project.create',
    actor: identity,
    details: { code: project.code, name: project.name },
    module: 'project',
    targetId: project.id,
    targetType: 'project',
  });

  return {
    ...project,
    assetCount: 0,
    members: 1,
    updatedAt: project.updatedAt.toISOString(),
  };
});
