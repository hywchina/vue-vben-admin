import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access } from 'node:fs/promises';
import { createServer } from 'node:net';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

import { validateProductionEnvironment } from '../utils/infrastructure/config';

const directory = fileURLToPath(new URL('../', import.meta.url));
const databaseName = `rail_test_${randomUUID().replaceAll('-', '')}`;
const databasePassword = randomUUID();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const admin = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
const testUrl = new URL(databaseUrl);
testUrl.pathname = `/${databaseName}`;
testUrl.username = databaseName;
testUrl.password = databasePassword;
const children = new Set<ReturnType<typeof spawn>>();
let created = false;
let roleCreated = false;
let interrupted = false;

function launch(
  [command, ...args]: [string, ...string[]],
  env: NodeJS.ProcessEnv,
) {
  const child = spawn(command, args, {
    cwd: directory,
    env,
    stdio: 'inherit',
  });
  children.add(child);
  const done = new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  }).finally(() => children.delete(child));
  return { child, done };
}

async function run(script: string, env: NodeJS.ProcessEnv) {
  const { done } = launch(
    [process.execPath, '--import', 'tsx', `scripts/${script}`],
    env,
  );
  if ((await done) !== 0) throw new Error(`Integration step failed: ${script}`);
}

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test port');
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function main() {
  // Never fall back to the live API/database if the isolated build is missing.
  await access(new URL('../.output/server/index.mjs', import.meta.url));
  const port = await freePort();
  const env = {
    ...process.env,
    APP_PUBLIC_URL: `http://127.0.0.1:${port}`,
    BOOTSTRAP_ADMIN_PASSWORD: randomUUID(),
    BOOTSTRAP_DEMO_USERS: 'false',
    DATABASE_URL: testUrl.toString(),
    JWT_SECRET: randomUUID() + randomUUID(),
    // Configured for catalog contracts, but no GPU worker runs in this database.
    COMFYUI_API_URL: 'http://127.0.0.1:1',
    HOST: '127.0.0.1',
    NITRO_HOST: '127.0.0.1',
    NITRO_PORT: String(port),
    PORT: String(port),
    RAIL_API_URL: `http://127.0.0.1:${port}/api/v1`,
  };
  const issues = validateProductionEnvironment(env);
  if (issues.length > 0) {
    throw new Error(`Isolated API configuration invalid: ${issues.join('; ')}`);
  }
  await admin.unsafe(
    `CREATE ROLE "${databaseName}" LOGIN PASSWORD '${databasePassword}'`,
  );
  roleCreated = true;
  await admin.unsafe(
    `CREATE DATABASE "${databaseName}" OWNER "${databaseName}"`,
  );
  created = true;
  console.warn(`Isolated integration database: ${databaseName}`);
  await run('migrate.ts', env);
  await run('seed.ts', env);
  const api = launch([process.execPath, '.output/server/index.mjs'], env);
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (interrupted) throw new Error('Integration suite interrupted');
    if (api.child.exitCode !== null) throw new Error('Isolated API exited');
    try {
      const response = await fetch(`${env.RAIL_API_URL}/health/ready`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Wait only for our own newly started API, never a shared service.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error('Isolated API was not ready');
  const report = launch(
    [process.execPath, '--import', 'tsx', 'scripts/report-test-worker.ts'],
    env,
  );
  for (const script of [
    'integration-test.ts',
    'comfyui-worker-integration-test.ts',
    'generated-asset-naming-integration-test.ts',
    'business-id-integration-test.ts',
    'lora-dataset-integration-test.ts',
  ]) {
    if (interrupted) throw new Error('Integration suite interrupted');
    if (report.child.exitCode !== null)
      throw new Error('CPU report worker exited');
    await run(script, env);
  }
  console.warn(
    'Isolated integration suite passed; no real GPU jobs submitted.',
  );
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    interrupted = true;
    for (const child of children) child.kill('SIGTERM');
  });
}

try {
  await main();
} finally {
  const active = [...children];
  await Promise.all(
    active.map(async (child) => {
      if (child.exitCode !== null) return;
      const exited = new Promise<void>((resolve) =>
        child.once('exit', () => resolve()),
      );
      child.kill('SIGTERM');
      const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
      try {
        await exited;
      } finally {
        clearTimeout(timeout);
      }
    }),
  );
  // The only destructive target is the unique database created by this run.
  try {
    if (created && /^rail_test_[\da-f]{32}$/.test(databaseName)) {
      await admin.unsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      console.warn(`Removed isolated test database: ${databaseName}`);
    }
    if (roleCreated && /^rail_test_[\da-f]{32}$/.test(databaseName)) {
      await admin.unsafe(`DROP ROLE "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }
}
