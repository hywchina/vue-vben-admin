import { useDatabase } from '../../database';

export async function createNotification(input: {
  link?: string;
  message: string;
  title: string;
  type?: string;
  userId: string;
}) {
  const sql = useDatabase();
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
}
