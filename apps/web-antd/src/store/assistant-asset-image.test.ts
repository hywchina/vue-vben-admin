import { describe, expect, it, vi } from 'vitest';

import {
  assetImageDragType,
  beginAssetImageDrag,
  readAssetImageFile,
  readDraggedAssetId,
  readDraggedImageName,
} from '#/components/assistant/asset-image-drag';

const assetId = '7cc01e26-3d58-4f4c-9d04-dd3f54046116';
function reader(mimeType = 'image/png') {
  return {
    getPreview: vi
      .fn()
      .mockResolvedValue({ mode: 'url', mimeType, url: '/fresh-url' }),
    readFile: vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(['png'], { type: 'image/png' })),
      ),
  };
}

describe('assistant platform image drag', () => {
  it('transfers only a versioned asset id, never the image URL', () => {
    const transfer = new DataTransfer();
    transfer.setData('text/uri-list', 'https://old-url');
    const event = new Event('dragstart') as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    beginAssetImageDrag(event, assetId, '客室.png');
    expect(transfer.types).toEqual([assetImageDragType]);
    expect(transfer.effectAllowed).toBe('copy');
    expect(readDraggedAssetId(transfer)).toBe(assetId);
    expect(readDraggedImageName(transfer)).toBe('客室.png');
  });
  it.each([
    'not-json',
    '{}',
    '{"version":2}',
    '{"version":1,"assetId":"https://external"}',
  ])('rejects invalid payload %s', (payload) => {
    const transfer = new DataTransfer();
    transfer.setData(assetImageDragType, payload);
    expect(readDraggedAssetId(transfer)).toBeUndefined();
  });
  it('uses fresh authorized preview for staged or saved results before reading bytes', async () => {
    const api = reader();
    const file = await readAssetImageFile(assetId, 1024, api, '客室效果');
    expect(api.getPreview).toHaveBeenCalledWith(assetId);
    expect(api.readFile).toHaveBeenCalledWith('/fresh-url');
    expect(file.name).toBe('客室效果.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(3);
  });
  it.each(['text/html', 'image/svg+xml', 'application/pdf'])(
    'rejects unusable MIME before downloading %s',
    async (mimeType) => {
      const api = reader(mimeType);
      await expect(readAssetImageFile(assetId, 1024, api)).rejects.toThrow(
        '不是可用',
      );
      expect(api.readFile).not.toHaveBeenCalled();
    },
  );
  it('preserves permission errors and does not request object bytes', async () => {
    const api = reader();
    api.getPreview.mockRejectedValue(new Error('PROJECT_ACCESS_DENIED'));
    await expect(readAssetImageFile(assetId, 1024, api)).rejects.toThrow(
      'PROJECT_ACCESS_DENIED',
    );
    expect(api.readFile).not.toHaveBeenCalled();
  });
  it.each([
    new Blob([], { type: 'image/png' }),
    new Blob(['oversized'], { type: 'image/png' }),
    new Blob(['png'], { type: 'text/html' }),
  ])(
    'rejects empty, oversized or mismatched downloaded files',
    async (blob) => {
      const api = reader();
      api.readFile.mockResolvedValue(new Response(blob));
      await expect(readAssetImageFile(assetId, 4, api)).rejects.toThrow(
        /图片为空|类型与资产信息不一致/,
      );
    },
  );
  it('rejects failed object requests and inline content', async () => {
    const api = reader();
    api.readFile.mockResolvedValue(new Response('error', { status: 403 }));
    await expect(readAssetImageFile(assetId, 1024, api)).rejects.toThrow(
      '读取图片失败',
    );
    api.getPreview.mockResolvedValue({
      mode: 'inline',
      content: 'x',
      mimeType: 'image/png',
    });
    await expect(readAssetImageFile(assetId, 1024, api)).rejects.toThrow(
      '不是可用',
    );
  });
  it('rejects oversized content length before consuming the response body', async () => {
    const api = reader();
    api.readFile.mockResolvedValue(
      new Response('png', { headers: { 'content-length': '2048' } }),
    );
    await expect(readAssetImageFile(assetId, 1024, api)).rejects.toThrow(
      '大小上限',
    );
  });
});
