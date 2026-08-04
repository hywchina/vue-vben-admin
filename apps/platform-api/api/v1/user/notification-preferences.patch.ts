import { z } from 'zod';
import { writeAudit } from '~/utils/audit';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const schema = z.object({
  accountMessage: z.boolean(),
  systemMessage: z.boolean(),
  todoTask: z.boolean(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = await parseBody(event, schema);
  const sql = useDatabase();
  await sql`
    INSERT INTO user_preferences (user_id, notification_preferences)
    VALUES (${identity.id}, ${sql.json(input)})
    ON CONFLICT (user_id) DO UPDATE SET
      notification_preferences = EXCLUDED.notification_preferences,
      updated_at = now()
  `;
  await writeAudit(event, {
    action: 'user.notification-preferences.update',
    actor: identity,
    module: 'identity',
    targetId: identity.id,
    targetType: 'user',
  });
  return input;
});
