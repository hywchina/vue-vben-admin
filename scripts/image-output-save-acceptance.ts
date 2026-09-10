import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

import {
  closeDatabase,
  useDatabase,
} from '../apps/platform-api/utils/database';
import { hashPassword } from '../apps/platform-api/utils/password';
import { deleteObject } from '../apps/platform-api/utils/storage';

const web = process.env.RAIL_WEB_URL ?? 'http://localhost:5666';
const api = `${web}/api/v1`;
const runId = `image-output-save-${randomUUID()}`;
const out = 'docs/rail-platform/ui-proposals/20260910-image-output-save';
const sql = useDatabase();
const users: string[] = [];
const projects: string[] = [];
const objectKeys: string[] = [];
const requestIds: string[] = [];
const evidence: string[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let seq = 0;
interface Asset {
  createdAt: string;
  generationCategory?: string;
  id: string;
  name: string;
  publicId: string;
  sourceJobPublicId?: string;
}
async function request<T = any>(
  path: string,
  token = '',
  body?: unknown,
  method = body ? 'POST' : 'GET',
  status = 200,
): Promise<T> {
  const requestId = `${runId}-${++seq}`;
  requestIds.push(requestId);
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body && method !== 'GET') options.body = JSON.stringify(body);
  const response = await fetch(`${api}${path}`, options);
  const envelope = await response.json();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${envelope.message}`,
  );
  return envelope.data;
}
async function account(index: number) {
  const username = `asset_${runId.slice(-12)}_${index}`;
  const password = `AssetAcceptance!${randomUUID()}`;
  const hash = await hashPassword(password);
  const [user] =
    await sql`INSERT INTO users (username, password_hash, real_name, email) VALUES (${username}, ${hash}, '资产验收成员', ${`${username}@rail.local`}) RETURNING id`;
  assert.ok(user);
  users.push(user.id);
  await sql`INSERT INTO user_roles (user_id, role_id) SELECT ${user.id}, id FROM roles WHERE code = 'user'`;
  await sql`INSERT INTO user_preferences (user_id) VALUES (${user.id})`;
  const login = await request('/auth/login', '', { username, password });
  return {
    id: user.id as string,
    username,
    password,
    token: login.accessToken as string,
  };
}
async function project(token: string, name: string) {
  const result = await request('/projects', token, {
    name,
    description: '本轮自动化验收临时项目',
  });
  projects.push(result.id);
  return result.id as string;
}
function pass(message: string) {
  evidence.push(message);
  console.log(`PASS ${message}`);
}

try {
  await mkdir(out, { recursive: true });
  const owner = await account(1);
  const projectId = await project(owner.token, '大图保存验收项目');
  await request('/users/me/current-project', owner.token, { projectId }, 'PUT');
  const conversation = await request('/design-conversations', owner.token, {
    projectId,
  });
  const folder = await request('/asset-folders', owner.token, {
    projectId,
    name: '保存目标目录',
  });
  const jobId = randomUUID();
  // Explicit persisted fixture: no external generation is performed by this test.
  await sql`INSERT INTO jobs (id,project_id,app_key,name,status,created_by,design_mode,design_conversation_id) VALUES (${jobId},${projectId},'text-to-image','多图保存测试夹具','succeeded',${owner.id},'cabin',${conversation.id})`;
  const imageIds: string[] = [];
  const bytes = await readFile('apps/web-antd/public/design-modes/cabin.webp');
  for (let index = 0; index < 2; index++) {
    const prepared = await request('/assets/uploads', owner.token, {
      projectId,
      name: `保存测试图片${index + 1}`,
      filename: `image${index}.webp`,
      kind: 'image',
      mimeType: 'image/webp',
      sizeBytes: bytes.length,
      tags: [],
    });
    const upload = await fetch(prepared.upload.url, {
      method: 'PUT',
      headers: prepared.upload.headers,
      body: bytes,
    });
    assert.ok(upload.ok);
    const asset = await request<Asset>(
      `/assets/${prepared.asset.id}/complete`,
      owner.token,
      {},
      'POST',
    );
    imageIds.push(asset.id);
    await sql`UPDATE assets SET saved_at = NULL, source = 'workflow', source_job_id=${jobId},source_app_key='text-to-image' WHERE id=${asset.id}`;
    await sql`INSERT INTO job_outputs (job_id,asset_id,position) VALUES (${jobId},${asset.id},${index})`;
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
  });
  const context = await browser.newContext({
    viewport: { width: 1370, height: 1000 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => {
    if (event.type() === 'error') errors.push(event.text());
  });
  await page.goto(`${web}/auth/login`);
  const inputs = page.locator('form input:visible');
  await inputs.nth(0).fill(owner.username);
  await inputs.nth(1).fill(owner.password);
  await page.locator('button').filter({ hasText: '登录' }).last().click();
  await page.waitForURL('**/home');
  await page.goto(`${web}/design?conversationId=${conversation.id}`);
  await page
    .getByRole('button', { name: '查看第 2 张：保存测试图片2', exact: true })
    .click();
  async function openSave(name: string, label: string) {
    await page
      .getByRole('button', { name: `全屏查看${name}`, exact: true })
      .click();
    await page
      .locator('.lightbox-actions')
      .getByRole('button', { name: label, exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: '加入资产中心',
      exact: true,
    });
    await dialog.waitFor();
    await page.locator('.lightbox-viewport').waitFor({ state: 'hidden' });
    const hit = await dialog
      .getByRole('button', { name: '保存到此目录', exact: true })
      .evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const top = document.elementFromPoint(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
        );
        return button.contains(top);
      });
    assert.ok(hit, '保存按钮被其他层遮挡');
    return dialog;
  }
  let dialog = await openSave('保存测试图片2', '添加至资产中心');
  await page.screenshot({
    path: `${out}/save-dialog.png`,
    animations: 'disabled',
  });
  await dialog.getByRole('button', { name: '取 消', exact: true }).click();
  const [before] =
    await sql`SELECT saved_at FROM assets WHERE id=${imageIds[1]}`;
  assert.equal(before?.saved_at, null);
  dialog = await openSave('保存测试图片2', '添加至资产中心');
  await dialog.getByRole('combobox').click();
  await page
    .locator('.ant-select-item-option-content')
    .filter({ hasText: '保存目标目录' })
    .click();
  await dialog
    .getByRole('button', { name: '保存到此目录', exact: true })
    .click();
  await dialog.waitFor({ state: 'hidden' });
  const saved =
    await sql`SELECT id,saved_at,folder_id FROM assets WHERE id=ANY(${imageIds}) ORDER BY name`;
  assert.equal(saved[0]?.saved_at, null);
  assert.ok(saved[1]?.saved_at);
  assert.equal(saved[1]?.folder_id, folder.id);
  pass(
    '多图选中第二张，大图保存关闭预览，目录弹窗无遮挡；取消不保存；正确图片保存到选择目录',
  );
  await sql`UPDATE jobs SET design_mode=NULL WHERE id=${jobId}`;
  await page.reload();
  dialog = await openSave('保存测试图片1', '加入资产');
  await dialog
    .getByRole('button', { name: '保存到此目录', exact: true })
    .click();
  await dialog.waitFor({ state: 'hidden' });
  const [legacy] =
    await sql`SELECT saved_at,folder_id FROM assets WHERE id=${imageIds[0]}`;
  assert.ok(legacy?.saved_at);
  assert.equal(legacy?.folder_id, null);
  assert.deepEqual(errors, []);
  pass('旧版无业务模式结果工具栏同样无遮挡，根目录保存成功，控制台无错误');
  await writeFile(
    `${out}/RESULTS.md`,
    `# 大图保存弹窗回归\n\n${evidence.map((item) => `- 通过：${item}`).join('\n')}\n\n使用临时数据库/对象存储测试夹具，结束后清理；不执行生图。\n`,
  );
} catch (error) {
  const activePage = browser?.contexts()[0]?.pages()[0];
  if (activePage) {
    await activePage
      .screenshot({ path: `${out}/failure.png`, fullPage: true })
      .catch(() => undefined);
    console.error('Browser location:', activePage.url());
    const bodyText = await activePage.locator('body').innerText();
    console.error(bodyText.slice(0, 1500));
  }
  throw error;
} finally {
  await browser?.close();
  if (projects.length > 0) {
    const objects =
      await sql`SELECT v.object_key FROM asset_versions v JOIN assets a ON a.id = v.asset_id WHERE a.project_id = ANY(${projects}) AND v.object_key IS NOT NULL`;
    objectKeys.push(...objects.map((item) => item.object_key as string));
    for (const key of new Set(objectKeys)) await deleteObject(key);
    await sql`DELETE FROM projects WHERE id = ANY(${projects})`;
  }
  if (requestIds.length > 0)
    await sql`DELETE FROM audit_events WHERE request_id = ANY(${requestIds})`;
  if (users.length > 0) {
    await sql`DELETE FROM audit_events WHERE actor_id = ANY(${users})`;
    await sql`DELETE FROM users WHERE id = ANY(${users})`;
  }
  await closeDatabase();
}
