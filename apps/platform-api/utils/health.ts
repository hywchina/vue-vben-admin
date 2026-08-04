import { useDatabase } from './database';
import { checkStorageHealth } from './storage';

export interface ReadinessResult {
  database: 'down' | 'up';
  storage: 'down' | 'up';
}

export async function checkReadiness(): Promise<ReadinessResult> {
  const sql = useDatabase();
  const [database, storage] = await Promise.allSettled([
    sql`SELECT 1`,
    checkStorageHealth(),
  ]);
  return {
    database: database.status === 'fulfilled' ? 'up' : 'down',
    storage: storage.status === 'fulfilled' ? 'up' : 'down',
  };
}

export function isReady(result: ReadinessResult) {
  return result.database === 'up' && result.storage === 'up';
}
