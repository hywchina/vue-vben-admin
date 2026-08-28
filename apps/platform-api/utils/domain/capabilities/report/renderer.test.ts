import { Buffer } from 'node:buffer';

import { describe, expect, it } from 'vitest';

import { renderReportArtifact } from './renderer';

const imageId = '10000000-0000-4000-8000-000000000001';
const png = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
);

function reportInput(format: 'docx' | 'md' | 'pptx') {
  return {
    assets: new Map([
      [
        imageId,
        {
          bytes: png,
          filename: 'sample.png',
          id: imageId,
          mimeType: 'image/png' as const,
          name: '客室效果图',
        },
      ],
    ]),
    createdAt: new Date('2026-08-25T08:00:00.000Z'),
    parameters: {
      format,
      generationMode: 'template' as const,
      name: '项目设计报告生成',
      projectId: '20000000-0000-4000-8000-000000000001',
      reportType: 'design-proposal' as const,
      sections: [
        {
          body: '本方案围绕客室空间、CMF 与关键零部件开展设计。',
          images: [{ assetId: imageId, caption: '客室方案效果图' }],
          title: '设计方案',
        },
      ],
      summary: '本报告用于评审轨道客室设计方案。',
      templateKey: 'rail-design-standard-v1' as const,
      title: '示范项目客室设计报告',
    },
    projectName: '示范项目',
    requestedBy: '测试用户',
  };
}

describe('report renderer', () => {
  it.each(['docx', 'pptx'] as const)(
    'creates a valid OOXML %s artifact',
    async (format) => {
      const artifact = await renderReportArtifact(reportInput(format));

      expect(artifact.filename).toBe(`示范项目客室设计报告.${format}`);
      expect(artifact.mimeType).toContain('openxmlformats');
      expect(artifact.bytes.byteLength).toBeGreaterThan(5000);
      expect(Buffer.from(artifact.bytes.subarray(0, 2)).toString('ascii')).toBe(
        'PK',
      );
    },
  );

  it('creates a self-contained UTF-8 Markdown artifact', async () => {
    const artifact = await renderReportArtifact(reportInput('md'));
    const content = Buffer.from(artifact.bytes).toString('utf8');

    expect(artifact.filename).toBe('示范项目客室设计报告.md');
    expect(artifact.mimeType).toBe('text/markdown');
    expect(content).toContain('# 示范项目客室设计报告');
    expect(content).toContain('## 1. 设计方案');
    expect(content).toContain('![客室方案效果图](data:image/png;base64,');
    expect(content).toContain('*图 1-1 客室方案效果图*');
  });
});
