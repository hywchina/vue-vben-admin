import process from 'node:process';

import { ReportGenerationWorker } from '../utils/domain/capabilities/report/worker';
import { closeDatabase } from '../utils/infrastructure/database';

// This helper must only run inside the disposable integration database.
const database = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (!/^rail_test_[\da-f]{32}$/.test(database)) {
  throw new Error('CPU test worker requires an isolated rail_test database');
}
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    stopped = true;
  });
}
try {
  await new ReportGenerationWorker().runUntil(() => stopped);
} finally {
  await closeDatabase();
}
