import type { CreateReportInput } from './schema';

import { Buffer } from 'node:buffer';

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx';
import { imageSize } from 'image-size';
import pptxgen from 'pptxgenjs';

import { reportMimeType, reportTypeLabels, safeReportFilename } from './schema';

const ACCENT = 'B5121B';
const DARK = '1F2937';
const MUTED = '667085';
const LIGHT = 'F3F4F6';
const CJK_FONT = 'Microsoft YaHei';

export interface ReportImageAsset {
  bytes: Uint8Array;
  filename: string;
  id: string;
  mimeType: 'image/jpeg' | 'image/png';
  name: string;
}

export interface RenderReportInput {
  assets: ReadonlyMap<string, ReportImageAsset>;
  createdAt: Date;
  parameters: CreateReportInput;
  projectName: string;
  requestedBy?: string;
}

export interface ReportArtifact {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

function bodyParagraphs(body: string) {
  return body
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replaceAll(/\s*\n\s*/gu, ' ').trim())
    .filter(Boolean);
}

function presentationBodyChunks(body: string, maximumCharacters = 420) {
  const text = bodyParagraphs(body).join('\n\n');
  if (!text) return [];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maximumCharacters) {
    const candidate = remaining.slice(0, maximumCharacters + 1);
    const punctuationIndex = Math.max(
      candidate.lastIndexOf('。'),
      candidate.lastIndexOf('！'),
      candidate.lastIndexOf('？'),
      candidate.lastIndexOf('\n'),
    );
    const cutAt =
      punctuationIndex >= maximumCharacters * 0.55
        ? punctuationIndex + 1
        : maximumCharacters;
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function containedImageSize(
  bytes: Uint8Array,
  maxWidth: number,
  maxHeight: number,
) {
  const dimensions = imageSize(bytes);
  const width = dimensions.width || maxWidth;
  const height = dimensions.height || maxHeight;
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    height: Math.max(1, Math.round(height * ratio)),
    width: Math.max(1, Math.round(width * ratio)),
  };
}

function imageDataUri(asset: ReportImageAsset) {
  return `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString('base64')}`;
}

function escapeMarkdownInline(value: string) {
  return value
    .replaceAll('\\', String.raw`\\`)
    .replaceAll(/([[\]*_`<>])/gu, String.raw`\$1`)
    .replaceAll(/\s*\n\s*/gu, ' ')
    .trim();
}

function renderMarkdown(input: RenderReportInput) {
  const { parameters } = input;
  const lines = [
    `# ${escapeMarkdownInline(parameters.title)}`,
    '',
    `> ${escapeMarkdownInline(reportTypeLabels[parameters.reportType])}`,
    '',
    `- 项目：${escapeMarkdownInline(input.projectName)}`,
    `- 生成日期：${formatDate(input.createdAt)}`,
  ];
  if (input.requestedBy) {
    lines.push(`- 编制人：${escapeMarkdownInline(input.requestedBy)}`);
  }

  if (parameters.summary) {
    lines.push('', '## 报告摘要', '', parameters.summary.trim());
  }

  lines.push('', '## 目录', '');
  parameters.sections.forEach((section, sectionIndex) => {
    lines.push(`${sectionIndex + 1}. ${escapeMarkdownInline(section.title)}`);
  });

  parameters.sections.forEach((section, sectionIndex) => {
    lines.push(
      '',
      `## ${sectionIndex + 1}. ${escapeMarkdownInline(section.title)}`,
      '',
    );
    if (section.body) lines.push(section.body.trim(), '');
    section.images.forEach((image, imageIndex) => {
      const asset = input.assets.get(image.assetId);
      if (!asset) throw new Error(`报告图片资产不存在：${image.assetId}`);
      const caption = image.caption || asset.name;
      lines.push(
        `![${escapeMarkdownInline(caption)}](${imageDataUri(asset)})`,
        '',
        `*图 ${sectionIndex + 1}-${imageIndex + 1} ${escapeMarkdownInline(caption)}*`,
        '',
      );
    });
  });

  return Uint8Array.from(Buffer.from(`${lines.join('\n').trim()}\n`, 'utf8'));
}

function createHeader() {
  return new Header({
    children: [
      new Paragraph({
        border: {
          bottom: { color: 'D0D5DD', size: 4, style: BorderStyle.SINGLE },
        },
        children: [
          new TextRun({
            color: MUTED,
            font: { eastAsia: CJK_FONT, name: CJK_FONT },
            size: 18,
            text: '轨道客室智能设计平台 · 项目设计报告',
          }),
        ],
        spacing: { after: 100 },
      }),
    ],
  });
}

function createFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            color: MUTED,
            font: { eastAsia: CJK_FONT, name: CJK_FONT },
            size: 18,
            text: '第 ',
          }),
          new TextRun({ children: [PageNumber.CURRENT] }),
          new TextRun({
            color: MUTED,
            font: { eastAsia: CJK_FONT, name: CJK_FONT },
            size: 18,
            text: ' 页',
          }),
        ],
      }),
    ],
  });
}

