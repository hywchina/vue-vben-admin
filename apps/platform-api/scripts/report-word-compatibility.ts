/* oxlint-disable unicorn/prefer-dom-node-remove -- @xmldom implements XML DOM Level 2, not ChildNode.remove. */
import type { RenderReportInput } from '../utils/domain/capabilities/report/renderer';

import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { createReportSchema } from '../utils/domain/capabilities/report/schema';
import { planTemplateReport } from '../utils/domain/capabilities/report/templates/ai-plan';
import {
  children,
  closeOfficePackage,
  NS,
  openOfficePackage,
  readXml,
  writeXml,
} from '../utils/domain/capabilities/report/templates/package';
import { renderOfficeTemplate } from '../utils/domain/capabilities/report/templates/renderer';
import { getStarterTemplate } from '../utils/domain/capabilities/report/templates/starters';

const exec = promisify(execFile);
const output = resolve(process.argv[2] ?? 'tmp/report-word-compatibility');
const office = process.env.RAIL_REPORT_LIBREOFFICE;
if (!office)
  throw new Error(
    'Set RAIL_REPORT_LIBREOFFICE to an isolated LibreOffice 24.2 Writer executable',
  );
const versionResult = await exec(office, ['--version']);
const version = versionResult.stdout.trim();
assert.match(
  version,
  /LibreOffice 24\.2\./u,
  'Compatibility gate requires LibreOffice 24.2, not another version',
);
const liveUrl = process.env.RAIL_REPORT_AI_API_URL;
const aiValidation = liveUrl ? 'live-model' : 'protocol-fixture';
const scratch = await mkdtemp(join(tmpdir(), 'rail-word-compat-'));
const colours = [
  [231, 37, 62],
  [27, 165, 94],
  [35, 87, 217],
  [242, 189, 31],
] as const;

const TEST_IMAGE =
  'iVBORw0KGgoAAAANSUhEUgAAAZAAAADwCAIAAAChXqV1AAADTklEQVR4nO3WMQ3CUABFUUoQwciCgYaRMFZXfSAMCdjAAkOTn/tzjoI33bzle3+d4GiP/TZ6AhM6jx4A8C/BAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyBAsIEOwgAzBAjIEC8gQLCBDsIAMwQIyBAvIECwgQ7CADMECMgQLyLg81/foDUzoc91GT2BCHhaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZggVkCBaQIVhAhmABGYIFZAgWkCFYQIZgARmCBWQIFpAhWECGYAEZP73tBj5UwflzAAAAAElFTkSuQmCC';
// Four coloured quadrants detect the original thin-strip clipping in actual
// rendered pixels, rather than just checking ZIP validity or PDF page count.
function fullImages(ppm: Buffer) {
  let offset = 0;
  function token() {
    while (ppm[offset] && (ppm[offset] ?? 0) <= 32) offset++;
    const start = offset;
    while (ppm[offset] && (ppm[offset] ?? 0) > 32) offset++;
    return ppm.subarray(start, offset).toString();
  }
  assert.equal(token(), 'P6');
  const width = Number(token());
  const height = Number(token());
  assert.equal(token(), '255');
  offset++;
  const pixels = ppm.subarray(offset);
  assert.equal(pixels.length, width * height * 3);
  const counts = colours.map(() => 0);
  const rows: number[] = [];
  let inImage = false;
  for (let y = 0; y < height; y++) {
    let red = 0;
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 3;
      const matched = colours.findIndex((colour) =>
        colour.every(
          (channel, c) => Math.abs(channel - (pixels[index + c] ?? 0)) < 8,
        ),
      );
      if (matched !== -1) counts[matched] = (counts[matched] ?? 0) + 1;
      if (matched === 0) red++;
    }
    if (red >= 30) {
      if (!inImage) rows.push(0);
      rows[rows.length - 1] = (rows.at(-1) ?? 0) + 1;
      inImage = true;
    } else inImage = false;
  }
  const complete = rows.filter((rows) => rows >= 20).length;
  if (complete)
    for (const count of counts)
      assert.ok(
        count >= complete * 600,
        'A quadrant was clipped from a rendered image',
      );
  return complete;
}

