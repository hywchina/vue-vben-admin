import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { WORKFLOW_CATALOG } from '../utils/domain/workflows/catalog';
import { workflowParameterSchema } from '../utils/domain/workflows/schema';
import { hashPassword } from '../utils/identity/password';
import { closeDatabase, useDatabase } from '../utils/infrastructure/database';
import { deleteObject } from '../utils/infrastructure/storage';

interface Job {
  error?: { message: string };
  id: string;
  outputs: Array<{ assetId: string; kind: string }>;
  status: string;
}

interface Result {
  downloads: number;
  jobId: string;
  name: string;
  seconds: number;
  status: 'passed';
}

function option(name: string, fallback = '') {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const apiUrl = option('--url', 'http://127.0.0.1:5320/api/v1');
const comfyUrl = option('--comfyui-url', 'http://127.0.0.1:18188');
const output = resolve(
  option('--output', '.rail-platform-runtime/deployment-smoke'),
);
const suite = option('--suite', 'all');
const from = option('--from');
const imagePath = option('--image');
const runId = randomUUID();
const userId = randomUUID();
const sql = useDatabase();
let projectId = '';
let token = '';
const results: Result[] = [];

async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Request-ID': `deployment-${runId}-${randomUUID()}`,
    },
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    signal: AbortSignal.timeout(120_000),
  });
  const envelope = (await response.json()) as {
    code: number | string;
    data: T;
    message: string;
  };
  assert.ok(
    response.ok && envelope.code === 0,
    `${path}: ${response.status} ${envelope.message}`,
  );
  return envelope.data;
}

