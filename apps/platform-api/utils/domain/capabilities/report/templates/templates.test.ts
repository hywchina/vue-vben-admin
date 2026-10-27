import type { RenderReportInput } from '../renderer';
import type { TemplateRole } from './schema';

import { Buffer } from 'node:buffer';

import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { createReportSchema } from '../schema';
import { planTemplateReport } from './ai-plan';
import {
  children,
  inspectOfficeTemplate,
  NS,
  openOfficePackage,
  readXml,
  slideParts,
} from './package';
import { renderOfficeTemplate, validateTemplateInput } from './renderer';
import { validateTemplateBindings } from './repository';
import { requireTemplateValue } from './required';
import { getStarterTemplate } from './starters';
const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
    'base64',
  ),
);
function input(): RenderReportInput {
  const ids = Array.from(
    { length: 20 },
    (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
  );
  return {
    createdAt: new Date('2026-10-27T00:00:00Z'),
    projectName: '验证项目',
    parameters: createReportSchema.parse({
      projectId: '11111111-1111-4111-8111-111111111111',
      name: '验证报告',
      title: '客室方案验证',
      summary: '评估照明与座椅方案，结果仍待确认。',
      format: 'docx',
      reportType: 'design-proposal',
      sections: [
        {
          title: '设计约束',
          body: '通道宽度暂定为 800 mm，尚未完成试验。\n保留安全条件和待验证状态。',
          images: ids.map((assetId, index) => ({
            assetId,
            caption: `方案示意 ${index + 1}`,
          })),
        },
        { title: '后续验证', body: '结合样件继续验证。', images: [] },
      ],
    }),
    assets: new Map(
      ids.map((id) => [
        id,
        {
          bytes: png,
          filename: 'seat.png',
          id,
          mimeType: 'image/png',
          name: '座椅示意',
        },
      ]),
    ),
  };
}
describe('native reviewed report templates', () => {
  it('discovers native positions and rejects invalid packages and XML entities', async () => {
    const starter = await getStarterTemplate('docx');
    expect(
      starter.snapshot.manifest.elements.map((item) => item.role),
    ).toContain('section-body');
    expect(() => inspectOfficeTemplate(starter.source, 'pptx')).toThrow('格式');
    expect(() =>
      inspectOfficeTemplate(
        zipSync({
          '[Content_Types].xml': strToU8(
            '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><x/>',
          ),
        }),
      ),
    ).toThrow('DTD');
    expect(() =>
      inspectOfficeTemplate(
        zipSync({
          '[Content_Types].xml': strToU8('<x/>'),
          'word/vbaProject.bin': png,
        }),
      ),
    ).toThrow('宏');
    expect(() =>
      inspectOfficeTemplate(
        zipSync({ '[Content_Types].xml': strToU8('<x/>'), '../source': png }),
      ),
    ).toThrow('路径');
    expect(() =>
      inspectOfficeTemplate(
        zipSync({
          '[Content_Types].xml': strToU8(
            `<Types xmlns="${NS.types}"><Override PartName="/word/renamed.bin" ContentType="application/vnd.ms-office.vbaProject"/></Types>`,
          ),
          'word/renamed.bin': png,
        }),
      ),
    ).toThrow('宏');
  });
  it('preserves Word styles, footer and section properties while expanding two chapters and all 20 images', async () => {
    const starter = await getStarterTemplate('docx');
    const original = openOfficePackage(starter.source);
    const output = await renderOfficeTemplate(
      input(),
      starter.snapshot,
      starter.source,
    );
    const files = openOfficePackage(output.bytes);
    expect(files['word/styles.xml']).toEqual(original['word/styles.xml']);
    expect(
      children(
        readXml(files, 'word/settings.xml'),
        NS.w,
        'updateFields',
      )[0]?.getAttributeNS(NS.w, 'val'),
    ).toBe('true');
    const footer = requireTemplateValue(
      Object.keys(original).find((key) => /^word\/footer\d+\.xml$/u.test(key)),
    );
    expect(files[footer]).toEqual(original[footer]);
    const doc = readXml(files, 'word/document.xml');
    const texts = children(doc, NS.w, 't')
      .map((item) => item.textContent)
      .join('\n');
    expect(texts).toContain('800 mm');
    expect(texts).toContain('后续验证');
    expect(texts).not.toContain('{{');
    expect(children(doc, NS.w, 'drawing')).toHaveLength(20);
    expect(
      Object.keys(files).filter((name) =>
        name.startsWith('word/media/railImage'),
      ),
    ).toHaveLength(20);
    expect(children(doc, NS.w, 'sectPr')).toHaveLength(1);
    const rels = readXml(files, 'word/_rels/document.xml.rels');
    for (const blip of children(doc, NS.a, 'blip'))
      expect(
        children(rels, NS.rel, 'Relationship').some(
          (rel) =>
            rel.getAttribute('Id') === blip.getAttributeNS(NS.r, 'embed'),
        ),
      ).toBe(true);
  });
  it('preserves PPT masters/theme and expands every image without reducing font sizes', async () => {
    const starter = await getStarterTemplate('pptx');
    const original = openOfficePackage(starter.source);
    const renderInput = input();
    renderInput.parameters.format = 'pptx';
    requireTemplateValue(renderInput.parameters.sections[0]).body +=
      '需要保留的设计说明。'.repeat(120);
    const output = await renderOfficeTemplate(
      renderInput,
      starter.snapshot,
      starter.source,
    );
    const files = openOfficePackage(output.bytes);
    for (const part of Object.keys(original).filter(
      (name) =>
        name.startsWith('ppt/slideMasters/') || name.startsWith('ppt/theme/'),
    ))
      expect(files[part]).toEqual(original[part]);
    const slides = slideParts(files);
    expect(slides.length).toBeGreaterThanOrEqual(7);
    let pictures = 0;
    let allText = '';
    for (const part of slides) {
      const doc = readXml(files, part);
      pictures += children(doc, NS.p, 'pic').length;
      allText += children(doc, NS.a, 't')
        .map((item) => item.textContent)
        .join('');
    }
    expect(pictures).toBe(20);
    expect(allText).toContain('后续验证');
    expect(allText).not.toContain('{{');
    expect((allText.match(/需要保留的设计说明。/gu) ?? []).length).toBe(120);
    const bodyFontSizes = slides
      .slice(1)
      .flatMap((part) =>
        children(readXml(files, part), NS.a, 'rPr').map((node) =>
          node.getAttribute('sz'),
        ),
      );
    expect(bodyFontSizes).toContain('1700');
  });
  it('paginates many short lines without losing text or duplicating repeated media', async () => {
    const starter = await getStarterTemplate('pptx');
    const renderInput = input();
    renderInput.parameters.format = 'pptx';
    renderInput.parameters.sections = [
      {
        title: '多行正文',
        body: Array.from(
          { length: 65 },
          (_, index) => `段落标识${index + 1}。`,
        ).join('\n'),
        images: Array.from({ length: 20 }, (_, index) => ({
          assetId: requireTemplateValue(
            requireTemplateValue(renderInput.parameters.sections[0]).images[0],
          ).assetId,
          caption: `图 ${index + 1}`,
        })),
      },
    ];
    const output = await renderOfficeTemplate(
      renderInput,
      starter.snapshot,
      starter.source,
    );
    const files = openOfficePackage(output.bytes);
    const parts = slideParts(files);
    const text = parts
      .flatMap((part) =>
        children(readXml(files, part), NS.a, 't').map(
          (node) => node.textContent,
        ),
      )
      .join('');
    for (let index = 1; index <= 65; index++)
      expect(text).toContain(`段落标识${index}。`);
    expect(
      Object.keys(files).filter((part) =>
        part.startsWith('ppt/media/railImage'),
      ),
    ).toHaveLength(1);
    expect(
      parts.flatMap((part) => children(readXml(files, part), NS.p, 'pic')),
    ).toHaveLength(20);
  });
  it('fills an existing Word picture position with a caption even without a caption-style slot', async () => {
    const starter = await getStarterTemplate('docx');
    const first = input();
    first.parameters.sections = [
      {
        ...requireTemplateValue(first.parameters.sections[0]),
        images: [
          {
            ...requireTemplateValue(
              requireTemplateValue(first.parameters.sections[0]).images[0],
            ),
            caption: '',
          },
        ],
      },
    ];
    const seed = await renderOfficeTemplate(
      first,
      starter.snapshot,
      starter.source,
    );
    const manifest = inspectOfficeTemplate(seed.bytes, 'docx');
    const section = requireTemplateValue(first.parameters.sections[0]);
    const bindings = manifest.elements.map((element) => {
      let role: TemplateRole = 'fixed';
      if (element.kind === 'image') role = 'images';
      else if (element.text === first.parameters.title) role = 'title';
      else if (element.text === first.parameters.summary) role = 'summary';
      else if (element.text === section.title) role = 'section-title';
      else if (element.text.includes('800 mm')) role = 'section-body';
      return { id: element.id, fieldName: '', sectionIndex: 0, role };
    });
    requireTemplateValue(section.images[0]).caption = '新的图注';
    const output = await renderOfficeTemplate(
      first,
      {
        ...starter.snapshot,
        manifest,
        configuration: { repeatSections: false, bindings },
      },
      seed.bytes,
    );
    const doc = readXml(openOfficePackage(output.bytes), 'word/document.xml');
    expect(children(doc, NS.w, 'drawing')).toHaveLength(1);
    expect(
      children(doc, NS.w, 't').filter(
        (node) => node.textContent === '新的图注',
      ),
    ).toHaveLength(1);
  });
  it('does not include source template text in errors that may enter audits', async () => {
    const starter = await getStarterTemplate('pptx');
    const snapshot = structuredClone(starter.snapshot);
    const title = requireTemplateValue(
      snapshot.manifest.elements.find((item) => item.role === 'title'),
    );
    title.text = '不应写入日志的模板正文';
    const report = input();
    report.parameters.title = '超长标题'.repeat(35);
    const generated = renderOfficeTemplate(report, snapshot, starter.source);
    await expect(generated).rejects.toThrow('模板位置');
    await expect(generated).rejects.not.toThrow(title.text);
    await expect(generated).rejects.not.toThrow(report.parameters.title);
  });
  it('rejects layouts that would silently lose pictures or overflow fixed pages', async () => {
    const starter = await getStarterTemplate('pptx');
    const snapshot = structuredClone(starter.snapshot);
    snapshot.configuration.bindings = snapshot.configuration.bindings.filter(
      (item) => item.role !== 'images',
    );
    expect(() => validateTemplateInput(snapshot, input().parameters)).toThrow(
      '图片位置',
    );
    snapshot.configuration = structuredClone(starter.snapshot.configuration);
    snapshot.configuration.repeatSections = false;
    expect(() => validateTemplateInput(snapshot, input().parameters)).toThrow(
      '容量',
    );
  });
  it('rejects unknown blocks and multiple repeating source slide layouts', async () => {
    const starter = await getStarterTemplate('pptx');
    const config = structuredClone(starter.snapshot.configuration);
    config.bindings.push({
      id: 'missing',
      role: 'value',
      fieldName: '甲方',
      sectionIndex: 0,
    });
    expect(() =>
      validateTemplateBindings(starter.snapshot.manifest, config),
    ).toThrow('不存在');
    config.bindings.pop();
    requireTemplateValue(
      config.bindings.find((item) => item.role === 'summary'),
    ).role = 'section-body';
    expect(() =>
      validateTemplateBindings(starter.snapshot.manifest, config),
    ).toThrow('章节标题');
  });
  it('uses independent AI plan endpoint, freezes titles, preserves image IDs and numeric facts', async () => {
    const starter = await getStarterTemplate('docx');
    const renderInput = input();
    let calledUrl = '';
    const planned = await planTemplateReport(renderInput, starter.snapshot, {
      apiUrl: 'http://report.local/api/v1/generate-file/',
      timeoutMs: 1000,
      fetchImplementation: async (url, init) => {
        calledUrl = String(url);
        const form = requireTemplateValue(init?.body) as FormData;
        const source = JSON.parse(String(form.get('source')));
        expect(source.preview_ids).toHaveLength(4);
        expect(source.sections[0].images).toHaveLength(20);
        return Response.json({
          sections: renderInput.parameters.sections.map((section, id) => ({
            id,
            body: section.body,
            image_ids: section.images
              .map((_, index) => `${id}:${index}`)
              .toReversed(),
          })),
        });
      },
    });
    expect(calledUrl).toBe(
      'http://report.local/api/v1/generate-file/template-plan',
    );
    expect(planned.parameters.title).toBe(renderInput.parameters.title);
    expect(
      requireTemplateValue(
        requireTemplateValue(planned.parameters.sections[0]).images[0],
      ).assetId,
    ).toBe(
      requireTemplateValue(
        requireTemplateValue(renderInput.parameters.sections[0]).images[19],
      ).assetId,
    );
    await expect(
      planTemplateReport(renderInput, starter.snapshot, {
        apiUrl: 'http://report.local',
        timeoutMs: 1000,
        fetchImplementation: async () =>
          Response.json({
            sections: renderInput.parameters.sections.map((section, id) => ({
              id,
              body: '已完成验证',
              image_ids: section.images.map((_, index) => `${id}:${index}`),
            })),
          }),
      }),
    ).rejects.toThrow('事实');
  });
});
