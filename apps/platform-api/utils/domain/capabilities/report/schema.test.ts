import { describe, expect, it } from 'vitest';

import {
  createReportSchema,
  orderedReportAssetIds,
  safeReportFilename,
} from './schema';

const projectId = '20000000-0000-4000-8000-000000000001';
const imageId = '10000000-0000-4000-8000-000000000001';

function validInput() {
  return {
    format: 'docx',
    name: '项目报告',
    projectId,
    reportType: 'design-proposal',
    sections: [
      {
        body: '章节正文',
        images: [{ assetId: imageId, caption: '方案图' }],
        title: '设计方案',
      },
    ],
    summary: '',
    templateKey: 'rail-design-standard-v1',
    title: '客室设计报告',
  };
}

describe('report generation schema', () => {
  it('accepts a controlled report and preserves unique asset order', () => {
    const parsed = createReportSchema.parse({
      ...validInput(),
      sections: [
        ...validInput().sections,
        {
          body: '',
          images: [{ assetId: imageId, caption: '重复引用' }],
          title: '补充图片',
        },
      ],
    });

    expect(orderedReportAssetIds(parsed)).toEqual([imageId]);
    expect(parsed.generationMode).toBe('template');
  });

  it('accepts the controlled AI generation mode', () => {
    expect(
      createReportSchema.parse({
        ...validInput(),
        generationMode: 'ai',
      }).generationMode,
    ).toBe('ai');
  });

  it('accepts Markdown as a report delivery format', () => {
    const parsed = createReportSchema.parse({
      ...validInput(),
      format: 'md',
      generationMode: 'ai',
    });

    expect(parsed.format).toBe('md');
    expect(safeReportFilename(parsed.title, parsed.format)).toBe(
      '客室设计报告.md',
    );
  });

  it('rejects empty sections and more than 24 image placements', () => {
    expect(() =>
      createReportSchema.parse({
        ...validInput(),
        sections: [{ body: '', images: [], title: '空章节' }],
      }),
    ).toThrow('每个章节至少需要正文或一张图片');
    expect(() =>
      createReportSchema.parse({
        ...validInput(),
        sections: Array.from({ length: 4 }, (_, sectionIndex) => ({
          body: '',
          images: Array.from({ length: 7 }, (_, imageIndex) => ({
            assetId: `10000000-0000-4000-800${sectionIndex}-${String(imageIndex + 1).padStart(12, '0')}`,
            caption: '图片',
          })),
          title: `章节 ${sectionIndex + 1}`,
        })),
      }),
    ).toThrow('单个报告最多使用 24 张图片');
  });

  it('sanitizes office filenames', () => {
    expect(safeReportFilename(' 客室/设计:*报告? ', 'pptx')).toBe(
      '客室 设计 报告.pptx',
    );
  });
});
