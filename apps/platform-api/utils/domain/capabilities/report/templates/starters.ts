import type { TemplateSnapshot } from './repository';

import { createHash } from 'node:crypto';

import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx';
import pptxgen from 'pptxgenjs';

import { inspectOfficeTemplate } from './package';

export const STARTER_NAMES = {
  report: '工程设计报告',
  contract: '合同编制参考',
  patent: '专利技术交底书',
  bid: '投标响应文件参考',
} as const;
export type StarterKind = keyof typeof STARTER_NAMES;
const cache = new Map<
  string,
  Promise<{ snapshot: TemplateSnapshot; source: Uint8Array }>
>();

/** Native Office masters/styles are the source of truth for both generation modes. */
export function getStarterTemplate(
  format: 'docx' | 'pptx',
  kind: StarterKind = 'report',
) {
  const key = `${format}:${kind}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = build(format, kind);
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  return pending;
}
async function build(format: 'docx' | 'pptx', kind: StarterKind) {
  let source: Uint8Array;
  if (format === 'docx') {
    const paragraph = (text: string, options = {}) =>
      new Paragraph({ children: [new TextRun(text)], ...options });
    const notes = {
      contract:
        '合同主体、金额、期限及责任等应依据真实资料填写，并由相关负责人审阅。',
      patent:
        '围绕技术问题、技术方案、实施方式及有益效果编制；未验证内容保留为待验证。',
      bid: '按采购文件逐项响应；资格、报价、承诺及证明材料须核实，不自动推定满足要求。',
    };
    const note = kind === 'report' ? undefined : notes[kind];
    const doc = new Document({
      title: STARTER_NAMES[kind],
      creator: 'Rail design platform',
      styles: {
        default: {
          document: {
            run: {
              font: { name: '宋体', eastAsia: '宋体' },
              size: 24,
              color: '202838',
            },
            paragraph: { spacing: { line: 360, after: 160 } },
          },
          heading1: {
            run: {
              font: { name: 'Arial', eastAsia: '黑体' },
              size: 32,
              bold: true,
              color: '202838',
            },
            paragraph: { keepNext: true, spacing: { before: 360, after: 200 } },
          },
        },
        paragraphStyles: [
          {
            id: 'RailCaption',
            name: 'Rail figure caption',
            run: {
              font: { name: '宋体', eastAsia: '宋体' },
              size: 20,
              color: '667085',
            },
            paragraph: {
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
              keepNext: false,
            },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11_906, height: 16_838 },
              margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: '第 ', size: 18 }),
                    new TextRun({ children: [PageNumber.CURRENT] }),
                    new TextRun({ text: ' 页', size: 18 }),
                  ],
                }),
              ],
            }),
          },
          children: [
            paragraph(STARTER_NAMES[kind], {
              spacing: { before: 600, after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: '{{title}}',
                  font: { name: 'Arial', eastAsia: '黑体' },
                  size: 48,
                  bold: true,
                }),
              ],
              spacing: { after: 480 },
            }),
            ...(note ? [paragraph(note)] : []),
            paragraph('{{summary}}'),
            paragraph('{{section_title}}', { heading: HeadingLevel.HEADING_1 }),
            paragraph('{{section_body}}'),
            paragraph('{{images}}', {
              alignment: AlignmentType.CENTER,
              keepNext: true,
            }),
            paragraph('{{caption}}', { style: 'RailCaption' }),
          ],
        },
      ],
    });
    source = new Uint8Array(await Packer.toBuffer(doc));
  } else {
    const PresentationConstructor =
      typeof pptxgen === 'function'
        ? pptxgen
        : (pptxgen as unknown as { default: typeof pptxgen }).default;
    const ppt = new PresentationConstructor();
    ppt.layout = 'LAYOUT_WIDE';
    ppt.author = 'Rail design platform';
    ppt.subject = STARTER_NAMES[kind];
    ppt.title = STARTER_NAMES[kind];
    ppt.theme = {
      headFontFace: 'Microsoft YaHei',
      bodyFontFace: 'Microsoft YaHei',
    };
    ppt.defineSlideMaster({
      title: 'RAIL',
      background: { color: 'FAFBFD' },
      objects: [
        {
          line: {
            x: 0.65,
            y: 7.05,
            w: 12.02,
            h: 0,
            line: { color: 'DADEE5', width: 0.6 },
          },
        },
        {
          text: {
            text: 'RAIL DESIGN',
            options: {
              x: 0.7,
              y: 7.1,
              w: 3,
              h: 0.18,
              fontSize: 8,
              color: '667085',
              margin: 0,
            },
          },
        },
      ],
      slideNumber: {
        x: 12.1,
        y: 7.1,
        w: 0.5,
        h: 0.18,
        fontSize: 8,
        color: '667085',
        align: 'right',
      },
    });
    const cover = ppt.addSlide('RAIL');
    cover.addShape(ppt.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 0.18,
      h: 7.5,
      fill: { color: 'B5121B' },
      line: { transparency: 100 },
    });
    cover.addText(STARTER_NAMES[kind], {
      x: 0.85,
      y: 1,
      w: 11.5,
      h: 0.35,
      fontSize: 16,
      color: 'B5121B',
      margin: 0,
    });
    cover.addText('{{title}}', {
      x: 0.85,
      y: 1.8,
      w: 11.5,
      h: 1.3,
      fontSize: 32,
      bold: true,
      color: '202838',
      margin: 0,
    });
    cover.addText('{{summary}}', {
      x: 0.85,
      y: 3.7,
      w: 11.5,
      h: 2.1,
      fontSize: 18,
      color: '667085',
      margin: 0,
      valign: 'top',
    });
    const slide = ppt.addSlide('RAIL');
    slide.addText('{{section_title}}', {
      x: 0.7,
      y: 0.55,
      w: 11.9,
      h: 0.75,
      fontSize: 26,
      bold: true,
      color: '202838',
      margin: 0,
    });
    slide.addText('{{section_body}}', {
      x: 0.7,
      y: 1.65,
      w: 4.7,
      h: 4.95,
      fontSize: 17,
      color: '202838',
      margin: 0,
      valign: 'top',
      breakLine: false,
    });
    for (const y of [1.65, 4.12]) {
      slide.addText('{{images}}', {
        x: 5.85,
        y,
        w: 6.75,
        h: 2.05,
        fontSize: 14,
        color: '667085',
        align: 'center',
        valign: 'middle',
        margin: 0,
      });
      slide.addText('{{caption}}', {
        x: 5.85,
        y: y + 2.1,
        w: 6.75,
        h: 0.28,
        fontSize: 10,
        color: '667085',
        margin: 0,
      });
    }
    const singleMixed = ppt.addSlide('RAIL');
    singleMixed.addText('{{section_title}}', {
      x: 0.7,
      y: 0.55,
      w: 11.9,
      h: 0.75,
      fontSize: 26,
      bold: true,
      color: '202838',
      margin: 0,
    });
    singleMixed.addText('{{section_body}}', {
      x: 0.7,
      y: 1.65,
      w: 4.7,
      h: 4.95,
      fontSize: 17,
      color: '202838',
      margin: 0,
      valign: 'top',
    });
    singleMixed.addText('{{images}}', {
      x: 5.85,
      y: 1.65,
      w: 6.75,
      h: 4.45,
      fontSize: 14,
      color: '667085',
      margin: 0,
    });
    singleMixed.addText('{{caption}}', {
      x: 5.85,
      y: 6.25,
      w: 6.75,
      h: 0.35,
      fontSize: 10,
      color: '667085',
      margin: 0,
    });
    const textPage = ppt.addSlide('RAIL');
    textPage.addText('{{section_title}}', {
      x: 0.7,
      y: 0.55,
      w: 11.9,
      h: 0.75,
      fontSize: 26,
      bold: true,
      color: '202838',
      margin: 0,
    });
    textPage.addText('{{section_body}}', {
      x: 0.7,
      y: 1.65,
      w: 11.9,
      h: 4.95,
      fontSize: 19,
      color: '202838',
      margin: 0,
      valign: 'top',
    });
    for (const count of [4, 1]) {
      const gallery = ppt.addSlide('RAIL');
      gallery.addText('{{section_title}}', {
        x: 0.7,
        y: 0.55,
        w: 11.9,
        h: 0.75,
        fontSize: 26,
        bold: true,
        color: '202838',
        margin: 0,
      });
      for (let index = 0; index < count; index++) {
        const x = count === 1 ? 0.7 : 0.7 + (index % 2) * 6.15;
        const y = count === 1 ? 1.5 : 1.6 + Math.floor(index / 2) * 2.5;
        const w = count === 1 ? 11.9 : 5.75;
        const h = count === 1 ? 4.8 : 2.05;
        gallery.addText('{{images}}', {
          x,
          y,
          w,
          h,
          fontSize: 14,
          color: '667085',
          margin: 0,
        });
        gallery.addText('{{caption}}', {
          x,
          y: y + h + 0.08,
          w,
          h: 0.35,
          fontSize: 10,
          color: '667085',
          margin: 0,
        });
      }
    }
    source = new Uint8Array(
      (await ppt.write({ outputType: 'arraybuffer' })) as ArrayBuffer,
    );
  }
  const manifest = inspectOfficeTemplate(source, format);
  return {
    source,
    snapshot: {
      id: `builtin-${kind}`,
      projectId: '',
      name: STARTER_NAMES[kind],
      format,
      revision: 2,
      objectKey: '',
      sha256: createHash('sha256').update(source).digest('hex'),
      manifest,
      configuration: {
        repeatSections: true,
        bindings: manifest.elements.map((item) => ({
          id: item.id,
          role: item.role,
          fieldName: item.fieldName,
          sectionIndex: 0,
        })),
      },
    },
  };
}
