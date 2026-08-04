import { useDatabase } from '~/utils/database';
import { apiHandler } from '~/utils/response';

export default apiHandler(async () => {
  const sql = useDatabase();
  const [database] = await sql<{ now: Date }[]>`SELECT now() AS now`;
  return {
    database: database ? 'up' : 'down',
    service: 'platform-api',
    timestamp: database?.now.toISOString(),
  };
});
