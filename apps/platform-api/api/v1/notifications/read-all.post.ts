import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const sql = useDatabase();
  await sql`
    UPDATE notifications SET read_at = COALESCE(read_at, now())
    WHERE user_id = ${identity.id}
  `;
  return null;
});
