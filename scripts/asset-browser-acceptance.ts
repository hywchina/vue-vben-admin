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

const web = process.env.RAIL_WEB_URL ?? 'http://127.0.0.1:5666';
const api = `${web}/api/v1`;
const runId = `asset-browser-${randomUUID()}`;
const out = 'docs/rail-platform/ui-proposals/20260910-assets/verification';
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
  const outsider = await account(2);
  const viewer = await account(3);
  const projectId = await project(owner.token, '资产中心 C 版验收');
  const secondId = await project(owner.token, '资产中心切换验收');
  const privateId = await project(outsider.token, '隔离项目');
  await sql`INSERT INTO project_members (project_id, user_id, project_role) VALUES (${projectId}, ${viewer.id}, 'viewer')`;
  const folder = await request('/asset-folders', owner.token, {
    projectId,
    name: '材质方案',
    generationCategory: 'cmf',
  });
  const child = await request('/asset-folders', owner.token, {
    projectId,
    parentId: folder.id,
    name: '座椅面料',
    generationCategory: 'cabin',
  });
  assert.equal(child.generationCategory, 'cmf');
  const cabinFolder = await request('/asset-folders', owner.token, {
    projectId,
    name: '材质方案',
    generationCategory: 'cabin',
  });
  await request(
    '/asset-folders',
    owner.token,
    { projectId, name: '材质方案', generationCategory: 'cmf' },
    'POST',
    409,
  );
  await request(
    '/asset-folders',
    owner.token,
    { projectId: secondId, parentId: folder.id, name: '跨项目目录' },
    'POST',
    400,
  );
  await request(
    '/asset-folders',
    viewer.token,
    { projectId, name: '只读写入' },
    'POST',
    403,
  );
  await request(
    `/assets?projectId=${projectId}&generationCategory=cmf`,
    outsider.token,
    undefined,
    'GET',
    404,
  );
  await request(`/assets?projectId=${projectId}`, '', undefined, 'GET', 401);
  pass(
    '分类目录同名隔离、子级继承、跨项目目录拒绝、只读写入拒绝、未授权查询拒绝',
  );
  const names = [
    '蓝灰织物方案',
    '蓝灰织物方案扩展',
    '100%_面料',
    '材质搭配方案',
    '座椅应用效果',
    '面料细节',
  ];
  const imageIds: string[] = [];
  for (const [i, name] of names.entries()) {
    const bytes = await readFile(
      `apps/web-antd/public/design-modes/${i % 2 ? 'cabin' : 'cmf'}.webp`,
    );
    const prepared = await request('/assets/uploads', owner.token, {
      projectId,
      folderId: child.id,
      generationCategory: 'component',
      name,
      filename: `${i}.webp`,
      kind: 'image',
      mimeType: 'image/webp',
      sizeBytes: bytes.length,
      tags: ['座椅', `验证-${i}`],
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
    assert.equal(asset.generationCategory, 'cmf');
    imageIds.push(asset.id);
  }
  const text = await request<Asset>('/assets/text', owner.token, {
    projectId,
    name: '方案说明',
    content: '临时验收说明',
    generationCategory: 'cmf',
  });
  const unknown = await request<Asset>('/assets/text', owner.token, {
    projectId,
    name: '未分类素材',
    content: '临时验收说明',
  });
  const second = await request<Asset>('/assets/text', owner.token, {
    projectId: secondId,
    name: '第二项目素材',
    content: '临时验收说明',
    generationCategory: 'component',
  });
  const secret = await request<Asset>('/assets/text', outsider.token, {
    projectId: privateId,
    name: '隔离素材',
    content: '临时验收说明',
    generationCategory: 'cmf',
  });
  const conversation = await request('/design-conversations', owner.token, {
    projectId,
    title: '资产分类验收会话',
  });
  for (const category of ['cmf', 'component', 'cabin', 'report']) {
    const [job] =
      await sql`INSERT INTO jobs (project_id, app_key, name, created_by, status, design_mode, design_conversation_id) VALUES (${projectId}, 'text-to-image', '分类血缘测试任务', ${owner.id}, 'failed', ${category}, ${conversation.id}) RETURNING id`;
    assert.ok(job);
    const asset = await request<Asset>('/assets/text', owner.token, {
      projectId,
      name: `${category}任务素材`,
      content: '临时验收说明',
    });
    await sql`UPDATE assets SET source = 'workflow', source_app_key = 'text-to-image', source_job_id = ${job.id} WHERE id = ${asset.id}`;
    const resolved1 = await request<Asset>(`/assets/${asset.id}`, owner.token);
    assert.equal(resolved1.generationCategory, category);
  }
  // Separate report fallback covers report jobs that predate design_mode.
  const report = await request<Asset>('/assets/text', owner.token, {
    projectId,
    name: '报告兼容素材',
    content: '临时验收说明',
  });
  await sql`UPDATE assets SET source = 'workflow', source_app_key = 'report-generator', generation_category = NULL WHERE id = ${report.id}`;
  const resolved2 = await request<Asset>(`/assets/${report.id}`, owner.token);
  assert.equal(resolved2.generationCategory, 'report');
  const list = (params: Record<string, string> = {}) =>
    request<Asset[]>(
      `/assets?${new URLSearchParams({ projectId, ...params })}`,
      owner.token,
    );
  const resolved3 = await list({
    generationCategory: 'cmf',
    folderId: child.id,
  });
  assert.equal(resolved3.length, 6);
  const resolved4 = await list({ keyword: '蓝灰织物', matchMode: 'fuzzy' });
  assert.equal(resolved4.length, 2);
  const resolved5 = await list({ keyword: '蓝灰织物', matchMode: 'exact' });
  assert.equal(resolved5.length, 0);
  const resolved6 = await list({ keyword: names[0] ?? '', matchMode: 'exact' });
  assert.equal(resolved6.length, 1);
  const resolved7 = await list({ keyword: '100%_', matchMode: 'fuzzy' });
  assert.equal(resolved7.length, 1);
  const resolved8 = await list({ keyword: "%' OR 1=1 --" });
  assert.equal(resolved8.length, 0);
  const resolved9 = await list({ keyword: '座椅', matchMode: 'exact' });
  assert.equal(resolved9.length, 6);
  const resolved10 = await list({ keyword: text.publicId, matchMode: 'exact' });
  assert.equal(resolved10[0]?.id, text.id);
  const resolved11 = await list({ generationCategory: 'unclassified' });
  assert.equal(resolved11[0]?.id, unknown.id);
  const resolved12 = await list();
  assert.ok(
    resolved12.every((item) => item.id !== secret.id && item.id !== second.id),
  );
  const resolved13 = await list({ kind: 'text', generationCategory: 'cmf' });
  assert.equal(resolved13.length, 2);
  await request(
    `/assets?projectId=${projectId}&kind=cmf`,
    owner.token,
    undefined,
    'GET',
    400,
  );
  await request(
    `/assets?projectId=${projectId}&createdFrom=2026-10-01T00:00:00Z&createdTo=2026-09-01T00:00:00Z`,
    owner.token,
    undefined,
    'GET',
    400,
  );
  const asc = await list({ sortBy: 'name', sortOrder: 'asc' });
  const desc = await list({ sortBy: 'name', sortOrder: 'desc' });
  assert.deepEqual(
    asc.map((item) => item.id),
    desc.map((item) => item.id).toReversed(),
  );
  const [source] =
    await sql`SELECT id, public_id FROM jobs WHERE project_id = ${projectId} AND design_mode = 'cmf'`;
  assert.ok(source);
  const resolved14 = await list({ sourceJobId: source.id });
  assert.equal(resolved14.length, 1);
  const resolved15 = await list({
    keyword: source.public_id,
    matchMode: 'exact',
  });
  assert.equal(resolved15.length, 1);
  const resolved16 = await list({
    createdFrom: '2000-01-01T00:00:00Z',
    createdTo: '2000-01-02T00:00:00Z',
  });
  assert.equal(resolved16.length, 0);
  pass(
    '真实 MinIO 上传、任务模式归类、报告兼容、类型/任务/时间组合、精确/模糊/标签/字面通配符搜索、双向排序',
  );
  const copied = await request('/assets/batch', owner.token, {
    projectId,
    assetIds: [text.id],
    operation: 'copy',
    targetFolderId: child.id,
  });
  const resolved17 = await request<Asset>(
    `/assets/${copied.copiedAssetIds[0]}`,
    owner.token,
  );
  assert.equal(resolved17.generationCategory, 'cmf');
  await request('/assets/batch', owner.token, {
    projectId,
    assetIds: [text.id],
    operation: 'move',
    targetFolderId: cabinFolder.id,
  });
  const resolved18 = await request<Asset>(`/assets/${text.id}`, owner.token);
  assert.equal(resolved18.generationCategory, 'cabin');
  await request('/assets/batch', owner.token, {
    projectId,
    assetIds: [text.id],
    operation: 'move',
    targetFolderId: null,
  });
  const resolved19 = await request<Asset>(`/assets/${text.id}`, owner.token);
  assert.equal(resolved19.generationCategory, 'cabin');
  await request(
    `/assets/${imageIds[0]}/favorite`,
    owner.token,
    { favorite: true },
    'PATCH',
  );
  const resolved20 = await list({ favoriteOnly: 'true' });
  assert.equal(resolved20.length, 1);
  const resolved21 = await request<Asset[]>(
    `/assets?projectId=${projectId}&favoriteOnly=true`,
    viewer.token,
  );
  assert.equal(resolved21.length, 0);
  await request(
    '/assets/batch',
    owner.token,
    { projectId, assetIds: [secret.id], operation: 'copy' },
    'POST',
    400,
  );
  pass(
    '复制保留分类、跨分类移动、回根目录保留分类、收藏按用户隔离、批量跨项目拒绝',
  );
  // Restore the child directory to six images for a representative screenshot.
  await request('/assets/batch', owner.token, {
    projectId,
    assetIds: copied.copiedAssetIds,
    operation: 'delete',
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
  });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.setDefaultNavigationTimeout(30_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => {
    if (event.type() === 'error') errors.push(event.text());
  });
  console.log('Browser: login');
  await page.goto(`${web}/auth/login`);
  const inputs = page.locator('form input:visible');
  await inputs.nth(0).fill(owner.username);
  await inputs.nth(1).fill(owner.password);
  await page.locator('button').filter({ hasText: '登录' }).last().click();
  await page.waitForURL('**/home');
  console.log('Browser: assets');
  await page.goto(`${web}/assets`);
  await page.getByRole('heading', { name: '资产中心', exact: true }).waitFor();
  const ready = async () => {
    await page
      .locator('[aria-label="资产文件浏览器"][aria-busy="false"]')
      .waitFor();
  };
  const select = async (label: string, option: string) => {
    console.log(`Browser: select ${label}`);
    await page.locator(`[aria-label="${label}"]`).first().click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option')
      .filter({ hasText: option })
      .first()
      .click();
    await ready();
  };
  await ready();
  await select('按项目筛选资产', '资产中心 C 版验收');
  await page.locator('[data-asset-module="cmf"]').click();
  await ready();
  await page.locator(`[data-folder-id="${folder.id}"]`).click();
  await ready();
  await page.locator(`[data-folder-id="${child.id}"]`).click();
  await ready();
  await page.waitForFunction(
    () => document.querySelectorAll('.asset-card').length === 6,
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('.asset-card__image')]
        .length === 6 &&
      [
        ...document.querySelectorAll<HTMLImageElement>('.asset-card__image'),
      ].every((image) => image.complete && image.naturalWidth > 0),
  );
  await page.screenshot({
    path: `${out}/assets-c-desktop.png`,
    fullPage: true,
    animations: 'disabled',
  });
  const search = page.getByLabel('搜索资产', { exact: true });
  await search.fill('蓝灰织物');
  await search.press('Enter');
  await page.waitForFunction(
    () => document.querySelectorAll('.asset-card').length === 2,
  );
  await select('搜索匹配方式', '精准');
  await page.getByText('没有符合条件的资产').waitFor();
  await search.fill(names[0] ?? '');
  await search.press('Enter');
  await page.waitForFunction(
    () => document.querySelectorAll('.asset-card').length === 1,
  );
  await search.fill('');
  await search.press('Enter');
  await page.waitForFunction(
    () => document.querySelectorAll('.asset-card').length === 6,
  );
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.getByText('筛选资产', { exact: true }).waitFor();
  await page.waitForFunction(() => {
    const panel = document.querySelector(
      '.ant-drawer-open .ant-drawer-content-wrapper',
    );
    if (!panel) return false;
    const box = panel.getBoundingClientRect();
    return box.width > 300 && Math.abs(box.right - window.innerWidth) < 2;
  });
  await page.screenshot({
    path: `${out}/assets-c-filters.png`,
    fullPage: true,
    animations: 'disabled',
  });
  await select('按文件类型筛选', '文本');
  await page.getByRole('button', { name: /完\s*成/ }).click();
  await page.getByText('没有符合条件的资产').waitFor();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('.asset-card').length === 6,
  );
  await page.getByRole('button', { name: '列表视图', exact: true }).click();
  assert.equal(await page.locator('.asset-list .asset-card').count(), 6);
  await page.getByRole('button', { name: '网格视图', exact: true }).click();
  await page.getByRole('button', { name: /全\s*选/ }).click();
  await page.getByText('已选择 6 项').waitFor();
  await page.getByRole('button', { name: '取消选择', exact: true }).click();
  await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
  await page.getByPlaceholder('输入文件夹名称').fill('浏览器子文件夹');
  await page.getByRole('button', { name: /创\s*建/ }).click();
  await page
    .locator('.asset-folder-card')
    .filter({ hasText: '浏览器子文件夹' })
    .waitFor();
  await page.reload();
  await ready();
  await select('按项目筛选资产', '资产中心 C 版验收');
  await page.locator('[data-asset-module="cmf"]').click();
  await ready();
  await page.locator(`[data-folder-id="${folder.id}"]`).click();
  await ready();
  await page.locator(`[data-folder-id="${child.id}"]`).click();
  await ready();
  await page
    .locator('.asset-folder-card')
    .filter({ hasText: '浏览器子文件夹' })
    .waitFor();
  await page
    .locator(`[data-asset-id="${imageIds[0]}"] .asset-card__body`)
    .click();
  await page
    .getByLabel('资产名称', { exact: true })
    .waitFor()
    .catch(async () => {
      await page.locator('#asset-detail-name').waitFor();
    });
  await page.locator('.ant-drawer:visible .ant-drawer-close').click();
  await page.locator('#asset-detail-name').waitFor({ state: 'hidden' });
  assert.equal(
    await page
      .locator('[data-asset-module="cmf"]')
      .getAttribute('aria-pressed'),
    'true',
  );
  const resolved22 = await page.locator('.asset-breadcrumbs').innerText();
  assert.ok(resolved22.includes('座椅面料'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () =>
      (document.querySelector('.asset-browser')?.getBoundingClientRect()
        .width ?? Infinity) < 400,
  );
  await page.screenshot({
    path: `${out}/assets-c-mobile.png`,
    fullPage: true,
    animations: 'disabled',
  });
  const sizes = await page.evaluate(() => ({
    width: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(
    sizes.scroll <= sizes.width,
    `mobile overflow: ${JSON.stringify(sizes)}`,
  );
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByRole('button', { name: '登记资产', exact: true }).click();
  const uploadDialog = page.locator('.ant-modal:visible');
  await uploadDialog
    .getByPlaceholder('输入清晰、可检索的名称')
    .fill('浏览器登记说明');
  await uploadDialog.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '文本' })
    .first()
    .click();
  await uploadDialog
    .getByPlaceholder('输入设计说明、提示词、规范或其他项目文本')
    .fill('C 版浏览器实际登记验收');
  await uploadDialog
    .getByRole('button', { name: '登记资产', exact: true })
    .click();
  await page
    .locator('.asset-card')
    .filter({ hasText: '浏览器登记说明' })
    .waitFor();
  const registered = await list({
    keyword: '浏览器登记说明',
    matchMode: 'exact',
  });
  assert.equal(registered[0]?.generationCategory, 'cmf');
  assert.ok(registered[0]);
  const uploadedCard = page.locator(`[data-asset-id="${registered[0].id}"]`);
  await uploadedCard.hover();
  await uploadedCard.getByRole('checkbox').check();
  await page.getByRole('button', { name: '移动到', exact: true }).click();
  const moveDialog = page.locator('.ant-modal:visible');
  await moveDialog.locator('.ant-select').click();
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .filter({ hasText: '客室 / 材质方案' })
    .first()
    .click();
  await moveDialog.getByRole('button', { name: /移\s*动/ }).click();
  await uploadedCard.waitFor({ state: 'detached' });
  const resolved23 = await request<Asset>(
    `/assets/${registered[0].id}`,
    owner.token,
  );
  assert.equal(resolved23.generationCategory, 'cabin');
  await select('资产排序', '创建时间：最早优先');
  assert.equal(
    await page.locator('.asset-card').first().getAttribute('data-asset-id'),
    imageIds[0],
  );
  pass(
    '浏览器真实登记文本到分类目录、批量移动到另一模块、分类结果刷新和正序排序',
  );
  assert.deepEqual(errors, []);
  pass(
    '浏览器登录、C 版布局、真实预览、精准/模糊切换、筛选面板、列表/网格、多选、目录刷新持久化、详情、390px 无溢出及零控制台错误',
  );
  await writeFile(
    `${out}/RESULTS.md`,
    `# 资产中心 C 版验收\n\n${new Date().toISOString()}\n\n${evidence.map((item) => `- 通过：${item}`).join('\n')}\n\n截图由真实页面及本轮临时测试资产生成；测试后清理本轮账号、项目和对象。\n`,
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