async function comfy(path: string, body?: unknown) {
  const response = await fetch(`${comfyUrl}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    method: body === undefined ? 'GET' : 'POST',
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.ok, `ComfyUI ${path}: HTTP ${response.status}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as Record<string, unknown[]>;
}

async function releaseGpu() {
  const queue = await comfy('/queue');
  assert.ok(
    queue.queue_running?.length === 0 && queue.queue_pending?.length === 0,
    'ComfyUI queue is busy; refusing concurrent GPU tests',
  );
  await comfy('/free', { free_memory: true, unload_models: true });
}

async function waitForJob(jobId: string, timeout = 600_000): Promise<Job> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const jobs = await api<Job[]>(`/jobs?projectId=${projectId}`);
    const job = jobs.find((item) => item.id === jobId);
    assert.ok(job, `Job disappeared: ${jobId}`);
    if (['cancelled', 'failed', 'succeeded'].includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  await api(`/jobs/${jobId}/cancel`, {});
  throw new Error(`Job timed out and cancellation requested: ${jobId}`);
}

async function verifyOutput(name: string, jobId: string, started: number) {
  const job = await waitForJob(jobId);
  assert.equal(job.status, 'succeeded', job.error?.message ?? name);
  assert.ok(job.outputs.length > 0, `${name}: no outputs`);
  for (const [index, asset] of job.outputs.entries()) {
    const download = await api<{
      content?: string;
      mode: string;
      url?: string;
    }>(`/assets/${asset.assetId}/download`);
    let bytes: Uint8Array;
    if (download.mode === 'inline')
      bytes = new TextEncoder().encode(download.content);
    else {
      assert.ok(download.url);
      const response = await fetch(download.url, {
        signal: AbortSignal.timeout(60_000),
      });
      assert.ok(
        response.ok,
        `${name}: output download HTTP ${response.status}`,
      );
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    assert.ok(bytes.byteLength > 0, `${name}: empty artifact`);
    await writeFile(join(output, `${name}-${index}.bin`), bytes);
  }
  results.push({
    downloads: job.outputs.length,
    jobId,
    name,
    seconds: (Date.now() - started) / 1000,
    status: 'passed',
  });
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(results, null, 2),
  );
  console.warn(`PASS ${name}: ${job.outputs.length} outputs`);
}

async function main() {
  assert.ok(imagePath, 'Provide --image with a small PNG fixture');
  assert.ok(['all', 'reports', 'workflows'].includes(suite), 'Unknown --suite');
  await mkdir(output, { recursive: true });
  await api('/health/ready');
  const username = `deploy_${runId.replaceAll('-', '').slice(0, 16)}`;
  const password = randomUUID();
  await sql`
    INSERT INTO users (id, username, password_hash, real_name, email)
    VALUES (${userId}, ${username}, ${await hashPassword(password)},
      '部署验收账号', ${`${username}@rail.local`})
  `;
  await sql`INSERT INTO user_roles (user_id, role_id)
    SELECT ${userId}, id FROM roles WHERE code = 'admin'`;
  await sql`INSERT INTO user_preferences (user_id) VALUES (${userId})`;
  const login = await api<{ accessToken: string }>('/auth/login', {
    password,
    username,
  });
  token = login.accessToken;
  const project = await api<{ id: string }>('/projects', {
    name: `部署验收 ${runId}`,
  });
  projectId = project.id;
  const conversation = await api<{ id: string }>('/design-conversations', {
    projectId,
  });
  const image = new Uint8Array(await readFile(imagePath));
  async function uploadFixture(index: number) {
    const upload = await api<{
      asset: { id: string };
      upload: { headers: Record<string, string>; url: string };
    }>('/assets/uploads', {
      filename: `deployment-input-${index}.png`,
      kind: 'image',
      mimeType: 'image/png',
      name: '部署验收图片',
      projectId,
      sizeBytes: image.length,
    });
    const put = await fetch(upload.upload.url, {
      body: image,
      headers: upload.upload.headers,
      method: 'PUT',
      signal: AbortSignal.timeout(60_000),
    });
    assert.ok(put.ok, 'Fixture upload failed');
    await api(`/assets/${upload.asset.id}/complete`, {});
    return upload.asset.id;
  }
  const inputAssets: string[] = [await uploadFixture(0)];

  if (suite !== 'reports') {
    const start = from
      ? WORKFLOW_CATALOG.findIndex((entry) => entry.application.key === from)
      : 0;
    assert.ok(start >= 0, `Unknown --from: ${from}`);
    for (const entry of WORKFLOW_CATALOG.slice(start)) {
      console.warn(`START ${entry.application.key}`);
      await releaseGpu();
      const started = Date.now();
      const schema = workflowParameterSchema
        .array()
        .parse(entry.version.parameterSchema);
      const parameters: Record<string, unknown> = {};
      const inputs: string[] = [];
      for (const field of schema) {
        if (field.assetIndex !== undefined) {
          while (inputAssets.length <= field.assetIndex)
            inputAssets.push(await uploadFixture(inputAssets.length));
          const inputAsset = inputAssets[field.assetIndex];
          assert.ok(inputAsset, 'Missing uploaded fixture');
          inputs[field.assetIndex] = inputAsset;
          if (field.type === 'region')
            parameters[field.key] =
              'brush:box:4:1:255,0,0:32,32;128,32;128,128;32,128;32,32';
          continue;
        }
        let value = field.defaultValue;
        const input = field.inputName;
        if (typeof value === 'number') {
          let numeric = value;
          if (['height', 'scale_to_length', 'width'].includes(input ?? ''))
            numeric = 512;
          if (input === 'steps') numeric = Math.min(numeric, 4);
          if (input === 'max_length') numeric = 32;
          if (input === 'octree_resolution') numeric = 128;
          if (input === 'upscale_factor') numeric = 2;
          if (input === 'megapixels') numeric = Math.min(numeric, 0.262144);
          if (['bottom', 'left', 'right', 'top'].includes(input ?? ''))
            numeric = Math.min(numeric, 64);
          if (input === 'value' && numeric >= 512) numeric = 512;
          value = Math.max(
            field.min ?? -Infinity,
            Math.min(field.max ?? Infinity, numeric),
          );
        }
        if (input === 'unload_model_after') value = true;
        if (input === 'thinking') value = false;
        if (input === 'scale_to_side') value = 'longest';
        if (value !== undefined) parameters[field.key] = value;
      }
      const body = {
        appKey: entry.application.key,
        designConversationId: conversation.id,
        inputAssetIds: inputs,
        name: `部署验收 ${entry.application.key}`,
        parameters,
        projectId,
      };
      await writeFile(
        join(output, `${entry.application.key}.request.json`),
        JSON.stringify(body, null, 2),
      );
      const job = await api<{ id: string }>('/jobs', body);
      await verifyOutput(entry.application.key, job.id, started);
      await releaseGpu();
    }
  }
  if (suite !== 'workflows') {
    for (const format of ['docx', 'pptx', 'md']) {
      const started = Date.now();
      const job = await api<{ id: string }>('/reports/generations', {
        format,
        generationMode: 'template',
        name: `部署验收 ${format}`,
        projectId,
        reportType: 'design-proposal',
        title: '轨道客室部署验证',
        sections: [
          {
            title: '设计方案',
            body: '验证平台报告任务、对象存储和结果下载。',
            images: [{ assetId: inputAssets[0], caption: '测试输入' }],
          },
        ],
      });
      await verifyOutput(`report-${format}`, job.id, started);
    }
  }
}

try {
  await main();
} finally {
  const active = projectId
    ? await sql`
    SELECT id FROM jobs WHERE project_id = ${projectId}
      AND status IN ('queued', 'running', 'cancelling')
  `
    : [];
  if (active.length > 0) {
    console.warn(
      'Active test jobs remain; retaining this run for inspection:',
      projectId,
    );
  } else {
    if (projectId) {
      const objects = await sql<{ objectKey: string }[]>`
        SELECT av.object_key AS "objectKey" FROM asset_versions av
        JOIN assets a ON a.id = av.asset_id
        WHERE a.project_id = ${projectId} AND av.object_key IS NOT NULL
      `;
      for (const object of objects) await deleteObject(object.objectKey);
      await sql`DELETE FROM projects WHERE id = ${projectId}`;
    }
    await sql`DELETE FROM audit_events WHERE actor_id = ${userId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
  }
  await closeDatabase();
}
