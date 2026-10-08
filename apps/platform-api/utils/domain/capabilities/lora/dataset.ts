import { extname } from 'node:path';

// Limits apply to a transfer batch, not to the training dataset's image count.
const BATCH_IMAGES = 16;
const BATCH_BYTES = 32 * 1024 * 1024;

export interface LoraDatasetAsset {
  filename: string;
  id: string;
  mimeType: string;
  objectKey: string;
  sizeBytes: number;
}

export interface LoraDatasetFile {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}

export class LoraDatasetError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LoraDatasetError';
  }
}

export async function uploadLoraDatasetBatches(input: {
  assets: LoraDatasetAsset[];
  beforeOperation?: () => Promise<void>;
  items: Array<{ assetId: string; caption: string }>;
  maxDatasetBytes: number;
  read: (objectKey: string) => Promise<Uint8Array>;
  triggerWord: string;
  upload: (files: LoraDatasetFile[]) => Promise<unknown>;
}) {
  const totalBytes = input.assets.reduce(
    (sum, asset) => sum + asset.sizeBytes,
    0,
  );
  if (totalBytes > input.maxDatasetBytes) {
    throw new LoraDatasetError(
      'LORA_DATASET_TOO_LARGE',
      '训练数据集超过平台总容量限制',
    );
  }
  const captions = new Map(
    input.items.map((item) => [item.assetId, item.caption]),
  );
  let files: LoraDatasetFile[] = [];
  let batchBytes = 0;
  const flush = async () => {
    if (files.length === 0) return;
    await input.beforeOperation?.();
    await input.upload(files);
    files = [];
    batchBytes = 0;
  };
  for (const [index, asset] of input.assets.entries()) {
    const caption = captions.get(asset.id)?.trim();
    if (!caption) {
      throw new LoraDatasetError(
        'LORA_DATASET_ASSET_INVALID',
        '训练图片缺少 caption',
      );
    }
    const normalized = caption.includes(input.triggerWord)
      ? caption
      : `${input.triggerWord}, ${caption}`;
    const captionBytes = new TextEncoder().encode(normalized);
    const pairBytes = asset.sizeBytes + captionBytes.byteLength;
    // Flush BEFORE reading the next image. A single oversized image is sent alone.
    if (
      files.length >= BATCH_IMAGES * 2 ||
      (files.length > 0 && batchBytes + pairBytes > BATCH_BYTES)
    ) {
      await flush();
    }
    await input.beforeOperation?.();
    const bytes = await input.read(asset.objectKey);
    if (bytes.byteLength !== asset.sizeBytes || bytes.byteLength === 0) {
      throw new LoraDatasetError(
        'LORA_DATASET_ASSET_INVALID',
        '训练图片大小与已登记版本不一致',
      );
    }
    const extension =
      extname(asset.filename)
        .toLowerCase()
        .replaceAll(/[^.a-z0-9]/g, '') || '.png';
    const stem = String(index + 1).padStart(4, '0');
    files.push(
      { bytes, filename: `${stem}${extension}`, mimeType: asset.mimeType },
      {
        bytes: captionBytes,
        filename: `${stem}.txt`,
        mimeType: 'text/plain;charset=utf-8',
      },
    );
    batchBytes += pairBytes;
  }
  await flush();
}