async function renderDocx(input: RenderReportInput) {
  const { parameters } = input;
  const children: Paragraph[] = [
    new Paragraph({ spacing: { before: 2100 } }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          bold: true,
          color: ACCENT,
          font: { eastAsia: CJK_FONT, name: CJK_FONT },
          size: 24,
          text: reportTypeLabels[parameters.reportType],
        }),
      ],
      spacing: { after: 260 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          bold: true,
          color: DARK,
          font: { eastAsia: CJK_FONT, name: CJK_FONT },
          size: 60,
          text: parameters.title,
        }),
      ],
      spacing: { after: 420 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          color: MUTED,
          font: { eastAsia: CJK_FONT, name: CJK_FONT },
          size: 24,
          text: input.projectName,
        }),
      ],
      spacing: { after: 180 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          color: MUTED,
          font: { eastAsia: CJK_FONT, name: CJK_FONT },
          size: 20,
          text: `${formatDate(input.createdAt)}${input.requestedBy ? ` · ${input.requestedBy}` : ''}`,
        }),
      ],
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  if (parameters.summary) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        text: '报告摘要',
      }),
      ...bodyParagraphs(parameters.summary).map(
        (text) =>
          new Paragraph({
            children: [new TextRun({ text })],
            spacing: { after: 180, line: 360 },
          }),
      ),
    );
  }

  parameters.sections.forEach((section, sectionIndex) => {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        text: `${sectionIndex + 1}. ${section.title}`,
      }),
      ...bodyParagraphs(section.body).map(
        (text) =>
          new Paragraph({
            children: [new TextRun({ text })],
            spacing: { after: 180, line: 360 },
          }),
      ),
    );

    section.images.forEach((image, imageIndex) => {
      const asset = input.assets.get(image.assetId);
      if (!asset) throw new Error(`报告图片资产不存在：${image.assetId}`);
      const size = containedImageSize(asset.bytes, 600, 420);
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              altText: {
                description: image.caption || asset.name,
                name: asset.name,
                title: asset.name,
              },
              data: asset.bytes,
              transformation: size,
              type: asset.mimeType === 'image/png' ? 'png' : 'jpg',
            }),
          ],
          keepNext: true,
          spacing: { before: 160, after: 80 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              color: MUTED,
              italics: true,
              size: 18,
              text: `图 ${sectionIndex + 1}-${imageIndex + 1} ${image.caption || asset.name}`,
            }),
          ],
          spacing: { after: 180 },
        }),
      );
    });
  });

  const document = new Document({
    creator: '轨道客室智能设计平台',
    description: `${input.projectName} · ${reportTypeLabels[parameters.reportType]}`,
    sections: [
      {
        children,
        footers: { default: createFooter() },
        headers: { default: createHeader() },
        properties: {
          page: {
            margin: { bottom: 1134, left: 1276, right: 1276, top: 1134 },
            size: { height: 16_838, width: 11_906 },
          },
        },
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            color: DARK,
            font: { eastAsia: CJK_FONT, name: CJK_FONT },
            size: 22,
          },
        },
        heading1: {
          paragraph: { spacing: { after: 180, before: 280 } },
          run: {
            bold: true,
            color: ACCENT,
            font: { eastAsia: CJK_FONT, name: CJK_FONT },
            size: 32,
          },
        },
      },
    },
    subject: reportTypeLabels[parameters.reportType],
    title: parameters.title,
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

function addSlideChrome(
  pptx: pptxgen,
  slide: pptxgen.Slide,
  pageNumber: number,
) {
  slide.background = { color: 'FFFFFF' };
  slide.addShape(pptx.ShapeType.line, {
    h: 0,
    line: { color: ACCENT, width: 1.25 },
    w: 0.75,
    x: 0.55,
    y: 7.12,
  });
  slide.addText('轨道客室智能设计平台', {
    color: MUTED,
    fontFace: CJK_FONT,
    fontSize: 9,
    h: 0.2,
    margin: 0,
    w: 2.3,
    x: 1.45,
    y: 7.02,
  });
  slide.addText(String(pageNumber), {
    align: 'right',
    color: MUTED,
    fontFace: CJK_FONT,
    fontSize: 9,
    h: 0.2,
    margin: 0,
    w: 0.5,
    x: 12.15,
    y: 7.02,
  });
}

