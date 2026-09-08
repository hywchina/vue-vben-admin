const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/* Export the authoritative HTML SVG using the bundled Playwright runtime.
 * Resolve packages through NODE_PATH; do not bake machine-specific paths in.
 */
const { chromium } = require('playwright');

(async () => {
  const dir = path.resolve(__dirname, '../assets/v2-3');
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.REPORT_CHROME_PATH
      ? { executablePath: process.env.REPORT_CHROME_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1000, height: 1100 },
    deviceScaleFactor: 3,
  });
  const checks = [];
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .sort()) {
    const source = path.join(dir, file);
    await page.goto(pathToFileURL(source).href);
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(() => {
      const root = document.querySelector('svg');
      const bounds = root.viewBox.baseVal;
      return [...root.querySelectorAll('text')]
        .map((t) => {
          const b = t.getBBox();
          return {
            text: t.textContent,
            x: b.x,
            y: b.y,
            w: b.width,
            h: b.height,
          };
        })
        .filter(
          (b) =>
            b.x < 24 ||
            b.y < 0 ||
            b.x + b.w > bounds.width - 24 ||
            b.y + b.h > bounds.height,
        );
    });
    if (result.length)
      throw Error(`${file}: text bounds ${JSON.stringify(result)}`);
    await page.locator('svg').screenshot({
      path: source.replace('.html', '.png'),
      omitBackground: true,
    });
    const svg = fs
      .readFileSync(source, 'utf8')
      .match(/<svg\b[\s\S]*?<\/svg>/)[0];
    fs.writeFileSync(
      source.replace('.html', '.svg'),
      '<?xml version="1.0" encoding="UTF-8"?>\n' + svg,
    );
    checks.push({ file, overflow: result.length });
  }
  await browser.close();
  process.stdout.write(JSON.stringify(checks, null, 2) + '\n');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
