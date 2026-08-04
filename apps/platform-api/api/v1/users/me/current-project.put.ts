import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({ projectId: z.string().uuid() });

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const { projectId } = await parseBody(event, schema);
  await requireProjectAccess(identity, projectId);
  const sql = useDatabase();
  await sql`
    INSERT INTO user_preferences (user_id, current_project_id)
    VALUES (${identity.id}, ${projectId})
    ON CONFLICT (user_id) DO UPDATE SET
      current_project_id = EXCLUDED.current_project_id,
      updated_at = now()
  `;
  return { projectId };
});