function addSlideTitle(slide: pptxgen.Slide, title: string, kicker?: string) {
  if (kicker) {
    slide.addText(kicker, {
      bold: true,
      color: ACCENT,
      fontFace: CJK_FONT,
      fontSize: 12,
      h: 0.25,
      margin: 0,
      w: 5.8,
      x: 0.68,
      y: 0.48,
    });
  }
  slide.addText(title, {
    bold: true,
    color: DARK,
    fontFace: CJK_FONT,
    fontSize: 30,
    h: 0.55,
    margin: 0,
    w: 11.8,
    x: 0.68,
    y: kicker ? 0.82 : 0.58,
  });
}

function addBodyText(
  slide: pptxgen.Slide,
  body: string,
  options: { h: number; w: number; x: number; y: number },
) {
  const paragraphs = bodyParagraphs(body);
  if (paragraphs.length === 0) return;
  slide.addText(paragraphs.join('\n\n'), {
    breakLine: false,
    color: DARK,
    fontFace: CJK_FONT,
    fontSize: 17,
    h: options.h,
    margin: 0.05,
    valign: 'top',
    w: options.w,
    x: options.x,
    y: options.y,
  });
}

async function renderPptx(input: RenderReportInput) {
  const { parameters } = input;
  const PptxGenConstructor =
    (pptxgen as unknown as { default?: typeof pptxgen }).default ?? pptxgen;
  const pptx = new PptxGenConstructor();
  pptx.author = '轨道客室智能设计平台';
  pptx.company = '轨道客室智能设计平台';
  pptx.layout = 'LAYOUT_WIDE';
  pptx.subject = reportTypeLabels[parameters.reportType];
  pptx.title = parameters.title;
  pptx.theme = {
    headFontFace: CJK_FONT,
    bodyFontFace: CJK_FONT,
  };

  let pageNumber = 1;
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: DARK };
  titleSlide.addShape(pptx.ShapeType.rect, {
    fill: { color: ACCENT },
    h: 0.08,
    line: { color: ACCENT },
    w: 1.3,
    x: 0.72,
    y: 0.75,
  });
  titleSlide.addText(reportTypeLabels[parameters.reportType], {
    bold: true,
    color: 'FCA5A5',
    fontFace: CJK_FONT,
    fontSize: 16,
    h: 0.35,
    margin: 0,
    w: 6,
    x: 0.72,
    y: 1.18,
  });
  titleSlide.addText(parameters.title, {
    bold: true,
    color: 'FFFFFF',
    fontFace: CJK_FONT,
    fontSize: 32,
    fit: 'shrink',
    h: 1.65,
    margin: 0,
    valign: 'middle',
    w: 10.9,
    x: 0.72,
    y: 1.72,
  });
  titleSlide.addText(input.projectName, {
    color: 'D0D5DD',
    fontFace: CJK_FONT,
    fontSize: 20,
    h: 0.4,
    margin: 0,
    w: 8,
    x: 0.72,
    y: 4.18,
  });
  titleSlide.addText(
    `${formatDate(input.createdAt)}${input.requestedBy ? ` · ${input.requestedBy}` : ''}`,
    {
      color: '98A2B3',
      fontFace: CJK_FONT,
      fontSize: 12,
      h: 0.25,
      margin: 0,
      w: 8,
      x: 0.72,
      y: 4.82,
    },
  );
  titleSlide.addText('轨道客室智能设计平台', {
    color: '98A2B3',
    fontFace: CJK_FONT,
    fontSize: 10,
    h: 0.25,
    margin: 0,
    w: 3,
    x: 0.72,
    y: 6.72,
  });
  pageNumber += 1;

  const overview = pptx.addSlide();
  addSlideChrome(pptx, overview, pageNumber++);
  addSlideTitle(overview, '报告概览', reportTypeLabels[parameters.reportType]);
  if (parameters.summary) {
    overview.addText(parameters.summary, {
      color: DARK,
      fontFace: CJK_FONT,
      fontSize: 18,
      fit: 'shrink',
      h: 1.75,
      margin: 0.08,
      valign: 'top',
      w: 11.8,
      x: 0.72,
      y: 1.58,
    });
  }
  overview.addShape(pptx.ShapeType.line, {
    h: 0,
    line: { color: 'D0D5DD', width: 1 },
    w: 11.8,
    x: 0.72,
    y: 3.55,
  });
  const overviewY = parameters.summary ? 3.9 : 1.72;
  parameters.sections.forEach((section, index) => {
    overview.addText(String(index + 1).padStart(2, '0'), {
      bold: true,
      color: ACCENT,
      fontFace: CJK_FONT,
      fontSize: 18,
      h: 0.3,
      margin: 0,
      w: 0.55,
      x: 0.75 + (index % 2) * 6,
      y: overviewY + Math.floor(index / 2) * 0.62,
    });
    overview.addText(section.title, {
      color: DARK,
      fontFace: CJK_FONT,
      fontSize: 16,
      fit: 'shrink',
      h: 0.32,
      margin: 0,
      w: 4.95,
      x: 1.42 + (index % 2) * 6,
      y: overviewY + Math.floor(index / 2) * 0.62,
    });
  });

  parameters.sections.forEach((section, sectionIndex) => {
    const assetGroups: Array<typeof section.images> = [];
    for (let index = 0; index < section.images.length; index += 2) {
      assetGroups.push(section.images.slice(index, index + 2));
    }
    const bodyChunks = presentationBodyChunks(section.body);
    const slideCount = Math.max(assetGroups.length, bodyChunks.length, 1);

    for (let groupIndex = 0; groupIndex < slideCount; groupIndex += 1) {
      const images = assetGroups[groupIndex] ?? [];
      const body = bodyChunks[groupIndex] ?? '';
      const slide = pptx.addSlide();
      addSlideChrome(pptx, slide, pageNumber++);
      const continuation = groupIndex ? `（续 ${groupIndex + 1}）` : '';
      addSlideTitle(
        slide,
        `${section.title}${continuation}`,
        `${String(sectionIndex + 1).padStart(2, '0')} / ${parameters.sections.length}`,
      );

      const showBody = Boolean(body);
      if (images.length > 0) {
        const top = showBody ? 3.18 : 1.62;
        if (showBody) {
          addBodyText(slide, body, {
            h: 1.18,
            w: 11.7,
            x: 0.72,
            y: 1.62,
          });
        }
        images.forEach((image, imageIndex) => {
          const asset = input.assets.get(image.assetId);
          if (!asset) throw new Error(`报告图片资产不存在：${image.assetId}`);
          const boxWidth = images.length === 1 ? 9.8 : 5.6;
          const boxX = images.length === 1 ? 1.76 : 0.72 + imageIndex * 6.05;
          const boxHeight = showBody ? 3.1 : 4.65;
          const dimensions = containedImageSize(asset.bytes, 1200, 800);
          const ratio = dimensions.width / dimensions.height;
          let width = boxWidth;
          let height = width / ratio;
          if (height > boxHeight) {
            height = boxHeight;
            width = height * ratio;
          }
          slide.addShape(pptx.ShapeType.rect, {
            fill: { color: LIGHT },
            h: boxHeight,
            line: { color: 'E4E7EC', width: 1 },
            w: boxWidth,
            x: boxX,
            y: top,
          });
          slide.addImage({
            data: imageDataUri(asset),
            h: height,
            w: width,
            x: boxX + (boxWidth - width) / 2,
            y: top + (boxHeight - height) / 2,
          });
          slide.addText(image.caption || asset.name, {
            align: 'center',
            color: MUTED,
            fontFace: CJK_FONT,
            fontSize: 10,
            fit: 'shrink',
            h: 0.3,
            margin: 0,
            w: boxWidth,
            x: boxX,
            y: top + boxHeight + 0.13,
          });
        });
        slide.addNotes(
          images
            .map((image) => input.assets.get(image.assetId)?.filename)
            .filter(Boolean)
            .join('\n'),
        );
      } else {
        addBodyText(slide, body, {
          h: 4.65,
          w: 11.7,
          x: 0.72,
          y: 1.72,
        });
      }
    }
  });

  const output = await pptx.write({
    compression: true,
    outputType: 'uint8array',
  });
  if (!(output instanceof Uint8Array)) {
    throw new TypeError('PPTX 渲染器返回了非预期的数据类型');
  }
  return output;
}

export async function renderReportArtifact(
  input: RenderReportInput,
): Promise<ReportArtifact> {
  const bytes =
    input.parameters.format === 'docx'
      ? await renderDocx(input)
      : input.parameters.format === 'pptx'
        ? await renderPptx(input)
        : renderMarkdown(input);
  return {
    bytes,
    filename: safeReportFilename(
      input.parameters.title,
      input.parameters.format,
    ),
    mimeType: reportMimeType(input.parameters.format),
  };
}
