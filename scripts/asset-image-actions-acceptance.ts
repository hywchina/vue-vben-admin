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
const runId = `asset-image-actions-${randomUUID()}`;
const out = 'docs/rail-platform/ui-proposals/20260910-asset-image-actions';
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
  const projectId = await project(owner.token, '图片操作归属项目');
  const otherProjectId = await project(owner.token, '其他当前项目');
  await request(
    '/users/me/current-project',
    owner.token,
    { projectId: otherProjectId },
    'PUT',
  );
  const bytes = await readFile('apps/web-antd/public/design-modes/cabin.webp');
  const prepared = await request('/assets/uploads', owner.token, {
    projectId,
    name: '图片操作测试',
    filename: 'input.webp',
    kind: 'image',
    mimeType: 'image/webp',
    sizeBytes: bytes.length,
    tags: [],
  });
  const uploaded = await fetch(prepared.upload.url, {
    method: 'PUT',
    headers: prepared.upload.headers,
    body: bytes,
  });
  assert.ok(uploaded.ok);
  const asset = await request<Asset>(
    `/assets/${prepared.asset.id}/complete`,
    owner.token,
    {},
    'POST',
  );
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
  async function openAsset() {
    await page.goto(`${web}/assets`);
    await page
      .locator('[aria-label="资产文件浏览器"][aria-busy="false"]')
      .waitFor();
    await page
      .locator(`[data-asset-id="${asset.id}"] .asset-card__preview img`)
      .click();
    await page.locator('.asset-image-actions').waitFor();
    await page.waitForTimeout(350);
  }
  await openAsset();
  assert.equal(await page.locator('.asset-image-actions button').count(), 8);
  assert.ok(
    await page
      .getByRole('button', { name: '重新绘制', exact: true })
      .isDisabled(),
  );
  await page.screenshot({ path: `${out}/toolbar.png`, animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  const toolbar = await page.locator('.asset-image-actions').boundingBox();
  assert.ok(toolbar && toolbar.x >= 0 && toolbar.x + toolbar.width <= 391);
  await page.screenshot({
    path: `${out}/toolbar-mobile.png`,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1370, height: 1000 });
  await page.getByRole('button', { name: '图像理解', exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === '/design' && url.searchParams.has('conversationId'),
  );
  await page.locator('.composer-box img').first().waitFor();
  const conversationId = new URL(page.url()).searchParams.get('conversationId');
  const [conversation] =
    await sql`SELECT project_id FROM design_conversations WHERE id = ${conversationId}`;
  assert.equal(conversation?.project_id, projectId);
  assert.notEqual(conversation?.project_id, otherProjectId);
  await page.waitForTimeout(1200);
  const [draft] =
    await sql`SELECT input_asset_ids FROM design_conversation_drafts WHERE conversation_id = ${conversationId} AND app_key = 'image-understanding'`;
  assert.ok(Object.values(draft?.input_asset_ids ?? {}).includes(asset.id));
  pass(
    '八个操作图标、上传图片重绘禁用、390px工具栏、跨当前项目进入图片归属项目、图像理解带入正确资产',
  );
  for (const [label, selector] of [
    ['部件/材质融合', '[role="dialog"]'],
    ['图像放大', '[role="dialog"]'],
    ['多角度生成', '[role="dialog"]'],
    ['局部重绘', '.mask-editor-viewport'],
  ] as const) {
    await openAsset();
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === '/design' && url.searchParams.has('conversationId'),
    );
    await page.locator(selector).first().waitFor();
    pass(`${label}进入现有编辑弹窗`);
  }
  for (const label of ['标记修改', '环境更改']) {
    await openAsset();
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === '/design' && url.searchParams.has('conversationId'),
    );
    await page.locator('.composer-box img').first().waitFor();
    pass(`${label}带入图片编辑器`);
  }
  // Explicit test fixture for replaying saved parameters; no external execution is claimed.
  const sourceConversation = await request(
    '/design-conversations',
    owner.token,
    { projectId },
  );
  const sourceJobId = randomUUID();
  const apps = await request('/applications', owner.token);
  const imageApp = apps.find((app: any) => app.key === 'text-to-image');
  const capability = await request(
    `/capabilities/${imageApp.capabilityCode}`,
    owner.token,
  );
  const promptField = capability.fields.find(
    (field: any) => field.type === 'textarea',
  );
  assert.ok(promptField);
  const sourceParameters = { [promptField.key]: '资产重新绘制参数验收' };
  await sql`INSERT INTO jobs (id,project_id,app_key,name,status,parameters,created_by,design_mode,design_conversation_id) VALUES (${sourceJobId},${projectId},'text-to-image','参数复用测试夹具','succeeded',${sql.json(sourceParameters)},${owner.id},'cabin',${sourceConversation.id})`;
  await sql`INSERT INTO job_outputs (job_id,asset_id) VALUES (${sourceJobId},${asset.id})`;
  await sql`UPDATE assets SET source = 'workflow', source_job_id = ${sourceJobId}, source_app_key = 'text-to-image' WHERE id = ${asset.id}`;
  await openAsset();
  await page.getByRole('button', { name: '重新绘制', exact: true }).click();
  await page.waitForURL(
    (url) =>
      url.pathname === '/design' && url.searchParams.has('conversationId'),
  );
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLTextAreaElement>(
        '[data-testid="design-prompt-input"]',
      )?.value === '资产重新绘制参数验收',
  );
  pass('重新绘制复用真实来源关联的参数快照，等待用户发送');
  const [jobCount] =
    await sql`SELECT count(*)::int AS count FROM jobs WHERE project_id = ${projectId}`;
  assert.equal(jobCount?.count, 1);
  assert.deepEqual(errors, []);
  await writeFile(
    `${out}/RESULTS.md`,
    `# 资产图片操作验收\n\n${evidence.map((item) => `- 通过：${item}`).join('\n')}\n\n临时测试账号、项目、会话和对象在结束时清理；未提交生图任务。\n`,
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
