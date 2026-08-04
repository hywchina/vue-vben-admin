import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { closeDatabase, useDatabase } from '../utils/database';

const migrationsDirectory = fileURLToPath(
  new URL('../migrations/', import.meta.url),
);

async function migrate() {
  const sql = useDatabase();
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const migrationEntries = await readdir(migrationsDirectory);
  const files = migrationEntries
    .filter((file) => file.endsWith('.sql'))
    .toSorted();

  for (const file of files) {
    const [applied] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM schema_migrations WHERE name = ${file}
      ) AS exists
    `;
    if (applied?.exists) continue;

    const migration = await readFile(`${migrationsDirectory}/${file}`, 'utf8');
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration);
      await transaction`
        INSERT INTO schema_migrations (name) VALUES (${file})
      `;
    });
    console.warn(`已应用数据库迁移：${file}`);
  }
}

try {
  await migrate();
} finally {
  await closeDatabase();
}
