import postgres from 'postgres';

import { getConfig } from './config';

export type Database = ReturnType<typeof postgres>;

let client: Database | undefined;

export function useDatabase() {
  client ??= postgres(getConfig().databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 10,
    onnotice: () => undefined,
  });
  return client;
}

export async function closeDatabase() {
  if (!client) return;
  const activeClient = client;
  client = undefined;
  await activeClient.end({ timeout: 5 });
}
