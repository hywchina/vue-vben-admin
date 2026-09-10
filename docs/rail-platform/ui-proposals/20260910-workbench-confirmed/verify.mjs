import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.RAIL_BROWSER_EXECUTABLE,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1540, height: 1700 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(new URL('preview.html', import.meta.url).href);
  const frame = page.frames().find((frame) => frame.parentFrame());
  await frame.locator('#wb-content h1').waitFor();
  for (const [i, v] of ['a', 'b', 'c'].entries()) {
    await frame.locator(`button[data-variant=${v}]`).click();
    for (const heading of [
      '我的设计',
      '我的项目资产',
      '最近任务',
      '最近设计成果',
      '最近保存资产',
    ]) {
      assert.equal(
        await frame
          .getByRole('heading', { name: heading, exact: true })
          .count(),
        1,
      );
    }
    assert.equal(await frame.locator('.wf-design').count(), 2);
    assert.equal(await frame.locator('.wf-task').count(), 3);
    assert.equal(await frame.locator('.wf-result').count(), 3);
    assert.equal(await frame.locator('.wf-saved-item').count(), 3);
    await frame.locator('.wb-window').screenshot({
      path: fileURLToPath(new URL(`workbench-0${i + 1}.png`, import.meta.url)),
    });
    await frame.locator('[data-filter=active]').click();
    assert.equal(await frame.locator('.wf-task').count(), 2);
    await frame
      .getByRole('button', { name: '停止', exact: true })
      .first()
      .click();
    assert.match(
      await frame.locator('.wb-next').textContent(),
      /不会取消真实任务/,
    );
  }
  for (const width of [1024, 736, 360]) {
    await page.setViewportSize({ width: width + 32, height: 2000 });
    for (const variant of ['a', 'b', 'c']) {
      await frame.locator(`button[data-variant=${variant}]`).click();
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
    'All five agreed sections visible in all three versions; 1024/736/360px layouts, execution filter and inert stop action passed.',
  );
} finally {
  await browser.close();
}
