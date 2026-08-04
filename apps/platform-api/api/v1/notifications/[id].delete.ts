import { getRouterParam } from 'h3';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { ApiError, apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const notificationId = getRouterParam(event, 'id');
  if (!notificationId) {
    throw new ApiError(400, 'NOTIFICATION_ID_REQUIRED', '缺少通知编号');
  }
  const sql = useDatabase();
  await sql`
    DELETE FROM notifications
    WHERE id = ${notificationId} AND user_id = ${identity.id}
  `;
  return { id: notificationId };
});
