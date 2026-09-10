import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';

import { chromium } from 'playwright';

const id = `model-export-${randomUUID()}`;
const fixturePath = new URL(`../apps/web-antd/${id}.html`, import.meta.url);
const webUrl = process.env.RAIL_WEB_URL ?? 'http://127.0.0.1:5666';
const fixture = `<!doctype html><html><body><div id="viewer"></div><script type="module">
import { createApp, h } from 'vue';
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import Viewer from '/src/components/platform/model3d-viewer.vue';
import { unmountGlobalLoading } from '@vben/utils';
unmountGlobalLoading();
const model = new Mesh(new BoxGeometry(1, 2, 3), new MeshStandardMaterial({ color: '#b91c32' }));
const glb = await new GLTFExporter().parseAsync(model, { binary: true });
const url = URL.createObjectURL(new Blob([glb]));
createApp({ render: () => h(Viewer, { name: '验收模型.glb', format: 'glb', url }) }).mount('#viewer');
</script></body></html>`;
let browser;
try {
  await writeFile(fixturePath, fixture);
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (event) => {
    if (event.type() === 'error') errors.push(event.text());
  });
  await page.goto(`${webUrl}/${id}.html`);
  await page.locator('[data-model-status="ready"]').waitFor();
  await page.getByRole('button', { name: '导出', exact: true }).click();
  for (const format of ['glb', 'obj', 'stl', 'fbx']) {
    const downloadEvent = page.waitForEvent('download');
    await page
      .getByRole('button', { name: format.toUpperCase(), exact: true })
      .click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), `验收模型.${format}`);
    const bytes = await readFile(await download.path());
    if (format === 'glb') assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    if (format === 'obj') assert.match(bytes.toString(), /^v /m);
    if (format === 'stl') {
      assert.equal(bytes.readUInt32LE(80), 12);
      assert.equal(bytes.length, 84 + 12 * 50);
    }
    if (format === 'fbx') assert.match(bytes.toString(), /FBXVersion: 7400/);
    console.log(
      `${format.toUpperCase()}: real download and file structure passed (${bytes.length} bytes)`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const buttons = page.locator('[aria-label="模型下载格式"] button');
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
  }
  assert.deepEqual(errors, []);
  console.log('390px format buttons and browser console passed');
  await page.goto(webUrl);
  const preferences = await page.evaluate(async () => {
    const response = await fetch('/src/main.ts');
    const source = await response.text();
    const modulePath = source.match(
      /from ["']([^"']*preferences[^"']*)["']/,
    )?.[1];
    if (!modulePath) throw new Error('Cannot locate served preferences module');
    const { preferences } = await import(modulePath);
    return {
      fullscreen: preferences.widget.fullscreen,
      position: preferences.widget.fullscreenButtonPosition,
    };
  });
  assert.deepEqual(preferences, { fullscreen: false, position: 'none' });
  console.log('Platform fullscreen configuration passed');
  await page.evaluate(async () => {
    const response = await fetch('/src/main.ts');
    const source = await response.text();
    const modulePath = source.match(
      /from ["']([^"']*preferences[^"']*)["']/,
    )?.[1];
    const { updatePreferences } = await import(modulePath);
    updatePreferences({
      widget: { fullscreen: true, fullscreenButtonPosition: 'header' },
    });
  });
  await page.reload();
  await page.waitForFunction(async () => {
    const response = await fetch('/src/main.ts');
    const source = await response.text();
    const modulePath = source.match(
      /from ["']([^"']*preferences[^"']*)["']/,
    )?.[1];
    const { preferences } = await import(modulePath);
    return (
      !preferences.widget.fullscreen &&
      preferences.widget.fullscreenButtonPosition === 'none'
    );
  });
  console.log('Old fullscreen preferences are overridden after reload');
} finally {
  await browser?.close();
  await unlink(fixturePath).catch(() => undefined);
}
