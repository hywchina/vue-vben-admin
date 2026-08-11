import { describe, expect, it } from 'vitest';

import {
  extractComfyOutputFiles,
  normalizeComfyOutputMetadata,
} from './worker';

describe('comfyUI worker output mapping', () => {
  it('extracts only files from explicitly configured output fields', () => {
    const mapped = extractComfyOutputFiles(
      {
        '10': {
          images: [
            { filename: 'result.png', subfolder: 'rail', type: 'output' },
          ],
          text: 'ignored',
        },
        '11': {
          images: [{ filename: 'preview.png', type: 'temp' }],
        },
      },
      [
        {
          field: 'images',
          kind: 'image',
          nodeId: '10',
          role: 'primary',
          tags: ['文生图'],
        },
      ],
    );
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.file.filename).toBe('result.png');
    expect(mapped[0]?.externalOutputKey).toContain('rail');
  });

  it('converts PreviewAny text into a persistent inline text output', () => {
    const [mapped] = extractComfyOutputFiles(
      { '5': { text: ['客室方案说明'] } },
      [
        {
          field: 'text',
          kind: 'text',
          nodeId: '5',
          role: 'primary',
          tags: ['文本生成'],
        },
      ],
    );
    expect(mapped?.file.filename).toBe('5-text.md');
    expect(mapped?.inline?.mimeType).toBe('text/markdown');
    expect(new TextDecoder().decode(mapped?.inline?.bytes)).toBe(
      '客室方案说明',
    );
  });

  it('normalizes downloaded ComfyUI text files to Markdown metadata', () => {
    expect(
      normalizeComfyOutputMetadata({
        filename: '方案说明.txt',
        kind: 'text',
        mimeType: 'text/plain',
      }),
    ).toEqual({ filename: '方案说明.md', mimeType: 'text/markdown' });
    expect(
      normalizeComfyOutputMetadata({
        filename: 'render.png',
        kind: 'image',
        mimeType: 'image/png',
      }),
    ).toEqual({ filename: 'render.png', mimeType: 'image/png' });
  });
});
