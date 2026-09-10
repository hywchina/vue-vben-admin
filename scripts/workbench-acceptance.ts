import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
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
const runId = `workbench-${randomUUID()}`;
const out =
  'docs/rail-platform/ui-proposals/20260910-workbench-confirmed/verification';
const sql = useDatabase();
const users: string[] = [];
const projects: string[] = [];
const objectKeys: string[] = [];
const requestIds: string[] = [];
const evidence: string[] = [];
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let seq = 0;
async function request<T = any>(
  path: string,
  token = '',
  body?: unknown,
  method?: string,
  status = 200,
): Promise<T> {
  const requestMethod = method ?? (body === undefined ? 'GET' : 'POST');
  const requestId = `${runId}-${++seq}`;
  requestIds.push(requestId);
  const response = await fetch(`${api}${path}`, {
    method: requestMethod,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
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
    await sql`INSERT INTO users (username, password_hash, real_name, email) VALUES (${username}, ${hash}, '工作台验收成员', ${`${username}@rail.local`}) RETURNING id`;
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
  const colleague = await account(2);
  const outsider = await account(3);
  const admin = await account(4);
  await sql`DELETE FROM user_roles WHERE user_id = ${admin.id}`;
  await sql`INSERT INTO user_roles (user_id, role_id) SELECT ${admin.id}, id FROM roles WHERE code = 'admin'`;
  const projectId = await project(owner.token, '城际列车客室设计');
  const secondId = await project(owner.token, '商务座椅设计');
  const privateId = await project(outsider.token, '隔离项目');
  await sql`INSERT INTO project_members (project_id,user_id,project_role) VALUES (${projectId},${colleague.id},'viewer')`;
  await request(
    '/users/me/current-project',
    owner.token,
    { projectId: secondId },
    'PUT',
  );
  const conversations: string[] = [];
  for (let i = 0; i < 14; i++) {
    const result = await request('/design-conversations', owner.token, {
      projectId,
      title:
        (
          { 13: '客室整体布局优化', 12: '商务座配色方案' } as Record<
            number,
            string
          >
        )[i] ?? `历史设计 ${i + 1}`,
    });
    conversations.push(result.id);
  }
  const ownConversation = conversations.at(-1);
  assert.ok(ownConversation);
  const runningConversation = conversations.at(-2);
  assert.ok(runningConversation);
  // Explicit persisted execution fixtures; never submit external or GPU jobs.
  const ownJob = randomUUID();
  await sql`INSERT INTO jobs (id,project_id,app_key,name,status,created_by,design_mode,design_conversation_id) VALUES (${ownJob},${projectId},'text-to-image','客室效果图生成','succeeded',${owner.id},'cabin',${ownConversation})`;
  const activeJob = randomUUID();
  await sql`INSERT INTO jobs (id,project_id,app_key,name,status,progress,created_by,design_conversation_id) VALUES (${activeJob},${projectId},'text-to-image','布局方案生成中','running',62,${owner.id},${runningConversation})`;
  const failedJob = randomUUID();
  await sql`INSERT INTO jobs (id,project_id,app_key,name,status,error,created_by,design_conversation_id) VALUES (${failedJob},${projectId},'text-to-image','失败原因检查','failed','{"code":"TEST_FAILURE","message":"测试服务暂时不可用"}',${owner.id},${ownConversation})`;
  const otherConversation = randomUUID();
  await sql`INSERT INTO design_conversations (id,project_id,user_id,title) VALUES (${otherConversation},${projectId},${colleague.id},'同事私有设计')`;
  const otherJob = randomUUID();
  await sql`INSERT INTO jobs (id,project_id,app_key,name,status,created_by,design_conversation_id) VALUES (${otherJob},${projectId},'text-to-image','同事私有执行','succeeded',${colleague.id},${otherConversation})`;
  const folder = await request('/asset-folders', owner.token, {
    projectId,
    name: '客室方案成果',
    generationCategory: 'cabin',
  });
  const bytes = await readFile('apps/web-antd/public/design-modes/cabin.webp');
  const imageIds: string[] = [];
  for (let i = 0; i < 4; i++) {
    const prepared = await request('/assets/uploads', owner.token, {
      projectId,
      name: [
        '客室全景方案.webp',
        '座椅配色方案.webp',
        '灯光与材质方案.webp',
        '参考图.webp',
      ][i],
      filename: `workbench-${i}.webp`,
      kind: 'image',
      mimeType: 'image/webp',
      sizeBytes: bytes.length,
      folderId: folder.id,
    });
    const upload = await fetch(prepared.upload.url, {
      method: 'PUT',
      headers: prepared.upload.headers,
      body: bytes,
    });
    assert.ok(upload.ok);
    await request(`/assets/${prepared.asset.id}/complete`, owner.token, {});
    imageIds.push(prepared.asset.id);
    if (i < 3) {
      await sql`UPDATE assets SET source='workflow',source_app_key='text-to-image',source_job_id=${ownJob},saved_at=NULL,created_at=now()-interval '2 days' WHERE id=${prepared.asset.id}`;
      await sql`INSERT INTO job_outputs (job_id,asset_id,position) VALUES (${ownJob},${prepared.asset.id},${i})`;
    }
  }
  // Saved time must not use generation time; upload time must not use reservation time.
  await sql`UPDATE assets SET saved_at=now()-interval '5 days',created_at=now()-interval '5 days' WHERE id=${imageIds[3] ?? ''}`;
  const list = (section: string, token = owner.token, extra = '') =>
    request(`/workbench?section=${section}&pageSize=24${extra}`, token);
  await request('/workbench?section=designs', '', undefined, 'GET', 401);
  for (const query of [
    'section=unknown',
    'section=designs&pageSize=1000',
    'section=tasks&page=-1',
    'section=tasks&activeOnly=0',
  ])
    await request(`/workbench?${query}`, owner.token, undefined, 'GET', 400);
  const designs = await list('designs');
  assert.equal(designs.total, 14);
  assert.equal(
    designs.items.find((item: any) => item.id === ownConversation).status,
    'failed',
  );
  assert.equal(
    designs.items.find((item: any) => item.id === ownConversation).roundCount,
    2,
  );
  const pageOne = await request(
    '/workbench?section=designs&pageSize=12',
    owner.token,
  );
  const pageTwo = await request(
    '/workbench?section=designs&pageSize=12&page=2',
    owner.token,
  );
  assert.equal(pageOne.items.length, 12);
  assert.equal(pageTwo.items.length, 2);
  assert.equal(
    new Set([...pageOne.items, ...pageTwo.items].map((item: any) => item.id))
      .size,
    14,
  );
  for (const section of ['designs', 'tasks', 'results']) {
    const adminList = await list(section, admin.token);
    assert.equal(adminList.total, 0);
  }
  const outsiderDesigns = await list('designs', outsider.token);
  const ownerProjects = await list('projects');
  const outsiderProjects = await list('projects', outsider.token);
  const viewerProjects = await list('projects', colleague.token);
  const ownerTasks = await list('tasks');
  const activeTasks = await list('tasks', owner.token, '&activeOnly=true');
  const ownerResults = await list('results');
  assert.equal(outsiderDesigns.total, 0);
  assert.equal(ownerProjects.total, 2);
  assert.equal(outsiderProjects.items[0].id, privateId);
  assert.equal(viewerProjects.items[0].canWrite, false);
  assert.equal(ownerTasks.total, 3);
  assert.equal(activeTasks.items[0].id, activeJob);
  assert.equal(ownerResults.total, 3);
  assert.ok(ownerResults.items.every((item: any) => !item.saved));
  const saved = await list('saved');
  assert.equal(saved.total, 1);
  assert.ok(Date.parse(saved.items[0].updatedAt) > Date.now() - 60_000);
  await request(
    `/assets/${imageIds[0]}/save`,
    colleague.token,
    {},
    'POST',
    403,
  );
  pass(
    '真实 API：五类数据、分页无重叠、最新轮次状态、活动任务筛选、管理员个人数据隔离、项目范围、只读拒绝和保存/上传时间语义',
  );

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1380 },
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
  await page.goto(`${web}/projects`);
  const panel = (name: string) =>
    page.getByRole('region', { name, exact: true });
  await panel('我的设计').locator('.wb-item').first().waitFor();
  for (const name of [
    '我的设计',
    '我的项目',
    '最近任务',
    '最近设计成果',
    '最近保存资产',
  ])
    assert.ok(await panel(name).isVisible());
  await panel('最近设计成果').locator('img').first().waitFor();
  await page.locator('#__app-loading__').waitFor({ state: 'detached' });
  await page.screenshot({
    path: `${out}/workbench-desktop.png`,
    fullPage: true,
  });
  await panel('我的设计').getByRole('button', { name: '查看全部' }).click();
  const modal = () => page.locator('.ant-modal:visible').last();
  await modal().locator('.wb-item').nth(11).waitFor();
  assert.equal(await modal().locator('.wb-item').count(), 12);
  await modal().locator('.ant-pagination-item-2').click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.ant-modal')].some(
      (el) =>
        (el as HTMLElement).offsetHeight > 0 &&
        el.querySelectorAll('.wb-item').length === 2,
    ),
  );
  assert.equal(await modal().locator('.wb-item').count(), 2);
  await modal().getByRole('button', { name: 'Close', exact: true }).click();
  await panel('最近任务')
    .getByRole('button', { name: '进行中', exact: true })
    .click();
  await panel('最近任务').getByRole('button', { name: '查看进度' }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll('.wb-panel--tasks .wb-item').length === 1,
  );
  assert.equal(await panel('最近任务').locator('.wb-item').count(), 1);
  await panel('最近任务').getByRole('button', { name: '查看进度' }).click();
  await modal()
    .getByRole('button', { name: /^停\s*止$/ })
    .click();
  await page.waitForFunction(() =>
    document
      .querySelector('.wb-task-detail .status-pill')
      ?.textContent?.includes('已取消'),
  );
  await modal().getByRole('button', { name: 'Close', exact: true }).click();
  await panel('最近任务').getByText('当前没有进行中的任务').waitFor();
  await panel('最近任务')
    .getByRole('button', { name: '全部', exact: true })
    .click();
  pass('浏览器：五区同时显示、会话分页、进行中筛选、任务进度详情和真实取消');

  const resultCard = panel('最近设计成果').locator(
    `[data-item-id="${imageIds[0]}"]`,
  );
  await resultCard.getByRole('button', { name: '预览', exact: true }).click();
  await modal().locator('.lightbox-viewport img').waitFor();
  await modal().getByRole('button', { name: 'Close', exact: true }).click();
  await resultCard
    .getByRole('button', { name: '保存至项目', exact: true })
    .click();
  await modal().locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '客室方案成果' })
    .click();
  await modal().getByRole('button', { name: '确认保存', exact: true }).click();
  await resultCard.getByText('已保存', { exact: true }).waitFor();
  const savedAfter = await list('saved');
  assert.equal(savedAfter.items[0].id, imageIds[0]);
  assert.ok(Date.parse(savedAfter.items[0].updatedAt) > Date.now() - 60_000);
  await resultCard
    .getByRole('button', { name: '所在目录', exact: true })
    .click();
  await page.waitForURL('**/assets?**');
  await page
    .locator('[aria-label="资产文件浏览器"][aria-busy="false"]')
    .waitFor();
  await page.locator(`[data-asset-id="${imageIds[0]}"]`).waitFor();
  assert.equal(new URL(page.url()).searchParams.get('projectId'), projectId);
  assert.equal(new URL(page.url()).searchParams.get('folderId'), folder.id);
  await page.reload();
  await page.locator(`[data-asset-id="${imageIds[0]}"]`).waitFor();
  pass(
    '浏览器：真实成果预览、保存至指定目录、保存排序刷新、跨项目目录跳转及刷新恢复',
  );
  const downloadLink = await request(
    `/assets/${imageIds[0]}/download`,
    owner.token,
  );
  assert.equal(downloadLink.mode, 'url');
  const downloaded = await fetch(downloadLink.url);
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  await page.goto(`${web}/projects`);
  const capabilities = await request('/applications', owner.token);
  await panel('最近设计成果')
    .locator(`[data-item-id="${imageIds[0]}"]`)
    .getByRole('button', { name: '预览', exact: true })
    .click();
  if (
    capabilities.some((app: any) => app.key === 'inpaint-single' && app.visible)
  ) {
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '局部重绘', exact: true })
      .click();
    await page.waitForURL('**/design?**');
    assert.equal(
      new URL(page.url()).searchParams.get('sourceAssetId'),
      imageIds[0],
    );
    await page.locator('.mask-editor-viewport').waitFor();
    await page.waitForFunction(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
        '.mask-editor-viewport canvas',
      );
      return canvas && canvas.width > 300;
    });
  } else {
    assert.equal(
      await page
        .getByRole('dialog')
        .getByRole('button', { name: '局部重绘', exact: true })
        .isDisabled(),
      true,
    );
  }
  pass(
    '浏览器：图片大图工具栏进入已有局部重绘流程（无外部执行），下载签名文件内容与原文件一致',
  );
  await page.goto(`${web}/projects`);
  await panel('我的设计').getByRole('button', { name: '查看全部' }).click();
  await modal().locator('.wb-item').first().waitFor();
  await modal().locator('.ant-pagination-item-1').click();
  await modal()
    .locator(`[data-item-id="${ownConversation}"]`)
    .getByRole('button', { name: '继续设计', exact: true })
    .click();
  await page.waitForURL('**/design?**');
  assert.equal(
    new URL(page.url()).searchParams.get('conversationId'),
    ownConversation,
  );
  await page.goto(`${web}/projects`);
  await page.getByRole('button', { name: '新建设计', exact: true }).click();
  await modal()
    .getByPlaceholder('例如：商务座客室布局优化')
    .fill('浏览器新建设计');
  await modal().getByRole('button', { name: '创建并开始设计' }).click();
  await page.waitForURL('**/design?**');
  const designsAfterCreate = await list('designs');
  assert.ok(
    designsAfterCreate.items.some(
      (item: any) => item.name === '浏览器新建设计',
    ),
  );
  await page.goto(`${web}/projects`);
  await page.getByRole('button', { name: '项目管理', exact: true }).click();
  await page.getByRole('dialog', { name: '我的项目', exact: true }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/projects');
  await page.getByRole('button', { name: '新建项目', exact: true }).waitFor();
  pass('浏览器：继续原设计、新建设计真实持久化、项目管理弹窗');
  await page.goto(`${web}/projects`);
  await page.locator('#__app-loading__').waitFor({ state: 'detached' });
  for (const width of [1024, 736, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await panel('最近保存资产').waitFor();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    assert.equal(overflow, false, `${width}px horizontal overflow`);
    const contentHeight = await page
      .locator('.workbench-page')
      .evaluate((el) => el.scrollHeight);
    await page.setViewportSize({ width, height: contentHeight + 150 });
    await page.screenshot({
      path: `${out}/workbench-${width}.png`,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  pass('浏览器：1024/736/390px 无横向溢出，零页面及控制台错误');
  // Inject a single section failure in this test browser only, and verify recovery.
  await page.route('**/api/v1/workbench?**', async (route) => {
    if (
      new URL(route.request().url()).searchParams.get('section') === 'results'
    ) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'TEST_UNAVAILABLE',
          message: '测试暂不可用',
          data: null,
        }),
      });
      return;
    }
    await route.continue();
  });
  await page.reload();
  await panel('最近设计成果')
    .getByRole('button', { name: /^重\s*试$/ })
    .waitFor();
  assert.ok(await panel('我的设计').locator('.wb-item').first().isVisible());
  await page.unroute('**/api/v1/workbench?**');
  await panel('最近设计成果')
    .getByRole('button', { name: /^重\s*试$/ })
    .click();
  await panel('最近设计成果').locator('.wb-item').first().waitFor();
  pass('浏览器：单区失败不影响其他区域，重试恢复');
  await writeFile(
    `${out}/RESULTS.md`,
    `# 均衡总览工作台验收\n\n${new Date().toISOString()}\n\n${evidence.map((item) => `- 通过：${item}`).join('\n')}\n\n使用本轮独立测试账号、项目和真实对象存储，执行任务为数据库显式夹具；没有调用外部生成服务。测试完成后仅清理本轮创建的数据。\n`,
  );
} catch (error) {
  const activePage = browser?.contexts()[0]?.pages()[0];
  if (activePage) {
    await activePage
      .screenshot({ path: `${out}/failure.png`, fullPage: true })
      .catch(() => undefined);
    console.error('Browser location:', activePage.url());
    const resolved24 = await activePage.locator('body').innerText();
    console.error(resolved24.slice(0, 1500));
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
