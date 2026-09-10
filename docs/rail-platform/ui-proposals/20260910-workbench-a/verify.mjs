import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1200 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(new URL('preview.html', import.meta.url).href);
  const frame = page.frames().find((frame) => frame.parentFrame());
  await frame.locator('#wb-content h1').waitFor();
  for (const [index, variant] of ['a', 'b', 'c'].entries()) {
    await frame.locator(`[data-variant=${variant}]`).click();
    await page.waitForTimeout(150);
    await frame.locator('.wb-window').screenshot({
      path: fileURLToPath(
        new URL(`workbench-a${index + 1}.png`, import.meta.url),
      ),
    });
    await frame.locator('[data-taskfilter=running]').click();
    assert.equal(await frame.locator('.wb-task').count(), 1);
    if (variant !== 'b') {
      await frame.locator('[data-result=saved]').click();
      assert.equal(await frame.locator('.wb-result').count(), 3);
    } else {
      assert.equal(await frame.locator('.wb-saved-item').count(), 3);
    }
  }
  for (const width of [1024, 736, 360]) {
    await page.setViewportSize({ width: width + 32, height: 2000 });
    for (const variant of ['a', 'b', 'c']) {
      await frame.locator(`[data-variant=${variant}]`).click();
      const bounds = await frame.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      assert.ok(
        bounds.scroll <= bounds.width + 1,
        `${variant} ${width}: overflow ${JSON.stringify(bounds)}`,
      );
    }
  }
  assert.deepEqual(errors, []);
  console.log(
    'A1/A2/A3 screenshots, task filters, saved views and 1024/736/360px layout passed.',
  );
} finally {
  await browser.close();
}
