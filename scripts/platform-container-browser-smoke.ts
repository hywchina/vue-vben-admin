import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const webUrl = process.env.RAIL_WEB_URL ?? 'http://127.0.0.1:18080';
const output = resolve(
  process.env.RAIL_BROWSER_OUTPUT ?? '.rail-platform-runtime/container-browser',
);
const username = process.env.BOOTSTRAP_ADMIN_USERNAME;
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
assert.ok(
  username && password,
  'Provide validation administrator credentials via environment',
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
  headless: true,
});
const context = await browser.newContext({
  locale: 'zh-CN',
  viewport: { width: 1600, height: 1000 },
});
const page = await context.newPage();
const errors: string[] = [];
const externalRequests: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
const allowedOrigins = new Set([
  new URL(webUrl).origin,
  ...(process.env.S3_PUBLIC_ENDPOINT
    ? [new URL(process.env.S3_PUBLIC_ENDPOINT).origin]
    : []),
]);
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.protocol.startsWith('http') && !allowedOrigins.has(url.origin)) {
    externalRequests.push(`${url.origin}${url.pathname}`);
    await route.abort('internetdisconnected');
  } else await route.continue();
});
try {
  await page.goto(`${webUrl}/#/auth/login`);
  await page.getByText('欢迎回来 👋🏻').waitFor();
  const inputs = page.locator('form input:visible');
  await inputs.nth(0).fill(username);
  await inputs.nth(1).fill(password);
  await page.locator('button').filter({ hasText: '登录' }).last().click();
  const heading = page.getByRole('heading', {
    name: /让客室内装设计\s*更聚焦、更高效/,
  });
  await heading.waitFor();
  await page.locator('#__app-loading__').waitFor({ state: 'detached' });
  await page
    .locator('[data-app-loading^="inject"]')
    .waitFor({ state: 'detached' });
  await page.waitForLoadState('networkidle');
  await page.screenshot({
    animations: 'disabled',
    path: join(output, 'desktop.png'),
    fullPage: true,
  });
  await page.reload();
  await heading.waitFor();
  await page.locator('#__app-loading__').waitFor({ state: 'detached' });
  await page
    .locator('[data-app-loading^="inject"]')
    .waitFor({ state: 'detached' });
  await page.waitForLoadState('networkidle');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    animations: 'disabled',
    path: join(output, 'mobile.png'),
    fullPage: true,
  });
  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(
    externalRequests,
    [],
    'Page attempted an external network request',
  );
  await writeFile(
    join(output, 'results.json'),
    JSON.stringify(
      {
        login: true,
        reload: true,
        errors,
        externalRequests,
      },
      null,
      2,
    ),
  );
  console.warn(
    'Browser validation passed: login, reload, desktop/mobile, no external requests',
  );
} finally {
  await browser.close();
}
