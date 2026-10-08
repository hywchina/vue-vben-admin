// @vitest-environment node
import type { LoraDatasetFile } from './dataset';

import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { AiToolkitClient } from './client';
import { uploadLoraDatasetBatches } from './dataset';
import { createLoraTrainingSchema } from './parameters';

function fixture(count = 101, sizeBytes = 4) {
  const assets = Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    filename: '原始图片.PNG',
    mimeType: 'image/png',
    objectKey: `key-${index}`,
    sizeBytes,
  }));
  return {
    assets,
    items: assets.map((asset) => ({
      assetId: asset.id,
      caption: 'rail interior',
    })),
    maxDatasetBytes: 2 * 1024 ** 3,
    triggerWord: 'railstyle',
    read: vi.fn(async () => new Uint8Array(sizeBytes)),
    upload: vi.fn<(files: LoraDatasetFile[]) => Promise<void>>(
      async () => undefined,
    ),
    beforeOperation: vi.fn(async () => undefined),
  };
}

describe('loRA dataset transfer', () => {
  it('uploads 101 pairs sequentially and never reads the next batch before the previous upload completes', async () => {
    const input = fixture();
    let uploaded = 0;
    input.upload.mockImplementation(async (files) => {
      expect(input.read).toHaveBeenCalledTimes(uploaded + files.length / 2);
      expect(files.length).toBeLessThanOrEqual(32);
      for (let index = 0; index < files.length; index += 2) {
        const image = files[index];
        const caption = files[index + 1];
        expect(image?.filename).toBe(
          `${String(uploaded + index / 2 + 1).padStart(4, '0')}.png`,
        );
        expect(caption?.filename).toBe(image?.filename.replace('.png', '.txt'));
        expect(new TextDecoder().decode(caption?.bytes)).toBe(
          'railstyle, rail interior',
        );
      }
      uploaded += files.length / 2;
    });
    await uploadLoraDatasetBatches(input);
    expect(uploaded).toBe(101);
    expect(input.upload.mock.calls.map(([files]) => files.length / 2)).toEqual([
      16, 16, 16, 16, 16, 16, 5,
    ]);
    expect(input.beforeOperation).toHaveBeenCalledTimes(108);
  });

  it('splits on bytes before reading and permits one large image alone', async () => {
    const input = fixture(3, 17 * 1024 ** 2);
    await uploadLoraDatasetBatches(input);
    expect(input.upload.mock.calls.map(([files]) => files.length)).toEqual([
      2, 2, 2,
    ]);
    const large = fixture(1, 33 * 1024 ** 2);
    await uploadLoraDatasetBatches(large);
    expect(large.upload).toHaveBeenCalledOnce();
  });

  it('rejects total capacity before reading or uploading, but allows the exact image capacity boundary', async () => {
    const input = fixture(2, 4);
    input.maxDatasetBytes = 7;
    await expect(uploadLoraDatasetBatches(input)).rejects.toMatchObject({
      code: 'LORA_DATASET_TOO_LARGE',
    });
    expect(input.read).not.toHaveBeenCalled();
    expect(input.upload).not.toHaveBeenCalled();
    input.maxDatasetBytes = 8;
    await uploadLoraDatasetBatches(input);
    expect(input.upload).toHaveBeenCalledOnce();
  });

  it('rejects changed object size and missing captions', async () => {
    const input = fixture(1);
    input.read.mockResolvedValue(new Uint8Array(5));
    await expect(uploadLoraDatasetBatches(input)).rejects.toMatchObject({
      code: 'LORA_DATASET_ASSET_INVALID',
    });
    expect(input.upload).not.toHaveBeenCalled();
    input.items = [];
    input.read.mockClear();
    await expect(uploadLoraDatasetBatches(input)).rejects.toMatchObject({
      code: 'LORA_DATASET_ASSET_INVALID',
    });
    expect(input.read).not.toHaveBeenCalled();
  });

  it('stops on a failed upload and retries with the same deterministic filenames', async () => {
    const input = fixture(40);
    input.upload
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'));
    await expect(uploadLoraDatasetBatches(input)).rejects.toThrow('offline');
    expect(input.read).toHaveBeenCalledTimes(32);
    const first = input.upload.mock.calls[0]?.[0].map((file) => file.filename);
    input.upload.mockClear();
    await uploadLoraDatasetBatches(input);
    expect(
      input.upload.mock.calls[0]?.[0].map((file) => file.filename),
    ).toEqual(first);
  });

  it('checks cancellation or lost lease before reading subsequent images', async () => {
    const input = fixture(40);
    input.beforeOperation
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cancelled'));
    await expect(uploadLoraDatasetBatches(input)).rejects.toThrow('cancelled');
    expect(input.read).toHaveBeenCalledTimes(1);
    expect(input.upload).not.toHaveBeenCalled();
  });

  it('does not prepend an already present trigger word', async () => {
    const input = fixture(1);
    input.items = input.items.map((item) => ({
      ...item,
      caption: 'railstyle, modern interior',
    }));
    await uploadLoraDatasetBatches(input);
    expect(
      new TextDecoder().decode(input.upload.mock.calls[0]?.[0][1]?.bytes),
    ).toBe('railstyle, modern interior');
  });

  it('sends multiple real multipart requests to the same dataset and requires complete receipts', async () => {
    const input = fixture(20);
    const requests: string[][] = [];
    const client = new AiToolkitClient({
      apiUrl: 'http://toolkit.test',
      timeoutMs: 1000,
      fetchImplementation: vi.fn(async (_url, init) => {
        expect(init?.body).toBeInstanceOf(FormData);
        const form = init?.body as FormData;
        expect(form.get('datasetName')).toBe('rail_dataset');
        const files = form.getAll('files') as File[];
        requests.push(files.map((file) => file.name));
        expect(await files[1]?.text()).toBe('railstyle, rail interior');
        return Response.json({ files: files.map((file) => file.name) });
      }),
    });
    await uploadLoraDatasetBatches({
      ...input,
      upload: (files) => client.uploadDataset('rail_dataset', files),
    });
    expect(requests.map((files) => files.length)).toEqual([32, 8]);
    expect(new Set(requests.flat()).size).toBe(40);
    const incomplete = new AiToolkitClient({
      apiUrl: 'http://toolkit.test',
      timeoutMs: 1000,
      fetchImplementation: vi.fn(async () => Response.json({ files: [] })),
    });
    await expect(
      uploadLoraDatasetBatches({
        ...input,
        upload: (files) => incomplete.uploadDataset('rail_dataset', files),
      }),
    ).rejects.toThrow('上传回执缺少文件');
  });
});