await mkdir(output, { recursive: true });
try {
  const bytes = Buffer.from(TEST_IMAGE, 'base64');
  const imageId = '11111111-1111-4111-8111-111111111112';
  const report: RenderReportInput = {
    assets: new Map([
      [
        imageId,
        {
          bytes,
          filename: 'compatibility-grid.png',
          id: imageId,
          mimeType: 'image/png',
          name: '兼容性检查图',
        },
      ],
    ]),
    createdAt: new Date('2026-11-22T00:00:00Z'),
    projectName: '工业设计排版验证',
    parameters: createReportSchema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      name: 'Word 兼容性验收',
      format: 'docx',
      reportType: 'design-proposal',
      title: '快速有轨电车工业设计方案',
      summary:
        '本报告验证设计思路与方案呈现的图文排版；图中四个色块用于检测图片是否被裁切。工程状态仍待确认。',
      sections: [
        {
          title: '第一部分 设计思路',
          body: '方案以功能性和实用性为基础，组织客室内装、色彩与材料的设计表达。通道宽度暂定为 800 mm，尚未完成工程验证。\n\n后续需结合样件与评审意见进行调整，不能将示意图视为已完成的测试结果。',
          images: [
            { assetId: imageId, caption: '设计思路配图 A' },
            { assetId: imageId, caption: '设计思路配图 B' },
          ],
        },
        {
          title: '第二部分 方案呈现',
          body: '三组配图用于展示方案层次和不同细节。图片均须完整保留，不裁掉边缘；布局与文字仍供评审确认。',
          images: Array.from({ length: 3 }, (_, index) => ({
            assetId: imageId,
            caption: `方案呈现配图 ${index + 1}`,
          })),
        },
      ],
    }),
  };
  const starter = await getStarterTemplate('docx');
  await writeFile(join(output, 'starter-report.docx'), starter.source);
  const results = [];
  for (const mode of ['template', 'ai'] as const) {
    const source = {
      ...report,
      parameters: { ...report.parameters, generationMode: mode },
    };
    const planned =
      mode === 'ai'
        ? await planTemplateReport(source, starter.snapshot, {
            apiUrl:
              liveUrl ?? 'http://protocol-fixture.invalid/api/v1/generate-file',
            timeoutMs: 240_000,
            ...(liveUrl
              ? {}
              : {
                  fetchImplementation: async () =>
                    Response.json({
                      sections: source.parameters.sections.map(
                        (section, id) => ({
                          id,
                          body: section.body,
                          image_ids: section.images.map(
                            (_, index) => `${id}:${index}`,
                          ),
                        }),
                      ),
                    }),
                }),
          })
        : source;
    await writeFile(
      join(output, `${mode}-content.json`),
      JSON.stringify(planned.parameters, null, 2),
    );
    const cases =
      mode === 'template'
        ? [
            'design-template',
            'uploaded-exact-line',
            'clipping-negative-control',
          ]
        : ['design-template', 'uploaded-exact-line'];
    for (const testCase of cases) {
      const legacy = testCase !== 'design-template';
      const negativeControl = testCase === 'clipping-negative-control';
      const template = legacy
        ? await getStarterTemplate('docx', 'contract')
        : starter;
      const files = openOfficePackage(template.source);
      if (legacy) {
        const styles = readXml(files, 'word/styles.xml');
        const spacing = children(styles, NS.w, 'spacing').find((node) =>
          node.hasAttributeNS(NS.w, 'line'),
        );
        assert.ok(spacing);
        spacing.setAttributeNS(NS.w, 'w:lineRule', 'exact');
        spacing.setAttributeNS(NS.w, 'w:line', '240');
        writeXml(files, 'word/styles.xml', styles);
      }
      const name = `${mode}-${testCase}`;
      const artifact = await renderOfficeTemplate(
        planned,
        template.snapshot,
        closeOfficePackage(files),
      );
      if (negativeControl) {
        // Reintroduce only the original clipping defect to prove the pixel
        // gate rejects it. This deliberately broken file is never a deliverable.
        const broken = openOfficePackage(artifact.bytes);
        const document = readXml(broken, 'word/document.xml');
        for (const paragraph of children(document, NS.w, 'p').filter(
          (node) => children(node, NS.w, 'drawing').length,
        )) {
          for (const spacing of children(paragraph, NS.w, 'spacing'))
            spacing.parentNode?.removeChild(spacing);
        }
        writeXml(broken, 'word/document.xml', document);
        artifact.bytes = closeOfficePackage(broken);
      }
      const docx = join(output, `${name}.docx`);
      await writeFile(docx, artifact.bytes);
      const profile = await mkdtemp(join(scratch, 'profile-'));
      const conversion = await exec(
        office,
        [
          `-env:UserInstallation=${pathToFileURL(profile).href}`,
          '--headless',
          '--norestore',
          '--convert-to',
          'pdf',
          '--outdir',
          output,
          docx,
        ],
        { timeout: 120_000 },
      );
      await writeFile(
        join(output, `${name}.log`),
        conversion.stdout + conversion.stderr,
      );
      const pdf = join(output, `${name}.pdf`);
      const infoResult = await exec('pdfinfo', [pdf]);
      const info = infoResult.stdout;
      const pages = Number(/^Pages:\s+(\d+)/mu.exec(info)?.[1]);
      assert.ok(pages > 0);
      const textResult = await exec('pdftotext', [pdf, '-']);
      const text = textResult.stdout;
      for (const section of planned.parameters.sections) {
        assert.ok(
          text.includes(section.title),
          'Chapter title missing from rendered document',
        );
        for (const image of section.images)
          assert.ok(
            text.includes(image.caption),
            'Image caption missing from rendered document',
          );
        for (const number of section.body.match(/\d+(?:\.\d+)?/gu) ?? [])
          assert.ok(text.includes(number), 'Source number missing');
      }
      const raster = join(scratch, name);
      await mkdir(raster);
      await exec('pdftoppm', ['-r', '45', pdf, join(raster, 'page')], {
        timeout: 120_000,
      });
      let images = 0;
      for (const file of await readdir(raster))
        if (file.endsWith('.ppm'))
          images += fullImages(await readFile(join(raster, file)));
      assert.equal(
        images,
        negativeControl ? 0 : 5,
        `${name}: rendered images are missing or clipped`,
      );
      results.push({
        name,
        pages,
        fullImages: images,
        ai: mode === 'ai' ? aiValidation : 'not-used',
      });
      console.warn(`PASS ${name}: ${pages} pages, ${images} full images`);
    }
  }
  await writeFile(
    join(output, 'compatibility.json'),
    JSON.stringify(
      {
        office: version,
        aiValidation: liveUrl ? 'live-model' : 'protocol-fixture',
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
