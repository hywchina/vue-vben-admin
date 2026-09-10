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
const runId = `dark-theme-${randomUUID()}`;
const out = 'docs/rail-platform/ui-proposals/20260910-dark-theme/verification';
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
  const projectId = await project(owner.token, '深色主题验收项目');
  await request('/users/me/current-project', owner.token, { projectId }, 'PUT');
  for (const [i, mode] of [
    'cmf',
    'cabin',
    'component',
    'cabin',
    'cmf',
    'component',
  ].entries()) {
    const bytes = await readFile(
      `apps/web-antd/public/design-modes/${mode}.webp`,
    );
    const asset = await request('/assets/uploads', owner.token, {
      projectId,
      name: `${mode} 设计方案 ${i + 1}.webp`,
      filename: `${mode}-${i}.webp`,
      kind: 'image',
      mimeType: 'image/webp',
      sizeBytes: bytes.length,
    });
    const upload = await fetch(asset.upload.url, {
      method: 'PUT',
      headers: asset.upload.headers,
      body: bytes,
    });
    assert.ok(upload.ok);
    await request(`/assets/${asset.asset.id}/complete`, owner.token, {});
  }
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
  });
  const context = await browser.newContext({
    viewport: { width: 1500, height: 1200 },
    locale: 'zh-CN',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (entry) => {
    if (entry.type() === 'error') errors.push(entry.text());
  });
  await page.goto(`${web}/auth/login`);
  const inputs = page.locator('form input:visible');
  await inputs.nth(0).fill(owner.username);
  await inputs.nth(1).fill(owner.password);
  await page.locator('button').filter({ hasText: '登录' }).last().click();
  await page.waitForURL('**/home');
  await page.goto(`${web}/assets`);
  await page.locator('.asset-card img').first().waitFor();
  await page.locator('#__app-loading__').waitFor({ state: 'detached' });
  const bg = async (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  assert.equal(await bg('.asset-browser'), 'rgb(255, 255, 255)');
  await page.screenshot({ path: `${out}/assets-light.png`, fullPage: true });
  await page.locator('.theme-toggle').first().click();
  await page.waitForFunction(() =>
    document.documentElement.classList.contains('dark'),
  );
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector('.asset-browser') as Element)
        .backgroundColor === 'rgb(25, 28, 32)',
  );
  for (const selector of [
    '.assets-page',
    '.asset-browser',
    '.asset-module-rail',
    '.asset-browser__content',
    '.embedded-sidebar-surface',
    '.asset-card',
  ])
    assert.equal(await bg(selector), 'rgb(25, 28, 32)', selector);
  assert.equal(
    await page
      .locator('.asset-module-rail')
      .evaluate((el) => getComputedStyle(el).borderRightWidth),
    '0px',
  );
  assert.equal(
    await page
      .locator('.asset-browser')
      .evaluate((el) => getComputedStyle(el).borderTopColor),
    'rgba(0, 0, 0, 0)',
  );
  const imageStyle = await page
    .locator('.asset-card img')
    .first()
    .evaluate((el) => ({
      filter: getComputedStyle(el).filter,
      opacity: getComputedStyle(el).opacity,
    }));
  assert.deepEqual(imageStyle, { filter: 'none', opacity: '1' });
  const text = await page
    .locator('.asset-page-header h1')
    .evaluate((el) => getComputedStyle(el).color);
  assert.equal(text, 'rgb(232, 235, 239)');
  await page.screenshot({ path: `${out}/assets-dark.png`, fullPage: true });
  pass(
    '真实浏览器：浅色保持白底；夜览后三层主体与卡片严格同为 #191c20；边框消隐、标题提亮、图片无滤镜且不透明',
  );
  await page.getByRole('button', { name: '筛选', exact: true }).click();
  await page.locator('.ant-drawer:visible').waitFor();
  const drawerBg = await bg('.ant-drawer:visible .ant-drawer-content');
  assert.notEqual(drawerBg, 'rgb(255, 255, 255)');
  await page.screenshot({ path: `${out}/filter-dark.png`, fullPage: true });
  await page.locator('.ant-drawer-close').click();
  await page.reload();
  await page.locator('.asset-card img').first().waitFor();
  assert.equal(await bg('.asset-browser'), 'rgb(25, 28, 32)');
  pass('筛选抽屉适配深色，刷新后主题持久化');
  await page
    .getByRole('button', { name: '打开 AI 设计助手', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'AI 设计助手', exact: true })
    .waitFor();
  assert.equal(await bg('.rail-ai-assistant'), 'rgb(25, 28, 32)');
  await page.screenshot({ path: `${out}/assistant-dark.png`, fullPage: true });
  await page
    .getByRole('button', { name: '关闭 AI 设计助手', exact: true })
    .click();
  pass('全局 AI 助手面板保持深色，打开与关闭正常');
  const bright: Record<string, unknown> = {};
  for (const [path, selector] of [
    ['/home', '.home-page'],
    ['/projects', '.workbench-page'],
    ['/projects/manage', '.projects-overview-page'],
    ['/design', '.design-page'],
    ['/model-training', '.training-page'],
    ['/report-generation', '.report-page'],
    ['/jobs', '.jobs-page'],
  ] as const) {
    await page.goto(`${web}${path}`);
    await page.locator(selector).waitFor();
    await page.locator('#__app-loading__').waitFor({ state: 'detached' });
    const entries = await page.locator(selector).evaluate((root) =>
      [root, ...root.querySelectorAll('*')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const css = getComputedStyle(el);
          const rgb = css.backgroundColor.match(/[\d.]+/g)?.map(Number);
          return (
            r.width * r.height > 12_000 &&
            r.width > 100 &&
            r.height > 60 &&
            rgb &&
            rgb.length >= 3 &&
            (rgb[3] ?? 1) > 0.8 &&
            Math.min(...rgb.slice(0, 3)) > 180
          );
        })
        .map((el) => ({
          tag: el.tagName,
          class: el.className,
          bg: getComputedStyle(el).backgroundColor,
        }))
        .slice(0, 12),
    );
    bright[path] = entries;
    await page.screenshot({
      path: `${out}/${path.replaceAll('/', '-').slice(1)}-dark.png`,
      fullPage: true,
    });
  }
  await writeFile(`${out}/surface-audit.json`, JSON.stringify(bright, null, 2));
  for (const [path, entries] of Object.entries(bright))
    assert.deepEqual(entries, [], `${path} has bright surfaces`);
  pass(
    '首页、工作台、项目管理、设计、训练、报告、任务页面无残留大面积浅色背景',
  );
  await page.goto(`${web}/assets`);
  await page.locator('.asset-card').first().waitFor();
  await page.setViewportSize({ width: 390, height: 1000 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: `${out}/assets-dark-mobile.png`,
    fullPage: true,
  });
  await page.locator('.theme-toggle').first().click();
  await page.waitForFunction(
    () => !document.documentElement.classList.contains('dark'),
  );
  assert.equal(await bg('.asset-browser'), 'rgb(255, 255, 255)');
  assert.deepEqual(errors, []);
  pass('390px 无横向溢出；切回浅色恢复原白底；零页面及控制台错误');
  await writeFile(
    `${out}/RESULTS.md`,
    `# 统一底色深色主题验收\n\n${new Date().toISOString()}\n\n${evidence.map((item) => `- 通过：${item}`).join('\n')}\n\n使用独立测试账号、项目和真实图片，结束后只清理本轮数据，未调用外部生成服务。\n`,
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
