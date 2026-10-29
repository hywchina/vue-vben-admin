import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const database = new URL(process.env.DATABASE_URL ?? '').pathname.slice(1);
if (!/^rail_test_[\da-f]{32}$/.test(database))
  throw new Error('Model acceptance requires an isolated rail_test database');
const root = await mkdtemp(join(tmpdir(), 'rail-managed-models-'));
process.env.MANAGED_MODELS_ROOT = root;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
let executionFailure = false;
let submitted: Record<string, unknown> | undefined;
async function inventory(path: string, prefix = ''): Promise<string[]> {
  try {
    const out: string[] = [];
    for (const e of await readdir(path, { withFileTypes: true })) {
      if (e.isDirectory())
        out.push(
          ...(await inventory(join(path, e.name), `${prefix + e.name}/`)),
        );
      else if (e.name.endsWith('.safetensors')) out.push(prefix + e.name);
    }
    return out;
  } catch {
    return [];
  }
}
const comfy = createServer(async (req, res) => {
  res.setHeader('content-type', 'application/json');
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/object_info') {
    res.end(
      JSON.stringify({
        LoraLoader: {
          input: {
            required: {
              lora_name: [
                ['old.safetensors', ...(await inventory(join(root, 'loras')))],
                {},
              ],
            },
          },
        },
      }),
    );
    return;
  }
  if (url.pathname === '/prompt') {
    const chunks = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    submitted = JSON.parse(Buffer.concat(chunks).toString()).prompt;
    res.end(JSON.stringify({ prompt_id: 'model-test-prompt', number: 1 }));
    return;
  }
  if (url.pathname === '/history/model-test-prompt') {
    res.end(
      JSON.stringify({
        'model-test-prompt': {
          status: {
            status_str: executionFailure ? 'error' : 'success',
            messages: executionFailure
              ? [
                  [
                    'execution_error',
                    { exception_message: 'Fixture incompatible model' },
                  ],
                ]
              : [],
          },
          outputs: {
            '2': {
              images: [{ filename: 'test.png', type: 'output', subfolder: '' }],
            },
          },
        },
      }),
    );
    return;
  }
  if (url.pathname === '/view') {
    res.setHeader('content-type', 'image/png');
    res.end(png);
    return;
  }
  if (url.pathname === '/queue') {
    res.end(JSON.stringify({ queue_running: [], queue_pending: [] }));
    return;
  }
  res.statusCode = 404;
  res.end('{}');
});
comfy.listen(0, '127.0.0.1');
await once(comfy, 'listening');
const address = comfy.address();
assert.ok(address && typeof address !== 'string');
process.env.COMFYUI_API_URL = `http://127.0.0.1:${address.port}`;
const probe = createServer();
probe.listen(0, '127.0.0.1');
await once(probe, 'listening');
const a = probe.address();
assert.ok(a && typeof a !== 'string');
await new Promise<void>((r) => probe.close(() => r()));
const port = a.port;
const base = `http://127.0.0.1:${port}/api/v1`;
const api = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: {
    ...process.env,
    NITRO_PORT: String(port),
    PORT: String(port),
    APP_PUBLIC_URL: `http://127.0.0.1:${port}`,
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let apiErrors = '';
api.stderr?.on('data', (chunk) => {
  apiErrors += chunk.toString();
});
const [
  { useDatabase, closeDatabase },
  { createAccessToken },
  { ManagedModelWorker },
  { ComfyUiWorker },
  { deleteObject },
] = await Promise.all([
  import('../utils/database'),
  import('../utils/identity/tokens'),
  import('../utils/domain/models/repository'),
  import('../utils/domain/capabilities/comfyui/worker'),
  import('../utils/storage'),
]);
const sql = useDatabase();
const marker = randomUUID().slice(0, 8);
const objects: string[] = [];
let checks = 0;
async function request<T = Record<string, unknown>>(
  path: string,
  token: null | string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  status = 200,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body instanceof Buffer
        ? { 'Content-Type': 'application/octet-stream' }
        : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined
      ? {}
      : { body: body instanceof Buffer ? body : JSON.stringify(body) }),
  });
  const value = (await response.json()) as {
    code: unknown;
    data: T;
    message: string;
  };
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(value)}`,
  );
  checks++;
  return value.data;
}
function tensor(count = 1) {
  let header = Buffer.from(
    JSON.stringify({
      weight: { dtype: 'F32', shape: [count], data_offsets: [0, count * 4] },
    }),
  );
  header = Buffer.concat([
    header,
    Buffer.alloc((8 - (header.length % 8)) % 8, 32),
  ]);
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64LE(BigInt(header.length));
  return Buffer.concat([prefix, header, Buffer.alloc(count * 4)]);
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const health = await fetch(`${base}/health/ready`);
      ready = health.ok;
    } catch {}
    if (ready) break;
    if (api.exitCode !== null) throw new Error(apiErrors);
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, apiErrors);
  async function user(role: string) {
    const [row] = await sql<
      { id: string; username: string }[]
    >`INSERT INTO users(username,real_name,password_hash,status)VALUES(${`model-${role}-${marker}`},'Model test','unused-signin','enabled') RETURNING id,username`;
    assert.ok(row);
    await sql`INSERT INTO user_roles(user_id,role_id)SELECT ${row.id},id FROM roles WHERE code=${role}`;
    return {
      ...row,
      token: await createAccessToken({ ...row, roles: [role] }),
    };
  }
  const admin = await user('admin');
  const ordinary = await user('user');
  await request('/model-management', null, undefined, 'GET', 401);
  await request('/model-management', ordinary.token, undefined, 'GET', 403);
  await request(
    '/model-management/not-a-uuid',
    admin.token,
    undefined,
    'GET',
    400,
  );
  await request(
    '/model-management',
    admin.token,
    {
      name: 'unsafe',
      category: 'loras',
      files: [{ path: '../escape.safetensors', size: 1 }],
    },
    'POST',
    400,
  );
  const bytes = tensor(2 * 1024 * 1024 + 1);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const model = await request<{ id: string; partBytes: number }>(
    '/model-management',
    admin.token,
    {
      name: 'Integration LoRA',
      category: 'loras',
      files: [{ path: 'new.safetensors', size: bytes.length, sha256: hash }],
    },
  );
  const first = bytes.subarray(0, model.partBytes);
  const second = bytes.subarray(model.partBytes);
  const partPath = `/model-management/${model.id}/parts/0/0`;
  await request(partPath, ordinary.token, first, 'PUT', 403);
  await request(partPath, admin.token, first, 'PUT');
  await request(partPath, admin.token, first, 'PUT');
  const altered = Buffer.from(first);
  altered[0] = (altered[0] ?? 0) ^ 1;
  await request(partPath, admin.token, altered, 'PUT', 409);
  const resume = await request<{ parts: unknown[] }>(
    `/model-management/${model.id}`,
    admin.token,
  );
  assert.equal(resume.parts.length, 1);
  await request(
    `/model-management/${model.id}/complete`,
    admin.token,
    {},
    'POST',
    409,
  );
  await request(
    `/model-management/${model.id}/parts/0/1`,
    admin.token,
    second,
    'PUT',
  );
  await request(`/model-management/${model.id}/complete`, admin.token, {});
  await new ManagedModelWorker().runOnce();
  const readyModel = await request<{
    files: Array<{ actualSha256: string }>;
    status: string;
  }>(`/model-management/${model.id}`, admin.token);
  assert.equal(readyModel.status, 'ready');
  assert.equal(readyModel.files[0]?.actualSha256, hash);
  assert.equal(
    createHash('sha256')
      .update(
        await readFile(
          join(root, 'loras', 'platform', model.id, 'new.safetensors'),
        ),
      )
      .digest('hex'),
    hash,
  );
  const overview = await request<{ choices: Array<{ files: string[] }> }>(
    '/model-management',
    admin.token,
  );
  assert.ok(
    overview.choices.some((c) =>
      c.files.includes(`platform/${model.id}/new.safetensors`),
    ),
  );
  await request(partPath, admin.token, first, 'PUT', 409);
  const bad = await request<{ id: string }>('/model-management', admin.token, {
    name: 'Bad hash',
    category: 'loras',
    files: [
      {
        path: 'bad.safetensors',
        size: tensor().length,
        sha256: '0'.repeat(64),
      },
    ],
  });
  await request(
    `/model-management/${bad.id}/parts/0/0`,
    admin.token,
    tensor(),
    'PUT',
  );
  await request(`/model-management/${bad.id}/complete`, admin.token, {});
  await new ManagedModelWorker().runOnce();
  const badStatus = await request<{ status: string }>(
    `/model-management/${bad.id}`,
    admin.token,
  );
  assert.equal(badStatus.status, 'failed');
  await request(`/model-management/${bad.id}/cancel`, admin.token, {});
  // A directory snapshot is published atomically, with shard-index completeness.
  async function directoryModel(missingShard: boolean) {
    const shard = tensor();
    const index = Buffer.from(
      JSON.stringify({
        weight_map: {
          weight: missingShard
            ? 'missing.safetensors'
            : 'part-00001.safetensors',
        },
      }),
    );
    const bundle = await request<{ id: string }>(
      '/model-management',
      admin.token,
      {
        name: missingShard ? 'Incomplete bundle' : 'Complete directory bundle',
        category: 'text_encoders',
        files: [
          { path: 'bundle/model.safetensors.index.json', size: index.length },
          { path: 'bundle/part-00001.safetensors', size: shard.length },
        ],
      },
    );
    await request(
      `/model-management/${bundle.id}/parts/0/0`,
      admin.token,
      index,
      'PUT',
    );
    await request(
      `/model-management/${bundle.id}/parts/1/0`,
      admin.token,
      shard,
      'PUT',
    );
    await request(`/model-management/${bundle.id}/complete`, admin.token, {});
    await new ManagedModelWorker().runOnce();
    const state = await request<{ error: string; status: string }>(
      `/model-management/${bundle.id}`,
      admin.token,
    );
    assert.equal(state.status, missingShard ? 'failed' : 'ready');
    if (missingShard) {
      assert.match(state.error, /分片索引/);
      await request(`/model-management/${bundle.id}/cancel`, admin.token, {});
    } else
      assert.deepEqual(
        await readFile(
          join(
            root,
            'text_encoders',
            'platform',
            bundle.id,
            'bundle/part-00001.safetensors',
          ),
        ),
        shard,
      );
  }
  await directoryModel(false);
  await directoryModel(true);
  const created = await request<{ id: string; version: { id: string } }>(
    '/workflow-management',
    admin.token,
    {
      code: `model-test-${marker}`,
      name: 'Model acceptance',
      publish: true,
      version: {
        apiJson: {
          '1': {
            class_type: 'LoraLoader',
            inputs: { lora_name: 'old.safetensors' },
          },
          '2': {
            class_type: 'SaveImage',
            inputs: { filename_prefix: 'model-validation' },
          },
        },
        parameterSchema: [
          {
            key: 'lora',
            label: '模型',
            type: 'select',
            nodeId: '1',
            inputName: 'lora_name',
            defaultValue: 'old.safetensors',
            options: [{ label: 'Old', value: 'old.safetensors' }],
          },
        ],
        outputSchema: [{ nodeId: '2', field: 'images', kind: 'image' }],
        modelRequirements: ['old.safetensors'],
      },
    },
  );
  await request(
    '/capabilities/text-to-image/workflow',
    admin.token,
    { workflowVersionId: created.version.id },
    'PUT',
  );
  const update = await request<{ id: string }>(
    `/model-management/${model.id}/updates`,
    admin.token,
    {
      capabilityCode: 'text-to-image',
      baseVersionId: created.version.id,
      replacements: [
        {
          nodeId: '1',
          inputName: 'lora_name',
          oldValue: 'old.safetensors',
          filePath: 'new.safetensors',
        },
      ],
    },
  );
  const candidate = await request<{ appKey: string; versionId: string }>(
    `/model-management/updates/${update.id}`,
    admin.token,
  );
  await request(
    `/model-management/updates/${update.id}/publish`,
    admin.token,
    {},
    'POST',
    409,
  );
  await request(
    '/capabilities/text-to-image/workflow',
    admin.token,
    { workflowVersionId: candidate.versionId },
    'PUT',
    409,
  );
  const project = await request<{ id: string }>('/projects', admin.token, {
    name: `Model test ${marker}`,
  });
  const instance = await request<{ id: string }>(
    '/workflow-instances',
    admin.token,
    { projectId: project.id, appKey: candidate.appKey },
  );
  let test = await request<{ id: string }>('/jobs', admin.token, {
    appKey: candidate.appKey,
    projectId: project.id,
    workspaceInstanceId: instance.id,
    modelUpdateId: update.id,
    name: 'Validate new model',
    inputAssetIds: [],
    parameters: { lora: 'old.safetensors' },
  });
  executionFailure = true;
  const failedWorker = new ComfyUiWorker({ jobIds: [test.id] });
  for (let i = 0; i < 4; i++) await failedWorker.runOnce();
  const failedRows = await sql<
    { status: string }[]
  >`SELECT status FROM jobs WHERE id=${test.id}`;
  assert.equal(failedRows[0]?.status, 'failed');
  await request(
    `/model-management/updates/${update.id}/publish`,
    admin.token,
    {},
    'POST',
    409,
  );
  executionFailure = false;
  test = await request<{ id: string }>('/jobs', admin.token, {
    appKey: candidate.appKey,
    projectId: project.id,
    workspaceInstanceId: instance.id,
    modelUpdateId: update.id,
    name: 'Retry compatible model',
    inputAssetIds: [],
    parameters: { lora: 'old.safetensors' },
  });
  const worker = new ComfyUiWorker({ jobIds: [test.id] });
  for (let i = 0; i < 6; i++) {
    await worker.runOnce();
    const [j] = await sql<
      { status: string }[]
    >`SELECT status FROM jobs WHERE id=${test.id}`;
    if (j?.status === 'succeeded') break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(
    (submitted?.['1'] as { inputs?: { lora_name: string } })?.inputs?.lora_name,
    `platform/${model.id}/new.safetensors`,
  );
  const [finished] = await sql<
    { status: string }[]
  >`SELECT status FROM jobs WHERE id=${test.id}`;
  assert.equal(finished?.status, 'succeeded');
  await request(
    `/model-management/updates/${update.id}/publish`,
    admin.token,
    {},
  );
  await request(
    `/model-management/updates/${update.id}/publish`,
    admin.token,
    {},
  );
  const [binding] = await sql<
    { id: string }[]
  >`SELECT workflow_version_id AS id FROM capability_workflows WHERE capability_code='text-to-image' AND active=true`;
  assert.equal(binding?.id, candidate.versionId);
  const [old] = await sql<
    { api: Record<string, { inputs: { lora_name: string } }> }[]
  >`SELECT api_json AS api FROM workflow_versions WHERE id=${created.version.id}`;
  assert.equal(old?.api['1']?.inputs.lora_name, 'old.safetensors');
  const outputRows = await sql<
    { objectKey: string }[]
  >`SELECT av.object_key AS "objectKey" FROM job_outputs jo JOIN asset_versions av ON av.asset_id=jo.asset_id WHERE jo.job_id=${test.id}`;
  objects.push(...outputRows.map((r) => r.objectKey));
  const audit =
    await sql`SELECT id FROM audit_events WHERE action IN ('model.upload.create','model.upload.complete','model.workflow.prepare','model.workflow.publish') AND actor_id=${admin.id}`;
  assert.ok(audit.length >= 4);
  executionFailure = true;
  console.warn(
    `PASS model management: ${checks} HTTP checks; real PostgreSQL/filesystem/multipart/hash/revision/Worker/output storage; ComfyUI protocol fixture (not GPU inference).`,
  );
} catch (error) {
  if (apiErrors) console.error(apiErrors.slice(-4000));
  throw error;
} finally {
  if (api.exitCode === null) {
    api.kill('SIGTERM');
    await once(api, 'exit').catch(() => {});
  }
  await new Promise<void>((r) => comfy.close(() => r()));
  for (const key of objects) await deleteObject(key);
  await closeDatabase();
  await rm(root, { recursive: true, force: true });
}
