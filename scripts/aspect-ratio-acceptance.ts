import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

import {
  closeDatabase,
  useDatabase,
} from '../apps/platform-api/utils/database';
import { hashPassword } from '../apps/platform-api/utils/password';
import { deleteObject } from '../apps/platform-api/utils/storage';

const web = process.env.RAIL_WEB_URL ?? 'http://localhost:5666';
const api = `${web}/api/v1`;
const runId = `aspect-ratio-${randomUUID()}`;
const out =
  'docs/rail-platform/ui-proposals/20260910-aspect-ratio/verification';
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
  const projectId = await project(owner.token, '比例联动验收项目');
  await request('/users/me/current-project', owner.token, { projectId }, 'PUT');
  const conversation = await request('/design-conversations', owner.token, {
    projectId,
  });
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
  const trigger = page.getByRole('button', {
    name: '设置图片比例与尺寸',
    exact: true,
  });
  await trigger.click();
  const panel = page.getByRole('region', { name: '比例与尺寸', exact: true });
  await panel.getByRole('button', { name: '比例 16:9', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.size-trigger')?.textContent?.includes('2048×1152'),
  );
  await panel
    .getByRole('spinbutton', { name: '图片宽度', exact: true })
    .fill('1024');
  await panel
    .getByRole('spinbutton', { name: '图片宽度', exact: true })
    .press('Tab');
  await page.waitForFunction(() =>
    document.querySelector('.size-trigger')?.textContent?.includes('1024×576'),
  );
  await panel
    .getByRole('spinbutton', { name: '图片高度', exact: true })
    .fill('1152');
  await panel
    .getByRole('spinbutton', { name: '图片高度', exact: true })
    .press('Tab');
  await page.waitForFunction(() =>
    document.querySelector('.size-trigger')?.textContent?.includes('2048×1152'),
  );
  await panel.getByRole('button', { name: '比例 9:16', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.size-trigger')?.textContent?.includes('2304×4096'),
  );
  await panel.getByRole('button', { name: '比例 1:1', exact: true }).click();
  await panel.getByRole('button', { name: '解锁比例', exact: true }).click();
  await panel
    .getByRole('spinbutton', { name: '图片高度', exact: true })
    .fill('768');
  await panel
    .getByRole('spinbutton', { name: '图片高度', exact: true })
    .press('Tab');
  await page.waitForFunction(() =>
    document.querySelector('.size-trigger')?.textContent?.includes('2304×768'),
  );
  pass('比例宫格、宽高双向锁定联动、竖图范围调整、解锁自由尺寸');
  await page.screenshot({
    path: `${out}/panel-desktop.png`,
    animations: 'disabled',
  });
  await trigger.click();
  const prompt = page.locator('[data-testid="design-prompt-input"]');
  await prompt.fill('保留已有提示词内容');
  await prompt.press('Tab');
  await page.getByRole('button', { name: '提示词模板', exact: true }).click();
  await page.getByRole('button', { name: '图像尺寸', exact: true }).click();
  await page.getByRole('button', { name: '模板比例 1:1', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.size-trigger')?.textContent?.includes('2304×2304'),
  );
  await page.getByRole('button', { name: '应用到提示词', exact: true }).click();
  await page.waitForFunction(() =>
    document.querySelector('.size-trigger')?.textContent?.includes('2304×2304'),
  );
  assert.equal(
    await prompt.inputValue(),
    '保留已有提示词内容\n画面比例：1:1（2304×2304）。',
  );
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() =>
    document.querySelector('.size-trigger')?.textContent?.includes('2304×2304'),
  );
  assert.equal(
    await prompt.inputValue(),
    '保留已有提示词内容\n画面比例：1:1（2304×2304）。',
  );
  await trigger.click();
  await panel.getByRole('button', { name: '比例 16:9', exact: true }).click();
  await page.waitForFunction(() =>
    (
      document.querySelector(
        '[data-testid="design-prompt-input"]',
      ) as HTMLTextAreaElement
    )?.value.includes('画面比例：16:9（2048×1152）。'),
  );
  await trigger.click();
  await page.getByRole('button', { name: '提示词模板', exact: true }).click();
  await page.getByRole('button', { name: '图像尺寸', exact: true }).click();
  assert.ok(
    await page
      .getByRole('button', { name: '模板比例 16:9', exact: true })
      .evaluate((el) => el.classList.contains('selected')),
  );
  await page.getByRole('button', { name: '模板比例 3:4', exact: true }).click();
  await page.getByRole('button', { name: '应用到提示词', exact: true }).click();
  let currentPrompt = await prompt.inputValue();
  assert.equal(currentPrompt.match(/画面比例：/g)?.length, 1);
  assert.ok(currentPrompt.includes('画面比例：3:4'));
  await trigger.click();
  await panel.getByRole('button', { name: '比例 9:16', exact: true }).click();
  await trigger.click();
  await page.getByRole('button', { name: '提示词模板', exact: true }).click();
  await page.locator('.prompt-template-panel').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `${out}/template-ratios.png`,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '应用到提示词', exact: true }).click();
  currentPrompt = await prompt.inputValue();
  assert.ok(currentPrompt.includes('画面比例：9:16'));
  assert.ok(currentPrompt.includes('保留已有提示词内容'));
  assert.equal(currentPrompt.match(/画面比例：/g)?.length, 1);
  pass(
    '模板比例即时同步、应用比例文本、外部修改更新文本、内部回显、重复应用无重复比例、刷新持久化',
  );
  await trigger.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.waitFor();
  await page.waitForTimeout(300);
  const bounds = await panel.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391);
  await page.screenshot({
    path: `${out}/panel-mobile.png`,
    animations: 'disabled',
  });
  assert.deepEqual(errors, []);
  pass('390px比例面板无横向溢出，控制台无错误');
  await writeFile(
    `${out}/RESULTS.md`,
    `# 比例尺寸联动验收\n\n${evidence.map((item) => `- 通过：${item}`).join('\n')}\n\n测试不触发生图，不修改正式模板；临时账号、项目及会话在结束时清理。\n`,
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
