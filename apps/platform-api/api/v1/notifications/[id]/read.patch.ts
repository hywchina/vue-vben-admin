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
  const [updated] = await sql<{ id: string }[]>`
    UPDATE notifications SET read_at = COALESCE(read_at, now())
    WHERE id = ${notificationId} AND user_id = ${identity.id}
    RETURNING id
  `;
  if (!updated) throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', '通知不存在');
  return { id: notificationId, isRead: true };
});
