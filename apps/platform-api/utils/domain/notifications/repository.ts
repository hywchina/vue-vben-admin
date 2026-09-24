import { useDatabase } from '../../database';

export async function createNotification(input: {
  link?: string;
  message: string;
  preference?: 'accountMessage' | 'systemMessage' | 'todoTask';
  title: string;
  type?: string;
  userId: string;
}) {
  const sql = useDatabase();
  if (input.preference) {
    const [settings] = await sql<
      {
        notificationPreferences: null | Record<string, boolean>;
      }[]
    >`
      SELECT preference.notification_preferences AS "notificationPreferences"
      FROM users user_account
      LEFT JOIN user_preferences preference
        ON preference.user_id = user_account.id
      WHERE user_account.id = ${input.userId}
        AND user_account.status = 'enabled'
    `;
    if (!settings) return false;
    if (settings.notificationPreferences?.[input.preference] === false) {
      return false;
    }
  }
  await sql`
    INSERT INTO notifications (user_id, type, title, message, link)
    VALUES (
      ${input.userId},
      ${input.type ?? 'info'},
      ${input.title},
      ${input.message},
      ${input.link ?? null}
    )
  `;
  return true;
}
