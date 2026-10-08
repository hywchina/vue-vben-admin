export const assetImageDragType = 'application/x-rail-asset-image';

export function beginAssetImageDrag(
  event: DragEvent,
  assetId: string,
  name = '生成图片',
) {
  if (!event.dataTransfer) return;
  // Do not transfer a signed URL: the receiver must request fresh authorization.
  event.dataTransfer.clearData();
  event.dataTransfer.setData(
    assetImageDragType,
    JSON.stringify({ assetId, name, version: 1 }),
  );
  event.dataTransfer.effectAllowed = 'copy';
}

export function readDraggedAssetId(transfer: DataTransfer): string | undefined {
  try {
    const payload = JSON.parse(transfer.getData(assetImageDragType));
    if (
      payload?.version === 1 &&
      typeof payload.assetId === 'string' &&
      /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(payload.assetId)
    ) {
      return payload.assetId;
    }
  } catch {
    // Native image URLs and external HTML are not trusted platform assets.
  }
}

export function readDraggedImageName(transfer: DataTransfer): string {
  try {
    const name = JSON.parse(transfer.getData(assetImageDragType))?.name;
    if (typeof name === 'string') {
      return (
        Array.from(name, (character) =>
          (character.codePointAt(0) ?? 0) < 32 ? '_' : character,
        )
          .join('')
          .replaceAll(/[/\\]/g, '_')
          .slice(0, 200) || '生成图片'
      );
    }
  } catch {
    // Display names are optional, never authorization.
  }
  return '生成图片';
}

interface ImageAssetReader {
  getPreview: (
    id: string,
  ) => Promise<
    | { content: string; mimeType: string; mode: 'inline' }
    | { expiresAt: string; mimeType: string; mode: 'url'; url: string }
  >;
  readFile: (url: string) => Promise<Response>;
}

const imageExtensions: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function readAssetImageFile(
  assetId: string,
  maxBytes: number,
  reader: ImageAssetReader,
  name = '生成图片',
): Promise<File> {
  // This endpoint supports staged outputs without saving them to asset center.
  // It checks project access and availability before issuing a fresh URL.
  const preview = await reader.getPreview(assetId);
  const extension = imageExtensions[preview.mimeType];
  if (preview.mode !== 'url' || !extension) {
    throw new Error('该资产不是可用的 PNG、JPEG、WebP 或 GIF 图片');
  }
  const response = await reader.readFile(preview.url);
  if (!response.ok) throw new Error('读取图片失败，请重新拖拽重试');
  if (Number(response.headers.get('content-length')) > maxBytes) {
    throw new Error('图片超过 AI 助手单个附件大小上限');
  }
  const blob = await response.blob();
  if (blob.size === 0 || blob.size > maxBytes) {
    throw new Error('图片为空或超过 AI 助手单个附件大小上限');
  }
  if (blob.type !== preview.mimeType) {
    throw new Error('图片文件类型与资产信息不一致');
  }
  const filename = name.replace(/\.(png|jpe?g|webp|gif)$/i, '');
  return new File([blob], `${filename}.${extension}`, {
    type: preview.mimeType,
  });
}
