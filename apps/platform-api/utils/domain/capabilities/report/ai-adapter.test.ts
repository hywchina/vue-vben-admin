import type { ReportImageAsset } from './renderer';
import type { CreateReportInput } from './schema';

import { describe, expect, it, vi } from 'vitest';

import { buildAiReportPrompt, generateAiReportArtifact } from './ai-adapter';
import { renderReportArtifact } from './renderer';

const imageId = '10000000-0000-4000-8000-000000000001';
const parameters: CreateReportInput = {
  format: 'docx',
  generationMode: 'ai',
  name: 'AI 报告',
  projectId: '20000000-0000-4000-8000-000000000001',
  reportType: 'design-proposal',
  sections: [
    {
      body: '围绕客室空间组织开展设计。',
      images: [{ assetId: imageId, caption: '客室效果图' }],
      title: '设计方案',
    },
  ],
  summary: '用于方案评审。',
  templateKey: 'rail-design-standard-v1',
  title: '示范项目客室设计报告',
};
const image: ReportImageAsset = {
  bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
  filename: 'cabin.png',
  id: imageId,
  mimeType: 'image/png',
  name: '客室效果图',
};

describe('aI report adapter', () => {
  it('builds a controlled prompt without exposing asset ids', () => {
    const prompt = buildAiReportPrompt({
      assets: new Map([[imageId, image]]),
      parameters,
      projectName: '示范项目',
      requestedBy: '测试用户',
    });

    expect(prompt).toContain('不得虚构');
    expect(prompt).toContain('第 1 章：设计方案');
    expect(prompt).toContain('客室效果图（附件：cabin.png）');
    expect(prompt).not.toContain(imageId);
  });

  it('uploads images and accepts a matching Office attachment', async () => {
    const validDocument = await renderReportArtifact({
      assets: new Map(),
      createdAt: new Date('2026-08-25T00:00:00.000Z'),
      parameters: {
        ...parameters,
        sections: [{ body: '受控测试正文', images: [], title: '设计方案' }],
      },
      projectName: '示范项目',
      requestedBy: '测试用户',
    });
    const fetchImplementation = vi.fn(async (_url, init) => {
      const form = init?.body as FormData;
      expect(form.get('type')).toBe('word');
      expect(form.get('language')).toBe('Chinese');
      expect(form.get('n_slides')).toBe('3');
      expect(form.getAll('images')).toHaveLength(1);
      return new Response(
        new Blob([Uint8Array.from(validDocument.bytes).buffer]),
        {
          headers: {
            'content-length': String(validDocument.bytes.byteLength),
            'content-type':
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'x-generated-file-type': 'docx',
          },
        },
      );
    });
    const artifact = await generateAiReportArtifact({
      apiUrl: 'http://report.local/api/v1/generate-file',
      assets: new Map([[imageId, image]]),
      fetchImplementation: fetchImplementation as typeof fetch,
      maxOutputBytes: 1024 * 1024,
      parameters,
      projectName: '示范项目',
      template: 'general',
      timeoutMs: 1000,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(artifact.filename).toBe('示范项目客室设计报告.docx');
    expect(artifact.bytes.byteLength).toBe(validDocument.bytes.byteLength);
  });

  it('rejects non-Office responses', async () => {
    await expect(
      generateAiReportArtifact({
        apiUrl: 'http://report.local/api/v1/generate-file',
        assets: new Map([[imageId, image]]),
        fetchImplementation: vi.fn(
          async () => new Response('not an office file'),
        ) as typeof fetch,
        maxOutputBytes: 1024,
        parameters,
        projectName: '示范项目',
        template: 'general',
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ code: 'REPORT_AI_RESPONSE_INVALID' });
  });

  it('requests and accepts a UTF-8 Markdown report', async () => {
    const fetchImplementation = vi.fn(async (_url, init) => {
      const form = init?.body as FormData;
      expect(form.get('type')).toBe('md');
      expect(form.get('filename')).toBe('示范项目客室设计报告');
      return new Response('# AI 客室设计报告\n\n## 设计方案\n\n方案正文。\n', {
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'x-generated-file-type': 'markdown',
        },
      });
    });
    const artifact = await generateAiReportArtifact({
      apiUrl: 'http://report.local/api/v1/generate-file',
      assets: new Map([[imageId, image]]),
      fetchImplementation: fetchImplementation as typeof fetch,
      maxOutputBytes: 1024 * 1024,
      parameters: { ...parameters, format: 'md' },
      projectName: '示范项目',
      template: 'general',
      timeoutMs: 1000,
    });

    expect(artifact.filename).toBe('示范项目客室设计报告.md');
    expect(artifact.mimeType).toBe('text/markdown');
    expect(new TextDecoder().decode(artifact.bytes)).toContain('## 设计方案');
  });

  it('rejects a ZIP without the expected Office package entries', async () => {
    await expect(
      generateAiReportArtifact({
        apiUrl: 'http://report.local/api/v1/generate-file',
        assets: new Map([[imageId, image]]),
        fetchImplementation: vi.fn(
          async () =>
            new Response(Uint8Array.from([0x50, 0x4b, 1, 2]), {
              headers: { 'x-generated-file-type': 'docx' },
            }),
        ) as typeof fetch,
        maxOutputBytes: 1024,
        parameters,
        projectName: '示范项目',
        template: 'general',
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ code: 'REPORT_AI_RESPONSE_INVALID' });
  });
});
