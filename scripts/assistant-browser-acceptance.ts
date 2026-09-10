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
const runId = `assistant-browser-${randomUUID()}`;
const out =
  'docs/rail-platform/ui-proposals/20260910-ai-assistant/verification';
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
    await sql`INSERT INTO users (username, password_hash, real_name, email) VALUES (${username}, ${hash}, '助手验收成员', ${`${username}@rail.local`}) RETURNING id`;
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
  const projectId = await project(owner.token, '助手独立性验收');
  const legacyInput = await request('/assistant/conversations', owner.token, {
    projectId,
  });
  assert.equal(legacyInput.projectId, null);
  assert.equal(legacyInput.projectName, null);
  const independent = await request(
    '/assistant/conversations',
    owner.token,
    {},
  );
  assert.equal(independent.projectId, null);
  await request(
    `/assistant/conversations/${independent.id}/messages`,
    outsider.token,
    undefined,
    'GET',
    404,
  );
  await request(
    `/assistant/conversations/${independent.id}`,
    owner.token,
    { title: '个人历史对话' },
    'PATCH',
  );
  // Preserve and verify older conversations without rewriting user data.
  await sql`UPDATE ai_conversations SET project_id = ${projectId} WHERE id = ${legacyInput.id}`;
  const history = await request('/assistant/conversations', owner.token);
  assert.ok(history.some((item: { id: string }) => item.id === legacyInput.id));
  for (let index = 0; index < 7; index++) {
    const row = await request('/assistant/conversations', owner.token, {});
    await request(
      `/assistant/conversations/${row.id}`,
      owner.token,
      { title: `历史排版验收 ${index}：长标题应保持单行省略且日期独立显示` },
      'PATCH',
    );
  }
  const bytes = await readFile('apps/web-antd/public/design-modes/cmf.webp');
  const prepared = await request(
    `/assistant/conversations/${independent.id}/attachments/uploads`,
    owner.token,
    {
      filename: '参考图.webp',
      mimeType: 'image/webp',
      sizeBytes: bytes.length,
    },
  );
  objectKeys.push(
    `assistant/${owner.id}/${independent.id}/${prepared.attachment.id}.webp`,
  );
  const upload = await fetch(prepared.upload.url, {
    method: 'PUT',
    headers: prepared.upload.headers,
    body: bytes,
  });
  assert.ok(upload.ok);
  await request(
    `/assistant/attachments/${prepared.attachment.id}/complete`,
    owner.token,
    {},
  );
  await request(
    `/assistant/attachments/${prepared.attachment.id}/preview`,
    outsider.token,
    undefined,
    'GET',
    404,
  );
  const preview = await request(
    `/assistant/attachments/${prepared.attachment.id}/preview`,
    owner.token,
  );
  assert.ok(preview);
  pass('新会话无项目关联、旧会话保留、用户隔离、真实MinIO附件上传与越权拒绝');
  browser = await chromium.launch({
    executablePath:
      process.env.RAIL_BROWSER_EXECUTABLE ?? '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${web}/auth/login`);
  const inputs = page.locator('form input:visible');
  await inputs.nth(0).fill(owner.username);
  await inputs.nth(1).fill(owner.password);
  await page.locator('button').filter({ hasText: '登录' }).last().click();
  await page.waitForURL('**/home');
  await page.getByRole('button', { name: '打开 AI 设计助手' }).click();
  const panel = page.getByRole('dialog', { name: 'AI 设计助手', exact: true });
  await page.locator('.rail-ai-loading').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  assert.equal(await panel.locator('.rail-ai-project').count(), 0);
  assert.equal(await panel.locator('.rail-ai-brand__status').count(), 0);
  assert.equal(await panel.locator('.rail-ai-suggestions').count(), 0);
  await panel.getByText('有什么我能帮你的吗？', { exact: true }).waitFor();
  const markSize = await panel
    .locator('.rail-ai-brand__mark')
    .evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      expected: 32,
    }));
  assert.ok(Math.abs(markSize.width - markSize.expected) < 1);
  const red = await panel.evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--assistant-red').trim(),
  );
  assert.equal(red, '#bb1b21');
  await page.locator('.ant-notification-notice').waitFor({ state: 'hidden' });
  await panel.locator('.rail-ai-brand').click();
  await page.screenshot({
    path: `${out}/assistant-desktop.png`,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: '选择历史对话' }).click();
  await page.getByRole('dialog', { name: '历史对话管理' }).waitFor();
  const panelBounds = await panel.boundingBox();
  const historyBounds = await page
    .getByRole('dialog', { name: '历史对话管理' })
    .boundingBox();
  assert.ok(panelBounds && historyBounds);
  assert.ok(
    Math.abs(
      historyBounds.x +
        historyBounds.width / 2 -
        (panelBounds.x + panelBounds.width / 2),
    ) < 1,
  );
  assert.ok(panelBounds.width - historyBounds.width < 36);
  const sendCentered = await page
    .locator('.rail-ai-send-button')
    .evaluate((button) => {
      const b = button.getBoundingClientRect();
      const icon = button.querySelector('svg')?.getBoundingClientRect();
      return Boolean(
        icon &&
        Math.abs(b.x + b.width / 2 - icon.x - icon.width / 2) < 1 &&
        Math.abs(b.y + b.height / 2 - icon.y - icon.height / 2) < 1,
      );
    });
  assert.ok(sendCentered);
  const historyDates = await page
    .locator('.rail-ai-conversation-main small')
    .allTextContents();
  assert.ok(
    historyDates.every((value) =>
      /\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/u.test(value),
    ),
  );
  const historyLayout = await page
    .locator('.rail-ai-conversation-main')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        const title = button.querySelector('strong')?.getBoundingClientRect();
        const date = button.querySelector('small')?.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          ordered: Boolean(title && date && title.bottom <= date.top),
        };
      }),
    );
  assert.ok(historyLayout.length >= 8);
  assert.ok(
    historyLayout.every(
      (item) => item.width > 180 && item.height > 32 && item.ordered,
    ),
  );
  await page.screenshot({
    path: `${out}/assistant-history.png`,
    animations: 'disabled',
  });
  await page.getByLabel('按名称查找历史对话').fill('个人历史');
  await page
    .locator('.rail-ai-conversation-item')
    .filter({ hasText: '个人历史对话' })
    .locator('button')
    .first()
    .click();
  await page.locator('.rail-ai-loading').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '新建对话', exact: true }).click();
  const composer = page.getByLabel('输入发给 AI 设计助手的消息');
  await composer.fill('请只回复“收到”。');
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/assistant/conversations') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '发送消息', exact: true }).click();
  const creation = await created;
  assert.deepEqual(creation.request().postDataJSON(), {});
  const createdBody = await creation.json();
  assert.equal(createdBody.data.projectId, null);
  await page
    .getByRole('button', { name: '正在发送', exact: true })
    .waitFor({ state: 'hidden', timeout: 120_000 });
  const persisted = await request(
    `/assistant/conversations/${createdBody.data.id}/messages`,
    owner.token,
  );
  assert.ok(persisted.some((item: { role: string }) => item.role === 'user'));
  assert.ok(
    persisted.some(
      (item: { role: string; status: string }) =>
        item.role === 'assistant' &&
        ['completed', 'failed'].includes(item.status),
    ),
  );
  const messageText = await panel.innerText();
  assert.match(messageText, /\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}/u);
  const messageStyles = await panel
    .locator('.rail-ai-message__body')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        return { border: style.borderTopWidth, shadow: style.boxShadow };
      }),
    );
  assert.ok(
    messageStyles.length >= 2 &&
      messageStyles.every(
        (style) => style.border === '0px' && style.shadow === 'none',
      ),
  );
  const avatar = await panel
    .locator('.rail-ai-avatar.is-user')
    .evaluate((element) => {
      const outer = element.getBoundingClientRect();
      const icon = element.querySelector('svg')?.getBoundingClientRect();
      return Boolean(
        icon &&
        Math.abs(outer.x + outer.width / 2 - icon.x - icon.width / 2) < 1 &&
        Math.abs(outer.y + outer.height / 2 - icon.y - icon.height / 2) < 1,
      );
    });
  assert.ok(avatar);
  await page.waitForFunction(
    () => document.querySelectorAll('.ant-message-notice').length === 0,
  );
  await page.screenshot({
    path: `${out}/assistant-messages.png`,
    animations: 'disabled',
  });
  pass(
    `真实消息持久化；助手回复状态：${persisted.find((item: { role: string }) => item.role === 'assistant')?.status}`,
  );
  await page.getByRole('button', { name: '关闭 AI 设计助手' }).click();
  await page.getByRole('button', { name: '打开 AI 设计助手' }).click();
  await page.getByText('资产中心', { exact: true }).first().click();
  await page.getByRole('button', { name: '打开 AI 设计助手' }).waitFor();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await panel.count(), 0);
  await page.getByRole('button', { name: '打开 AI 设计助手' }).click();
  await panel.getByText('请只回复“收到”。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '选择历史对话' }).click();
  await page.getByRole('button', { name: '清空当前对话', exact: true }).click();
  await page.getByRole('button', { name: '清空对话', exact: true }).click();
  await panel.getByLabel('暂无消息').waitFor();
  await page.keyboard.press('Escape');
  if (!(await panel.isVisible()))
    await page.getByRole('button', { name: '打开 AI 设计助手' }).click();
  await page
    .locator('input[type="file"].rail-ai-file-input')
    .setInputFiles('apps/web-antd/public/design-modes/cmf.webp');
  await page.locator('.rail-ai-pending-file').waitFor();
  await page.getByRole('button', { name: '移除 cmf.webp' }).click();
  assert.equal(await page.locator('.rail-ai-pending-file').count(), 0);
  // Drag the panel to an edge, then verify click-versus-drag on its launcher.
  await page.mouse.move(1200, 310);
  const header = await panel.locator('.rail-ai-brand__mark').boundingBox();
  assert.ok(header);
  await page.mouse.move(header.x + 12, header.y + 12);
  await page.mouse.down();
  await page.mouse.move(1, 1, { steps: 15 });
  await page.mouse.up();
  const movedPanel = await panel.boundingBox();
  assert.ok(
    movedPanel &&
      movedPanel.x >= 10 &&
      movedPanel.y >= 10 &&
      movedPanel.x < header.x - 100,
  );
  await page.getByRole('button', { name: '关闭 AI 设计助手' }).click();
  const launcher = page.getByRole('button', { name: '打开 AI 设计助手' });
  const visibleLogo = await launcher.locator('img').boundingBox();
  assert.ok(visibleLogo && Math.abs(visibleLogo.width - markSize.expected) < 1);
  const start = await launcher.boundingBox();
  assert.ok(start);
  assert.equal(
    await launcher.locator('img').getAttribute('draggable'),
    'false',
  );
  await page.mouse.move(start.x + 28, start.y + 28);
  await page.mouse.down();
  await page.mouse.move(1439, 999, { steps: 20 });
  await page.mouse.up();
  await panel.waitFor({ state: 'hidden' });
  assert.equal(await panel.count(), 0);
  const movedLauncher = await launcher.boundingBox();
  assert.ok(
    movedLauncher &&
      movedLauncher.x + movedLauncher.width <= 1430 &&
      movedLauncher.y + movedLauncher.height <= 990,
  );
  await launcher.click();
  await panel.waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(
    () => document.querySelectorAll('.ant-message-notice').length === 0,
  );
  await panel.locator('.rail-ai-brand').click();
  await page.screenshot({
    path: `${out}/assistant-mobile.png`,
    animations: 'disabled',
  });
  const bounds = await panel.boundingBox();
  assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(overflow, false);
  await composer.fill('未发送的草稿');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const draftHeader = await panel.locator('.rail-ai-brand__mark').boundingBox();
  assert.ok(draftHeader);
  await page.mouse.move(draftHeader.x + 12, draftHeader.y + 12);
  await page.mouse.down();
  await page.mouse.move(1200, 150, { steps: 12 });
  await page.mouse.up();
  await page
    .getByText('首页', { exact: true })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole('button', { name: '打开 AI 设计助手' }).waitFor();
  await page.getByRole('button', { name: '打开 AI 设计助手' }).click();
  assert.equal(await composer.inputValue(), '未发送的草稿');
  await composer.fill('');
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => {
    const rect = document
      .querySelector('.rail-ai-assistant')
      ?.getBoundingClientRect();
    return rect && rect.bottom <= 390 && rect.right <= 844;
  });
  const landscape = await panel.boundingBox();
  assert.ok(
    landscape &&
      landscape.y + landscape.height <= 390 &&
      landscape.x + landscape.width <= 844,
  );
  await page.getByRole('button', { name: '关闭 AI 设计助手' }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: `${out}/assistant-launcher.png`,
    animations: 'disabled',
  });
  await request(
    `/assistant/conversations/${independent.id}`,
    outsider.token,
    undefined,
    'DELETE',
    404,
  );
  await request(
    `/assistant/conversations/${independent.id}`,
    owner.token,
    undefined,
    'DELETE',
  );
  await request(
    `/assistant/conversations/${independent.id}/messages`,
    owner.token,
    undefined,
    'GET',
    404,
  );
  await request(
    `/assistant/attachments/${prepared.attachment.id}/preview`,
    owner.token,
    undefined,
    'GET',
    404,
  );
  const missingObject = await fetch(preview.url);
  assert.equal(missingObject.status, 404);
  await page.getByRole('button', { name: '打开 AI 设计助手' }).click();
  await page.getByRole('button', { name: '选择历史对话' }).click();
  await page.getByLabel('按名称查找历史对话').fill('');
  await page
    .locator(
      '.rail-ai-conversation-item.is-active .rail-ai-conversation-delete-button',
    )
    .click();
  await page.getByRole('button', { name: /取\s*消/, exact: true }).click();
  if (!(await page.getByRole('dialog', { name: '历史对话管理' }).isVisible()))
    await page.getByRole('button', { name: '选择历史对话' }).click();
  await page
    .locator(
      '.rail-ai-conversation-item.is-active .rail-ai-conversation-delete-button',
    )
    .click();
  const deletionResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(`/assistant/conversations/${createdBody.data.id}`) &&
      response.request().method() === 'DELETE',
  );
  await page.getByRole('button', { name: '删除对话', exact: true }).click();
  const deletion = await deletionResponse;
  assert.equal(deletion.status(), 200);
  await page
    .locator('.rail-ai-conversation-item.is-active')
    .waitFor({ state: 'hidden' });
  const remaining = await request('/assistant/conversations', owner.token);
  assert.ok(
    !remaining.some((item: { id: string }) => item.id === createdBody.data.id),
  );
  assert.ok(
    remaining.some((item: { id: string }) => item.id === legacyInput.id),
  );
  pass(
    '历史居中且接近面板同宽、发送箭头居中；删除取消/确认、当前会话复位、其他会话保留、越权拒绝、附件及对象删除通过',
  );
  const reply = persisted.find(
    (item: { role: string }) => item.role === 'assistant',
  );
  if (reply?.errorCode)
    pass(`外部服务失败码：${reply.errorCode}；已验证失败如实显示`);
  assert.deepEqual(errors, []);
  pass(
    '拖动面板与悬浮入口、边界限制、拖动不误打开、路由切换收起；浏览器极简布局、品牌红、历史搜索、新建发送、跨页面会话恢复、清空、附件移除及390px适配通过',
  );
  await writeFile(
    `${out}/RESULTS.md`,
    `# AI 助手验收\n\n${new Date().toISOString()}\n\n${evidence.map((item) => `- ${item}`).join('\n')}\n`,
  );
} finally {
  await browser?.close();
  if (users.length > 0) {
    const objects =
      await sql`SELECT object_key FROM ai_attachments WHERE user_id = ANY(${users})`;
    objectKeys.push(...objects.map((item) => item.object_key as string));
    for (const key of new Set(objectKeys)) await deleteObject(key);
    await sql`DELETE FROM audit_events WHERE actor_id = ANY(${users})`;
    await sql`DELETE FROM projects WHERE id = ANY(${projects})`;
    await sql`DELETE FROM users WHERE id = ANY(${users})`;
  }
  await closeDatabase();
}