describe('loRA training dataset input', () => {
  const input = () => {
    const dataset = fixture();
    return {
      projectId: randomUUID(),
      name: 'training',
      items: dataset.items,
      parameters: {
        baseModel: 'flux2-klein-9b',
        steps: 1500,
        repeats: 1,
        rank: 16,
        resolution: 512,
        learningRate: 0.0001,
        triggerWord: 'railstyle',
      },
    };
  };
  it('accepts 101 captioned images without relaxing other parameter limits', () => {
    expect(createLoraTrainingSchema.parse(input()).items).toHaveLength(101);
    expect(
      createLoraTrainingSchema.safeParse({
        ...input(),
        parameters: { ...input().parameters, repeats: 101 },
      }).success,
    ).toBe(false);
  });
  it('still refuses an empty dataset, duplicate images and blank captions', () => {
    const value = input();
    expect(
      createLoraTrainingSchema.safeParse({ ...value, items: [] }).success,
    ).toBe(false);
    expect(
      createLoraTrainingSchema.safeParse({
        ...value,
        items: [value.items[0], value.items[0]],
      }).success,
    ).toBe(false);
    expect(
      createLoraTrainingSchema.safeParse({
        ...value,
        items: value.items.map((item) => ({ ...item, caption: ' ' })),
      }).success,
    ).toBe(false);
  });
});
