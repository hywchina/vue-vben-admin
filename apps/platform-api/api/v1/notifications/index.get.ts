import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { apiHandler } from '~/utils/response';

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const sql = useDatabase();
  const notifications = await sql<
    {
      createdAt: Date;
      id: string;
      isRead: boolean;
      link: null | string;
      message: string;
      title: string;
      type: string;
    }[]
  >`
    SELECT
      id,
      type,
      title,
      message,
      link,
      read_at IS NOT NULL AS "isRead",
      created_at AS "createdAt"
    FROM notifications
    WHERE user_id = ${identity.id}
    ORDER BY created_at DESC
    LIMIT 100
  `;
  return notifications.map((notification) => ({
    ...notification,
    createdAt: notification.createdAt.toISOString(),
  }));
});
