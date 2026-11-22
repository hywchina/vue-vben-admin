import { Buffer } from 'node:buffer';

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from 'docx';

import reference from './design-reference.json';

const FONT = 'Noto Sans CJK SC';
const PURPLE = '9C8DDE';

/** Editable landscape design report distilled from the supplied industrial-design PDF. */
export function createDesignWordTemplate() {
  const paragraph = (text: string, options = {}) =>
    new Paragraph({ children: [new TextRun(text)], ...options });
  return new Document({
    title: '工业设计方案',
    creator: 'Rail design platform',
    features: { updateFields: true },
    styles: {
      default: {
        document: {
          run: {
            font: { name: FONT, eastAsia: FONT },
            size: 24,
            color: '333333',
          },
          paragraph: {
            spacing: { line: 360, lineRule: LineRuleType.AUTO, after: 160 },
          },
        },
        title: {
          run: { font: FONT, size: 60, bold: true, color: 'FFFFFF' },
          paragraph: { spacing: { line: 288, lineRule: LineRuleType.AUTO } },
        },
        heading1: {
          run: { font: FONT, size: 36, bold: true, color: '333333' },
          paragraph: {
            keepNext: true,
            spacing: { line: 288, lineRule: LineRuleType.AUTO, after: 300 },
            border: {
              left: {
                color: PURPLE,
                style: BorderStyle.SINGLE,
                size: 48,
                space: 12,
              },
            },
          },
        },
      },
      paragraphStyles: [
        {
          id: 'RailFigure',
          name: 'Rail full-page design figure',
          paragraph: {
            alignment: AlignmentType.CENTER,
            keepNext: true,
            spacing: { line: 240, lineRule: LineRuleType.AUTO, after: 120 },
          },
        },
        {
          id: 'RailCaption',
          name: 'Rail figure caption',
          run: { font: FONT, size: 20, color: '666666' },
          paragraph: {
            alignment: AlignmentType.CENTER,
            keepNext: false,
            spacing: { line: 288, lineRule: LineRuleType.AUTO, after: 160 },
          },
        },
        {
          id: 'TOC1',
          name: 'TOC 1',
          run: { font: FONT, size: 28, color: '333333' },
          paragraph: {
            spacing: { line: 360, lineRule: LineRuleType.AUTO, after: 240 },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          titlePage: true,
          page: {
            // Same aspect ratio as the PDF, scaled to an Office-friendly landscape sheet.
            size: { width: 16_838, height: 11_626 },
            margin: {
              top: 1000,
              bottom: 800,
              left: 1000,
              right: 1000,
              header: 300,
              footer: 300,
            },
          },
        },
        headers: {
          first: new Header({ children: [paragraph('')] }),
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: '▍', color: PURPLE, size: 32 }),
                  new TextRun({
                    text: '  工业设计方案',
                    color: '808080',
                    size: 20,
                  }),
                ],
                spacing: { line: 240, lineRule: LineRuleType.AUTO },
              }),
            ],
          }),
        },
        footers: {
          first: new Footer({ children: [paragraph('')] }),
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: '808080',
                    size: 18,
                  }),
                ],
                spacing: { line: 240, lineRule: LineRuleType.AUTO },
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                type: 'jpg',
                data: Buffer.from(reference.coverLogoJpeg, 'base64'),
                transformation: { width: 128, height: 59 },
              }),
            ],
            spacing: { line: 240, lineRule: LineRuleType.AUTO, after: 0 },
          }),
          new Paragraph({
            children: [
              new ImageRun({
                type: 'jpg',
                data: Buffer.from(reference.coverBackgroundJpeg, 'base64'),
                transformation: { width: 1123, height: 405 },
                floating: {
                  horizontalPosition: {
                    relative: HorizontalPositionRelativeFrom.PAGE,
                    offset: 0,
                  },
                  verticalPosition: {
                    relative: VerticalPositionRelativeFrom.PAGE,
                    offset: 1_422_400,
                  },
                  behindDocument: true,
                  allowOverlap: true,
                },
              }),
            ],
            spacing: { line: 240, lineRule: LineRuleType.AUTO, after: 0 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: Object.fromEntries(
              [
                'top',
                'bottom',
                'left',
                'right',
                'insideHorizontal',
                'insideVertical',
              ].map((side) => [side, { style: BorderStyle.NONE, size: 0 }]),
            ),
            rows: [
              new TableRow({
                height: { value: 6000, rule: HeightRule.ATLEAST },
                children: [
                  new TableCell({
                    verticalAlign: VerticalAlign.CENTER,
                    margins: { left: 0, right: 0, top: 0, bottom: 0 },
                    children: [
                      paragraph('{{title}}', {
                        style: 'Title',
                        spacing: {
                          before: 0,
                          after: 0,
                          line: 288,
                          lineRule: LineRuleType.AUTO,
                        },
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          paragraph('目录', {
            pageBreakBefore: true,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: '目录',
                size: 44,
                bold: true,
                color: '333333',
              }),
            ],
          }),
          paragraph('{{contents}}', { style: 'TOC1' }),
          paragraph('方案概述', {
            spacing: { after: 300 },
            children: [new TextRun({ text: '方案概述', size: 36, bold: true })],
          }),
          paragraph('{{summary}}'),
          paragraph('{{section_title}}', {
            heading: HeadingLevel.HEADING_1,
            pageBreakBefore: true,
          }),
          paragraph('{{section_body}}'),
          new Paragraph({
            style: 'RailFigure',
            pageBreakBefore: true,
            children: [
              new TextRun('{{images}}'),
              new ImageRun({
                type: 'png',
                data: Buffer.from(
                  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=',
                  'base64',
                ),
                transformation: { width: 960, height: 500 },
              }),
            ],
          }),
          paragraph('{{caption}}', { style: 'RailCaption' }),
        ],
      },
    ],
  });
}
