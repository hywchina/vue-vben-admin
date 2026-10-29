// Optional local browser/GPU acceptance; only the integration suite's disposable DB is allowed.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { closeSync, openSync } from 'node:fs';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const db = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (!/^rail_test_[\da-f]{32}$/.test(db))
  throw new Error(
    'Live model acceptance requires a disposable rail_test database',
  );
const project = fileURLToPath(new URL('../../../', import.meta.url));
const comfyPath = fileURLToPath(
  new URL('../../../../ComfyUI/', import.meta.url),
);
const preset = fileURLToPath(
  new URL('../../../../../models/comfyui_models/', import.meta.url),
);
const work = join(project, '.rail-platform-runtime');
await mkdir(work, { recursive: true });
const runtime = await mkdtemp(join(work, 'model-browser-'));
const root = join(runtime, 'managed-models');
await mkdir(root);
const metadata = join(work, 'model-management-browser.json');
const finish = join(runtime, 'finish');
await access(join(comfyPath, '.venv/bin/python'));
const children: ReturnType<typeof spawn>[] = [];
let stopping = false;
const isStopping = () => stopping;
process.on('SIGTERM', () => {
  stopping = true;
});
process.on('SIGINT', () => {
  stopping = true;
});
for (const port of [5320, 5666, 8188]) {
  const probe = createServer();
  await new Promise<void>((resolve, reject) =>
    probe.once('error', reject).listen(port, '127.0.0.1', resolve),
  );
  await new Promise<void>((r) => probe.close(() => r()));
}
function launch(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  log: string,
) {
  const logFd = openSync(join(runtime, log), 'a', 0o600);
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  closeSync(logFd);
  children.push(child);
  return child;
}
async function waitFor(url: string) {
  for (let i = 0; i < 180; i++) {
    if (stopping) throw new Error('Acceptance interrupted');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Acceptance service did not start: ${url}`);
}
process.env.MANAGED_MODELS_ROOT = root;
process.env.COMFYUI_API_URL = 'http://127.0.0.1:8188';
const [
  { useDatabase, closeDatabase },
  { hashPassword },
  { ManagedModelWorker },
  { ComfyUiWorker },
  { deleteObject },
] = await Promise.all([
  import('../utils/database'),
  import('../utils/password'),
  import('../utils/domain/models/repository'),
  import('../utils/domain/capabilities/comfyui/worker'),
  import('../utils/storage'),
]);
const sql = useDatabase();
let userId = '';
let background: Promise<void> | undefined;
let backgroundError: unknown;
try {
  const password = `Model-${randomUUID()}!`;
  const username = `model_browser_${randomUUID().slice(0, 8)}`;
  const [admin] = await sql<
    { id: string }[]
  >`INSERT INTO users(username,real_name,password_hash,status)VALUES(${username},'模型管理验收管理员',${await hashPassword(password)},'enabled') RETURNING id`;
  assert.ok(admin);
  userId = admin.id;
  await sql`INSERT INTO user_roles(user_id,role_id)SELECT ${userId},id FROM roles WHERE code='admin'`;
  const modelPaths = {
    diffusion_models: 'unet',
    loras: 'loras',
    vae: 'vae',
    text_encoders: 'text_encoders\nclip',
    checkpoints: 'checkpoints',
    controlnet: 'controlnet',
    upscale_models: 'upscale_models',
    clip_vision: 'clip_vision',
  };
  const yaml = join(runtime, 'paths.yaml');
  await writeFile(
    yaml,
    JSON.stringify(
      {
        preset: { base_path: preset, ...modelPaths },
        managed: {
          base_path: root,
          ...modelPaths,
          text_encoders: 'text_encoders',
        },
      },
      null,
      2,
    ),
  );
  for (const d of ['input', 'output', 'user']) await mkdir(join(runtime, d));
  launch(
    join(comfyPath, '.venv/bin/python'),
    [
      '-u',
      'main.py',
      '--listen',
      '127.0.0.1',
      '--port',
      '8188',
      '--disable-auto-launch',
      '--disable-api-nodes',
      '--preview-method',
      'none',
      '--lowvram',
      '--reserve-vram',
      '1',
      '--extra-model-paths-config',
      yaml,
      '--input-directory',
      join(runtime, 'input'),
      '--output-directory',
      join(runtime, 'output'),
      '--user-directory',
      join(runtime, 'user'),
    ],
    comfyPath,
    {
      ...process.env,
      HF_HUB_OFFLINE: '1',
      TRANSFORMERS_OFFLINE: '1',
      DO_NOT_TRACK: '1',
    },
    'comfy.log',
  );
  await waitFor('http://127.0.0.1:8188/system_stats');
  launch(
    process.execPath,
    ['.output/server/index.mjs'],
    fileURLToPath(new URL('../', import.meta.url)),
    {
      ...process.env,
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: '5320',
      PORT: '5320',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5666,http://127.0.0.1:5666',
      APP_PUBLIC_URL: 'http://127.0.0.1:5666',
    },
    'api.log',
  );
  await waitFor('http://127.0.0.1:5320/api/v1/health/ready');
  launch(
    'pnpm',
    ['dev:rail:web', '--host', '127.0.0.1'],
    project,
    { ...process.env, VITE_PORT: '5666', VITE_GLOB_API_URL: '/api/v1' },
    'web.log',
  );
  await waitFor('http://127.0.0.1:5666/');
  const modelWorker = new ManagedModelWorker();
  background = (async () => {
    while (!isStopping()) {
      await modelWorker.runOnce();
      const rows = await sql<
        { id: string }[]
      >`SELECT id FROM jobs WHERE created_by=${userId} AND status IN ('queued','running','cancelling')`;
      if (rows.length > 0)
        await new ComfyUiWorker({
          instanceId: `model-live-${userId}`,
          jobIds: rows.map((r) => r.id),
        }).runOnce();
      await new Promise((r) => setTimeout(r, 1000));
    }
  })().catch((error: unknown) => {
    backgroundError = error;
    stopping = true;
  });
  await writeFile(
    metadata,
    JSON.stringify(
      {
        username,
        password,
        userId,
        root,
        runtime,
        finish,
        url: 'http://127.0.0.1:5666/',
        api: 'http://127.0.0.1:5320/api/v1',
        sample: join(
          preset,
          'loras/flux2_klein_9b_interior_lora_smoke.safetensors',
        ),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.warn(
    'Local browser/GPU acceptance ready; credentials are in the ignored runtime metadata file. No production state is used.',
  );
  while (!isStopping()) {
    try {
      await access(finish);
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (backgroundError) throw backgroundError;
} finally {
  stopping = true;
  await background;
  const keys = await sql<
    { key: string }[]
  >`SELECT av.object_key AS key FROM assets a JOIN asset_versions av ON av.asset_id=a.id WHERE a.owner_id=${userId || null} AND av.object_key IS NOT NULL`;
  for (const key of keys) await deleteObject(key.key);
  for (const child of children.toReversed()) {
    if (child.exitCode !== null) continue;
    const done = once(child, 'exit');
    if (child.pid) process.kill(-child.pid, 'SIGTERM');
    const timeout = setTimeout(() => {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {}
      }
    }, 5000);
    await done;
    clearTimeout(timeout);
  }
  await closeDatabase();
  await rm(metadata, { force: true });
  await rm(runtime, { recursive: true, force: true });
}
