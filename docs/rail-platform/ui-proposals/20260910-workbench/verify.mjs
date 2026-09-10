import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
});
const page = await browser.newPage({
  viewport: { width: 1500, height: 1100 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(new URL('preview.html', import.meta.url).href);
const frame = page.frames().find((frame) => frame.parentFrame());
await frame.locator('#wb-content h1').waitFor();
for (const variant of ['a', 'b', 'c']) {
  await frame.locator(`[data-variant=${variant}]`).click();
  await page.waitForTimeout(200);
  await frame.locator('.wb-window').screenshot({
    path: fileURLToPath(new URL(`workbench-${variant}.png`, import.meta.url)),
  });
}
await frame.locator('[data-variant=b]').click();
await frame.locator('[data-tab=assets]').first().click();
assert.equal(await frame.locator('.wb-asset-tile').count(), 2);
await frame.locator('.wb-window').screenshot({
  path: fileURLToPath(new URL('workbench-b-assets.png', import.meta.url)),
});
await frame.locator('[data-variant=c]').click();
await frame.locator('[data-project="1"]').click();
assert.equal(
  await frame.locator('.wb-project-title h2').textContent(),
  '地铁四号线内装优化',
);
for (const width of [1024, 736, 360]) {
  await page.setViewportSize({ width: width + 32, height: 1800 });
  for (const variant of ['a', 'b', 'c']) {
    await frame.locator(`[data-variant=${variant}]`).click();
    const bounds = await frame.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(
      bounds.scroll <= bounds.width + 1,
      `${variant} ${width}: horizontal overflow ${JSON.stringify(bounds)}`,
    );
  }
}
await frame.locator('[data-variant=a]').click();
await frame.locator('[data-result=saved]').click();
assert.equal(await frame.locator('.wb-result').count(), 3);
await frame.locator('[data-taskfilter=running]').click();
assert.equal(await frame.locator('.wb-task').count(), 1);
assert.deepEqual(errors, []);
console.log(
  '3 layouts, B asset tab, project switch, saved filter, running filter and 1024/736/360px width checks passed.',
);
await browser.close();
