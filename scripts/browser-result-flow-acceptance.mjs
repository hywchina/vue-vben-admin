import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Targeted result-flow scenario: real isolated database, object storage and browser,
// CPU image fixtures and queued jobs; no inference Worker or GPU-quality claim.
const repo = fileURLToPath(new URL('..', import.meta.url));
const apiDir = join(repo, 'apps/platform-api');
const require = createRequire(join(apiDir, 'package.json'));
const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');
const postgres = require('postgres');
const { chromium } = createRequire(join(repo, 'package.json'))('playwright');
const work =
  process.env.RAIL_BROWSER_OUTPUT ||
  join(repo, '.rail-platform-runtime/result-flows');
await mkdir(work, { recursive: true });
for (const port of [5320, 5666]) {
  const check = createServer();
  await new Promise((resolve, reject) => {
    check.once('error', reject);
    check.listen(port, '127.0.0.1', () => check.close(resolve));
  });
}
const id = randomUUID().replaceAll('-', '');
const dbName = `rail_test_${id}`;
const bucket = `rail-flow-${id}`;
const password = randomUUID();
const admin = postgres(process.env.DATABASE_URL, {
  max: 1,
  onnotice: () => {},
});
const url = new URL(process.env.DATABASE_URL);
url.pathname = `/${dbName}`;
url.username = dbName;
url.password = randomUUID();
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  S3_BUCKET: bucket,
  NODE_ENV: 'development',
  VITE_GLOB_API_URL: '/api/v1',
  NITRO_PORT: '5320',
  PORT: '5320',
  HOST: '127.0.0.1',
  NITRO_HOST: '127.0.0.1',
  BOOTSTRAP_ADMIN_PASSWORD: password,
  BOOTSTRAP_DEMO_USERS: 'false',
  JWT_SECRET: randomUUID() + randomUUID(),
  COMFYUI_API_URL: 'http://127.0.0.1:28188',
  COMFYUI_POLL_INTERVAL_MS: '250',
  COMFYUI_API_TIMEOUT_MS: '30000',
  APP_PUBLIC_URL: 'http://127.0.0.1:5666',
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5666',
  TZ: 'Asia/Shanghai',
};
const children = [];
let browser;
let created = false;
let db;
let role = false;
let token = '';
function launch(args, cwd, name) {
  const fd = openSync(join(work, `${name}.log`), 'a', 0o600);
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: ['ignore', fd, fd],
  });
  closeSync(fd);
  children.push(child);
  return child;
}
async function run(script) {
  const p = launch(['--import', 'tsx', `scripts/${script}`], apiDir, script);
  await new Promise((resolve, reject) => {
    p.once('error', reject);
    p.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)),
    );
  });
}
async function api(path, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(`http://127.0.0.1:5320/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const v = await r.json();
  assert.equal(r.status, 200, `${path}: ${v.code} ${v.message}`);
  return v.data;
}
async function ready(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Not ready ${url}`);
}
let failure;
const errors = [];
const consoleErrors = [];
try {
  await admin.unsafe(
    `CREATE ROLE "${dbName}" LOGIN PASSWORD '${url.password}'`,
  );
  role = true;
  await admin.unsafe(`CREATE DATABASE "${dbName}" OWNER "${dbName}"`);
  created = true;
  await run('migrate.ts');
  await run('seed.ts');
  launch(['.output/server/index.mjs'], apiDir, 'api');
  await ready('http://127.0.0.1:5320/api/v1/health/ready');
  launch(
    [
      join(repo, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      '5666',
      '--strictPort',
    ],
    join(repo, 'apps/web-antd'),
    'web',
  );
  await ready('http://127.0.0.1:5666');

  db = postgres(url.toString(), { max: 1, onnotice: () => {} });
  browser = await chromium.launch({
    headless: true,
    ...(process.env.RAIL_BROWSER_EXECUTABLE
      ? { executablePath: process.env.RAIL_BROWSER_EXECUTABLE }
      : {}),
    args: ['--disable-gpu'],
  });
  const context = await browser.newContext({
    viewport: { width: 1560, height: 1000 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  await page.goto('http://127.0.0.1:5666/auth/login');
  await page.getByText(/欢迎回来/).waitFor();
  const login = page.waitForResponse(
    (r) =>
      r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST',
  );
  const inputs = page.locator('form input:visible');
  await inputs.nth(0).fill('admin');
  await inputs.nth(1).fill(password);
  await page.locator('button').filter({ hasText: '登录' }).last().click();
  const loginResponse = await login;
  const loginEnvelope = await loginResponse.json();
  token = loginEnvelope.data.accessToken;
  await page.getByRole('heading', { name: /让客室内装设计/ }).waitFor();
  const project = await api('/projects', { name: '结果流转隔离回归' });
  const [{ id: userId }] =
    await db`SELECT id FROM users WHERE username='admin'`;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const configuredPrompts = {
    'single-image-edit': 'ADMIN SINGLE DEFAULT',
    'inpaint-single': 'ADMIN MASK DEFAULT',
    'image-understanding': 'ADMIN UNDERSTANDING DEFAULT',
  };
  for (const [appKey, prompt] of Object.entries(configuredPrompts)) {
    const capability = await api(`/capabilities/${appKey}`);
    await db`UPDATE workflow_definitions SET default_prompt=${prompt} WHERE code=${capability.workflow.code}`;
  }
  const results = [];
  const fakeLora = {
    enabled: true,
    selections: [
      {
        targetId: 'branch-0',
        name: 'stale-fixture.safetensors',
        sha256: 'a'.repeat(64),
        baseFingerprint: 'b'.repeat(64),
        strength: 0.7,
      },
    ],
  };
  async function fixture(mode, title) {
    const conversation = await api('/design-conversations', {
      projectId: project.id,
      title,
    });
    const job = randomUUID();
    const assets = [];
    const parameters = {
      prompt: 'SOURCE SNAPSHOT',
      width: 512,
      height: 512,
      seed: 42,
    };
    await db`INSERT INTO jobs (id,project_id,app_key,name,parameters,created_by,status,progress,stage,design_conversation_id,design_mode)
    VALUES (${job},${project.id},'text-to-image','明确的CPU图片夹具',${db.json(parameters)},${userId},'succeeded',100,'CPU夹具，无GPU执行',${conversation.id},${mode})`;
    for (let position = 0; position < 5; position++) {
      const asset = randomUUID();
      assets.push(asset);
      const key = `${project.id}/${asset}/fixture.png`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: png,
          ContentType: 'image/png',
        }),
      );
      await db`INSERT INTO assets (id,project_id,name,kind,source,source_app_key,source_job_id,owner_id,status,saved_at)
    VALUES (${asset},${project.id},${`fixture-${position}`},'image','workflow','text-to-image',${job},${userId},'available',NULL)`;
      await db`INSERT INTO asset_versions (id,asset_id,version,storage_kind,object_key,original_filename,mime_type,size_bytes,status,created_by,completed_at)
    VALUES (${randomUUID()},${asset},1,'object',${key},'fixture.png','image/png',${png.length},'available',${userId},now())`;
      await db`INSERT INTO job_outputs (job_id,asset_id,position) VALUES (${job},${asset},${position})`;
    }
    return { conversation, job, assets, mode, parameters };
  }
  async function draft(f, target) {
    return api(
      `/design-conversations/${f.conversation.id}/drafts/${target}?projectId=${project.id}&designMode=${f.mode}`,
    );
  }
  async function seedDraft(f, target) {
    const grouped = ['local-image-edit', 'reference-image-edit'].includes(
      target,
    );
    const cap = grouped ? null : await api(`/capabilities/${target}`);
    const parameters = { optionalLora: fakeLora };
    if (grouped || cap.fields.some((x) => x.key === 'prompt'))
      parameters.prompt = 'STALE PROMPT';
    if (grouped || cap.fields.some((x) => x.key === 'generationCount'))
      parameters.generationCount = 8;
    if (target === 'local-image-edit') parameters.localEdit = { mode: 'mask' };
    const inputAssetIds =
      target === 'multiview-to-3d'
        ? { 0: f.assets[1], 1: f.assets[2], 2: f.assets[0], 3: f.assets[3] }
        : { 0: f.assets[1] };
    await api(
      `/design-conversations/${f.conversation.id}/drafts/${target}`,
      {
        projectId: project.id,
        designMode: f.mode,
        inputAssetIds,
        parameterValues: parameters,
      },
      'PUT',
    );
  }
  async function open(f) {
    await page.goto(
      `http://127.0.0.1:5666/design?conversationId=${f.conversation.id}&appKey=text-to-image&designMode=${f.mode}`,
    );
    await page.locator(`[data-job-id="${f.job}"] .gallery-main`).waitFor();
  }
  async function action(f, label) {
    await page.locator(`[data-job-id="${f.job}"] .gallery-main`).click();
    await page
      .locator(`[data-testid="${f.mode}-result-actions"]:visible`)
      .getByRole('button', { name: label, exact: true })
      .click();
  }
  async function settledDraft(f, target) {
    let value;
    for (let i = 0; i < 45; i++) {
      value = await draft(f, target);
      if (
        value.inputAssetIds['0'] === f.assets[0] &&
        !value.parameterValues.optionalLora?.enabled
      )
        return value;
      await new Promise((r) => setTimeout(r, 80));
    }
    return value;
  }
  async function invariants(f) {
    const [source] =
      await db`SELECT parameters,status FROM jobs WHERE id=${f.job}`;
    assert.equal(source.status, 'succeeded');
    assert.deepEqual(source.parameters, f.parameters);
    const [published] =
      await db`SELECT count(*)::int AS count FROM assets WHERE project_id=${project.id} AND saved_at IS NOT NULL`;
    assert.equal(published.count, 0);
  }
  const scenarios = [];
  for (const mode of ['cabin', 'component', 'cmf']) {
    scenarios.push(
      { mode, action: '图片编辑', target: 'reference-image-edit' },
      { mode, action: '局部重绘', target: 'local-image-edit', editor: true },
      { mode, action: '图像理解', target: 'image-understanding' },
      {
        mode,
        action: mode === 'cabin' ? '部件/材质融合' : '多图融合',
        target: 'reference-image-edit',
        dialog: true,
      },
      { mode, action: '图像放大', target: 'image-upscale', submit: true },
    );
    if (mode !== 'cmf')
      scenarios.push(
        { mode, action: '标记修改', target: 'local-image-edit', editor: true },
        {
          mode,
          action: '多角度生成',
          target: 'camera-control-multi',
          dialog: true,
        },
        {
          mode,
          action: '多角度生成',
          target: 'camera-control-multi',
          direct: true,
        },
      );
    if (mode === 'component')
      scenarios.push(
        { mode, action: '三维生成', target: 'multiview-to-3d', dialog: true },
        { mode, action: '三维生成', target: 'multiview-to-3d', direct: true },
      );
  }
  scenarios.push({
    mode: 'cabin',
    action: '部件/材质融合',
    target: 'reference-image-edit',
    direct: true,
  });
  for (const count of [1, 2, 3])
    scenarios.push({
      mode: 'cmf',
      action: '图片编辑',
      target: 'reference-image-edit',
      count,
    });
  for (const scenario of scenarios) {
    console.log(
      'CHECK',
      scenario.mode,
      scenario.action,
      scenario.direct ? 'dialog submit' : 'transfer',
    );
    const f = await fixture(
      scenario.mode,
      `${scenario.mode} ${scenario.action}`,
    );
    await seedDraft(f, scenario.target);
    await open(f);
    let response;
    if (scenario.submit || scenario.direct || scenario.count)
      response = page.waitForResponse(
        (r) =>
          r.url().endsWith('/api/v1/jobs') && r.request().method() === 'POST',
        { timeout: 30_000 },
      );
    await action(f, scenario.action);
    if (scenario.dialog)
      await page
        .getByRole('dialog', { name: scenario.action, exact: true })
        .getByRole('button', { name: /转入下方编辑框/ })
        .click();
    if (scenario.count) {
      await settledDraft(f, scenario.target);
      await page
        .getByTestId('active-design-application')
        .filter({ hasText: '参考图编辑' })
        .waitFor();
      if (scenario.count > 1) {
        await page.getByRole('button', { name: /^添加图片2：/ }).click();
        const chooser = page.waitForEvent('filechooser');
        await page
          .locator('.composer-media-source-menu:visible')
          .getByRole('button', { name: /本地上传/ })
          .click();
        const fileChooser = await chooser;
        await fileChooser.setFiles(
          Array.from({ length: scenario.count - 1 }, (_, i) => ({
            name: `reference-${i}.png`,
            mimeType: 'image/png',
            buffer: png,
          })),
        );
        await page
          .locator('.composer-input-asset')
          .nth(scenario.count - 1)
          .waitFor();
      }
      await page
        .getByTestId('design-prompt-input')
        .fill('保留空间构图，调整座椅材质与配色。');
      await page.locator('.composer-submit').click();
    }
    if (scenario.direct) {
      const dialog = page.getByRole('dialog', {
        name: scenario.action,
        exact: true,
      });
      await dialog.getByRole('button', { name: /在弹窗中完成/ }).click();
      if (scenario.target === 'camera-control-multi')
        await dialog.locator('#multi-angle-generation-count').waitFor();
      else {
        const count = scenario.target === 'multiview-to-3d' ? 3 : 2;
        await dialog.locator('input[type=file]').setInputFiles(
          Array.from({ length: count }, (_, i) => ({
            name: `reference-${i}.png`,
            mimeType: 'image/png',
            buffer: png,
          })),
        );
        if (scenario.target === 'reference-image-edit')
          await dialog
            .locator('textarea')
            .fill('保留图1构图，参考图2配色和图3材质。');
      }
      await dialog
        .getByRole('button', {
          name:
            scenario.target === 'reference-image-edit'
              ? '开始融合'
              : '开始生成',
          exact: true,
        })
        .click();
    }
    if (scenario.submit)
      await page
        .getByRole('dialog', { name: scenario.action, exact: true })
        .getByRole('button', { name: '开始放大', exact: true })
        .click();
    if (scenario.editor) {
      const dialog = page.getByRole('dialog', {
        name: '局部编辑',
        exact: true,
      });
      await dialog.waitFor();
      await dialog.locator('.ant-modal-close').click();
    }
    if (response) {
      const r = await response;
      const v = await r.json();
      assert.equal(v.code, 0, JSON.stringify(v));
      const body = r.request().postDataJSON();
      assert.equal(body.designMode, scenario.mode);
      assert.equal(body.designConversationId, f.conversation.id);
      assert.equal(body.projectId, project.id);
      assert.equal(body.inputAssetIds[0], f.assets[0]);
      assert.equal(
        v.data.appKey,
        scenario.target === 'reference-image-edit'
          ? ['single-image-edit', 'image-edit-kv', 'multi-image-edit'][
              (scenario.count ?? 3) - 1
            ]
          : scenario.target,
      );
      assert.equal(body.parameters.optionalLora?.enabled, false);
      const counts = { 'multiview-to-3d': 4, 'reference-image-edit': 3 };
      assert.equal(
        body.inputAssetIds.length,
        scenario.count ?? counts[scenario.target] ?? 1,
      );
    } else {
      const value = await settledDraft(f, scenario.target);
      assert.deepEqual(
        value.inputAssetIds,
        { 0: f.assets[0] },
        JSON.stringify(scenario),
      );
      assert.equal(value.parameterValues.optionalLora?.enabled, false);
      assert.notEqual(value.parameterValues.prompt, 'STALE PROMPT');
      let expectedPrompt = configuredPrompts[scenario.target];
      if (scenario.target === 'reference-image-edit')
        expectedPrompt = configuredPrompts['single-image-edit'];
      if (scenario.action === '局部重绘')
        expectedPrompt = configuredPrompts['inpaint-single'];
      if (expectedPrompt)
        assert.equal(value.parameterValues.prompt, expectedPrompt);
      assert.equal(
        new URL(page.url()).searchParams.get('designMode'),
        scenario.mode,
      );
      await page.reload();
      await page.getByTestId('active-design-application').waitFor();
      await page.locator('.composer-input-asset').first().waitFor();
      assert.equal(await page.locator('.composer-input-asset').count(), 1);
      assert.equal(
        new URL(page.url()).searchParams.get('appKey'),
        scenario.target,
      );
      assert.equal(
        new URL(page.url()).searchParams.get('designMode'),
        scenario.mode,
      );
      const restored = await draft(f, scenario.target);
      assert.deepEqual(restored.inputAssetIds, {
        0: f.assets[0],
      });
      assert.equal(
        restored.parameterValues.prompt,
        value.parameterValues.prompt,
      );
    }
    await invariants(f);
    results.push({ ...scenario, passed: true, reload: !response });
  }
  // Delayed reads must not navigate back to the previous conversation or replace a newer function choice.
  for (const delay of ['input', 'capability', 'function', 'input-return']) {
    console.log('RACE', delay);
    const f = await fixture('cabin', `delayed ${delay}`);
    const other = await api('/design-conversations', {
      projectId: project.id,
      title: `TARGET ${delay}`,
    });
    await open(f);
    let gateTimedOut = false;
    let entered, release;
    const gate = new Promise((r) => {
      release = r;
      setTimeout(() => {
        gateTimedOut = true;
        r();
      }, 15_000).unref();
    });
    const started = new Promise((r) => {
      entered = r;
    });
    let delayed = false;
    const pattern = delay.startsWith('input')
      ? (url) => url.pathname.endsWith(`/input-assets/${f.assets[0]}`)
      : (url) => url.pathname.endsWith('/capabilities/image-understanding');
    await page.route(pattern, async (route) => {
      if (!delayed) {
        delayed = true;
        entered();
        await gate;
      }
      await route.continue();
    });
    await action(f, '图像理解');
    await Promise.race([
      started,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`Delay route not reached: ${delay}`)),
          5000,
        ),
      ),
    ]);
    if (delay === 'function') {
      await page.getByTestId('active-design-application').click();
      await page.locator('[data-app-key="reference-image-edit"]').click();
      await page.waitForURL(
        (url) => url.searchParams.get('appKey') === 'reference-image-edit',
      );
    } else {
      await page.locator(`[data-conversation-id="${other.id}"]`).click();
      await page.waitForURL(
        (url) => url.searchParams.get('conversationId') === other.id,
      );
      if (delay === 'input-return') {
        await page
          .locator(`[data-conversation-id="${f.conversation.id}"]`)
          .click();
        await page.waitForURL(
          (url) => url.searchParams.get('conversationId') === f.conversation.id,
        );
      }
    }
    assert.equal(
      gateTimedOut,
      false,
      'The delayed response must remain blocked until the switch',
    );
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await page.waitForLoadState('networkidle');
    let expectedLocation = other.id;
    if (delay === 'function') expectedLocation = 'reference-image-edit';
    if (delay === 'input-return') expectedLocation = f.conversation.id;
    assert.equal(
      new URL(page.url()).searchParams.get(
        delay === 'function' ? 'appKey' : 'conversationId',
      ),
      expectedLocation,
    );
    if (delay === 'input-return')
      assert.equal(
        new URL(page.url()).searchParams.get('appKey'),
        'text-to-image',
      );
    assert.equal(await page.locator('.composer-input-asset').count(), 0);
    await invariants(f);
    results.push({ race: delay, passed: true });
  }
  // An older conversation switch must not win after its draft save finishes late.
  {
    const f = await fixture('cabin', 'rapid conversation switches');
    const next = await api('/design-conversations', {
      projectId: project.id,
      title: 'NEXT rapid switch',
    });
    const last = await api('/design-conversations', {
      projectId: project.id,
      title: 'LAST rapid switch',
    });
    await open(f);
    const savedBeforeSwitch = page.waitForResponse(
      (r) =>
        r
          .url()
          .includes(
            `/design-conversations/${f.conversation.id}/drafts/text-to-image`,
          ) && r.request().method() === 'PUT',
    );
    await page
      .getByTestId('design-prompt-input')
      .fill('READY BEFORE RAPID SWITCH');
    await savedBeforeSwitch;
    await page.waitForLoadState('networkidle');
    let entered, release;
    let timedOut = false;
    const gate = new Promise((r) => {
      release = r;
      setTimeout(() => {
        timedOut = true;
        r();
      }, 15_000).unref();
    });
    const started = new Promise((r) => {
      entered = r;
    });
    let held = false;
    await page.route(
      (url) =>
        url.pathname.endsWith(
          `/design-conversations/${f.conversation.id}/drafts/text-to-image`,
        ),
      async (route) => {
        if (!held && route.request().method() === 'PUT') {
          held = true;
          entered();
          await gate;
        }
        await route.continue();
      },
    );
    await page.locator(`[data-conversation-id="${next.id}"]`).click();
    await started;
    await page.locator(`[data-conversation-id="${last.id}"]`).click();
    await page.waitForURL(
      (url) => url.searchParams.get('conversationId') === last.id,
    );
    assert.equal(timedOut, false);
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await page.waitForLoadState('networkidle');
    assert.equal(
      new URL(page.url()).searchParams.get('conversationId'),
      last.id,
    );
    results.push({
      race: 'rapid conversation switches with late draft save',
      passed: true,
    });
  }
  // Upload completion after leaving a dialog may finish storing the old private file, but must not submit anywhere.
  for (const target of [
    'multiview-to-3d',
    'camera-control-multi',
    'reference-image-edit',
  ]) {
    console.log('UPLOAD RACE', target);
    const f = await fixture(
      target === 'multiview-to-3d' ? 'component' : 'cabin',
      `upload race ${target}`,
    );
    const other = await api('/design-conversations', {
      projectId: project.id,
      title: `TARGET upload ${target}`,
    });
    await open(f);
    const labels = {
      'multiview-to-3d': '三维生成',
      'camera-control-multi': '多角度生成',
      'reference-image-edit': '部件/材质融合',
    };
    const label = labels[target];
    await action(f, label);
    const dialog = page.getByRole('dialog', { name: label, exact: true });
    await dialog.getByRole('button', { name: /在弹窗中完成/ }).click();
    await dialog.locator('input[type=file]').setInputFiles(
      Array.from(
        {
          length:
            { 'multiview-to-3d': 3, 'camera-control-multi': 1 }[target] ?? 2,
        },
        (_, i) => ({
          name: `race-${i}.png`,
          mimeType: 'image/png',
          buffer: png,
        }),
      ),
    );
    if (target === 'reference-image-edit')
      await dialog.locator('textarea').fill('上传竞态测试');
    let gateTimedOut = false;
    let entered, release;
    const gate = new Promise((r) => {
      release = r;
      setTimeout(() => {
        gateTimedOut = true;
        r();
      }, 15_000).unref();
    });
    const started = new Promise((r) => {
      entered = r;
    });
    let delayed = false;
    const pattern = '**/assets/*/complete';
    await page.route(pattern, async (route) => {
      if (!delayed) {
        delayed = true;
        entered();
        await gate;
      }
      await route.continue();
    });
    await dialog
      .getByRole('button', {
        name: target === 'reference-image-edit' ? '开始融合' : '开始生成',
        exact: true,
      })
      .click();
    await started;
    await page.locator(`[data-conversation-id="${other.id}"]`).click();
    await page.waitForURL(
      (url) => url.searchParams.get('conversationId') === other.id,
    );
    assert.equal(
      gateTimedOut,
      false,
      'The delayed response must remain blocked until the switch',
    );
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await page.waitForLoadState('networkidle');
    const [jobs] =
      await db`SELECT count(*)::int AS count FROM jobs WHERE design_conversation_id IN (${f.conversation.id},${other.id})`;
    assert.equal(jobs.count, 1);
    assert.equal(await page.locator('.composer-input-asset').count(), 0);
    assert.equal(await page.getByRole('dialog').count(), 0);
    results.push({ race: `upload ${target}`, passed: true });
  }
  // A selected thumbnail, rather than the first image in a batch, is the next input.
  {
    const f = await fixture('cabin', 'selected batch result');
    await open(f);
    await page
      .locator(`[data-job-id="${f.job}"] .gallery-thumbnails button`)
      .nth(4)
      .click();
    await action(f, '图片编辑');
    const selected = { ...f, assets: [f.assets[4]] };
    const value = await settledDraft(selected, 'reference-image-edit');
    assert.deepEqual(value.inputAssetIds, { 0: f.assets[4] });
    await invariants(f);
    results.push({ batchSelection: 4, passed: true });
  }
  // Replaying history must leave the in-progress composer draft intact.
  {
    const f = await fixture('cabin', 'history replay draft isolation');
    await api(
      `/design-conversations/${f.conversation.id}/drafts/text-to-image`,
      {
        projectId: project.id,
        designMode: f.mode,
        inputAssetIds: {},
        parameterValues: { prompt: 'UNSENT DRAFT', width: 640, height: 384 },
      },
      'PUT',
    );
    await open(f);
    const submitted = page.waitForResponse(
      (r) =>
        r.url().endsWith('/api/v1/jobs') && r.request().method() === 'POST',
    );
    await action(f, '重新绘制');
    const response = await submitted;
    const envelope = await response.json();
    assert.equal(envelope.code, 0);
    assert.deepEqual(
      response.request().postDataJSON().parameters,
      f.parameters,
    );
    assert.equal(
      await page.getByTestId('design-prompt-input').inputValue(),
      'UNSENT DRAFT',
    );
    const replayDraft = await draft(f, 'text-to-image');
    assert.equal(replayDraft.parameterValues.prompt, 'UNSENT DRAFT');
    await invariants(f);
    results.push({ historyReplayPreservesDraft: true, passed: true });
  }
  // Retired Base tasks can continue through the new unified input without inheriting target LoRA.
  {
    const f = await fixture('cabin', 'retired Base continuation');
    await db`UPDATE jobs SET app_key='image-edit-base' WHERE id=${f.job}`;
    await db`UPDATE assets SET source_app_key='image-edit-base' WHERE source_job_id=${f.job}`;
    await seedDraft(f, 'reference-image-edit');
    await open(f);
    await action(f, '继续编辑');
    await page
      .getByRole('button', { name: '用单图继续编辑', exact: true })
      .click();
    const value = await settledDraft(f, 'reference-image-edit');
    assert.deepEqual(value.inputAssetIds, { 0: f.assets[0] });
    assert.equal(value.parameterValues.optionalLora.enabled, false);
    assert.equal(value.parameterValues.prompt, f.parameters.prompt);
    await invariants(f);
    results.push({ retiredBaseContinues: true, passed: true });
  }
  // Cancelling a result dialog while its input is loading must cancel the pending transfer.
  for (const cancel of ['close', 'back']) {
    const f = await fixture('component', 'cancel pending result');
    await open(f);
    await action(f, '三维生成');
    let entered, release;
    let timedOut = false;
    const gate = new Promise((r) => {
      release = r;
      setTimeout(() => {
        timedOut = true;
        r();
      }, 15_000).unref();
    });
    const started = new Promise((r) => {
      entered = r;
    });
    let held = false;
    await page.route(
      (url) => url.pathname.endsWith(`/input-assets/${f.assets[0]}`),
      async (route) => {
        if (!held) {
          held = true;
          entered();
          await gate;
        }
        await route.continue();
      },
    );
    const dialog = page.getByRole('dialog', { name: '三维生成', exact: true });
    if (cancel === 'back') {
      await dialog.getByRole('button', { name: /在弹窗中完成/ }).click();
      await dialog.locator('input[type=file]').setInputFiles(
        Array.from({ length: 3 }, (_, i) => ({
          name: `cancel-${i}.png`,
          mimeType: 'image/png',
          buffer: png,
        })),
      );
      await dialog
        .getByRole('button', { name: '开始生成', exact: true })
        .click();
    } else await dialog.getByRole('button', { name: /转入下方编辑框/ }).click();
    await started;
    await (cancel === 'back'
      ? dialog.getByRole('button', { name: /返\s*回/ }).click()
      : dialog.locator('.ant-modal-close').click());
    assert.equal(timedOut, false);
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await page.waitForLoadState('networkidle');
    assert.equal(
      new URL(page.url()).searchParams.get('appKey'),
      'text-to-image',
    );
    assert.equal(await page.locator('.composer-input-asset').count(), 0);
    if (cancel === 'back') await dialog.locator('.ant-modal-close').click();
    results.push({ race: `cancel pending result ${cancel}`, passed: true });
  }
  // Switching conversations must retain each workflow draft, including an intentionally cleared prompt.
  {
    const first = await fixture('cabin', 'switch draft A');
    const second = await fixture('cabin', 'switch draft B');
    await open(first);
    await action(first, '图片编辑');
    await settledDraft(first, 'reference-image-edit');
    await page.getByTestId('design-prompt-input').fill('DRAFT A');
    await page
      .locator(`[data-conversation-id="${second.conversation.id}"]`)
      .click();
    await page.waitForURL(
      (url) =>
        url.searchParams.get('conversationId') === second.conversation.id,
    );
    await action(second, '图片编辑');
    await settledDraft(second, 'reference-image-edit');
    await page.getByTestId('design-prompt-input').fill('DRAFT B');
    for (const [f, prompt] of [
      [first, 'DRAFT A'],
      [second, 'DRAFT B'],
    ]) {
      await page
        .locator(`[data-conversation-id="${f.conversation.id}"]`)
        .click();
      await page.waitForURL(
        (url) => url.searchParams.get('conversationId') === f.conversation.id,
      );
      await page.getByTestId('active-design-category').click();
      await page
        .locator('.design-generation-menu [data-generation-category="image"]')
        .click();
      await page.getByTestId('active-design-application').click();
      await page.locator('[data-app-key="reference-image-edit"]').click();
      await page.waitForURL(
        (url) => url.searchParams.get('appKey') === 'reference-image-edit',
      );
      await page.waitForLoadState('networkidle');
      assert.equal(
        await page.getByTestId('design-prompt-input').inputValue(),
        prompt,
      );
      const saved = await draft(f, 'reference-image-edit');
      assert.deepEqual(saved.inputAssetIds, {
        0: f.assets[0],
      });
    }
    const emptySaved = page.waitForResponse(
      (r) =>
        r
          .url()
          .includes(
            `/design-conversations/${second.conversation.id}/drafts/reference-image-edit`,
          ) &&
        r.request().method() === 'PUT' &&
        r.request().postDataJSON().parameterValues.prompt === '',
    );
    await page.getByTestId('design-prompt-input').fill('');
    await emptySaved;
    await page.reload();
    await page.locator('.composer-input-asset').first().waitFor();
    assert.equal(
      await page.getByTestId('design-prompt-input').inputValue(),
      '',
    );
    const cleared = await draft(second, 'reference-image-edit');
    assert.equal(cleared.parameterValues.prompt, '');
    results.push({
      conversationDraftIsolation: true,
      savedEmptyPrompt: true,
      passed: true,
    });
  }
  // Consume asset action URLs once: refresh must restore the user's edited draft rather than re-run the import.
  {
    const f = await fixture('cmf', 'asset source mode and refresh');
    await db`UPDATE assets SET saved_at=now() WHERE id=${f.assets[0]}`;
    await page.goto(
      `http://127.0.0.1:5666/design?sourceAssetId=${f.assets[0]}&assetAction=image-edit`,
    );
    await page.waitForURL(
      (url) =>
        url.searchParams.get('appKey') === 'reference-image-edit' &&
        !url.searchParams.has('sourceAssetId'),
    );
    assert.equal(new URL(page.url()).searchParams.get('designMode'), 'cmf');
    await page.getByTestId('design-prompt-input').fill('ASSET EDIT DRAFT');
    await page.getByRole('button', { name: /^添加图片2：/ }).click();
    const chooser = page.waitForEvent('filechooser');
    await page
      .locator('.composer-media-source-menu:visible')
      .getByRole('button', { name: /本地上传/ })
      .click();
    const fileChooser = await chooser;
    await fileChooser.setFiles({
      name: 'asset-reference.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await page.locator('.composer-input-asset').nth(1).waitFor();
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.locator('.composer-input-asset').nth(1).waitFor();
    assert.equal(
      await page.getByTestId('design-prompt-input').inputValue(),
      'ASSET EDIT DRAFT',
    );
    assert.equal(new URL(page.url()).searchParams.get('designMode'), 'cmf');
    await page.screenshot({
      path: join(work, 'asset-flow-desktop.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const collapse = page.getByRole('button', {
      name: '收起任务栏',
      exact: true,
    });
    if (await collapse.count()) await collapse.click();
    await page.screenshot({
      path: join(work, 'asset-flow-mobile.png'),
      fullPage: true,
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 1560, height: 1000 });
    results.push({
      assetCategory: 'cmf',
      consumedAction: true,
      reloadDraftWithTwoImages: true,
      passed: true,
    });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleErrors, []);
  await writeFile(
    join(work, 'results.json'),
    JSON.stringify(
      {
        fixture:
          'isolated authenticated API/PostgreSQL/MinIO; CPU images and queued jobs; no GPU quality claim',
        results,
        pageErrors: errors,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  console.log('PASS', results.length, 'result flow/reload/race cases');
} catch (error) {
  if (browser) {
    const p = browser.contexts()[0]?.pages()[0];
    if (p) {
      await p.screenshot({ path: join(work, 'failure.png'), fullPage: true });
      await writeFile(
        join(work, 'failure.txt'),
        await p.locator('body').innerText(),
      );
    }
  }
  console.error(error);
  failure = error;
} finally {
  await dispose().catch((error) => {
    failure ??= error;
  });
}
if (failure) throw failure;

async function dispose() {
  if (browser) await browser.close();
  for (const p of children) if (p.exitCode === null) p.kill('SIGTERM');
  await Promise.all(
    children
      .filter((p) => p.exitCode === null)
      .map(
        (p) =>
          new Promise((r) => {
            p.once('exit', r);
            setTimeout(() => {
              p.kill('SIGKILL');
              r();
            }, 3000).unref();
          }),
      ),
  );
  if (db) await db.end();
  if (created) await admin.unsafe(`DROP DATABASE "${dbName}" WITH (FORCE)`);
  if (role) await admin.unsafe(`DROP ROLE "${dbName}"`);
  await admin.end();
  let exists = false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    exists = true;
  } catch (error) {
    if (error?.$metadata?.httpStatusCode !== 404) throw error;
  }
  if (exists) {
    for (;;) {
      const p = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
      if (!p.Contents?.length) break;
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: p.Contents.map((x) => ({ Key: x.Key })) },
        }),
      );
    }
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
  }
  s3.destroy();
}
