import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

const defaultPreferences = {
  accountMessage: true,
  systemMessage: true,
  todoTask: true,
};

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const sql = useDatabase();
  const [preferences] = await sql<
    { notificationPreferences: null | typeof defaultPreferences }[]
  >`
    SELECT notification_preferences AS "notificationPreferences"
    FROM user_preferences
    WHERE user_id = ${identity.id}
  `;
  return preferences?.notificationPreferences ?? defaultPreferences;
});
