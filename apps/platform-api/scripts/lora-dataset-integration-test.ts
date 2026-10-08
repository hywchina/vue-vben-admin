import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import { AiToolkitClient } from '../utils/domain/capabilities/lora/client';
import { uploadLoraDatasetBatches } from '../utils/domain/capabilities/lora/dataset';
import { deleteObject, readObject, storeObject } from '../utils/storage';

const key = `integration/lora-dataset-${randomUUID()}/source.png`;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const received = new Map<string, Uint8Array>();
const batchSizes: number[] = [];
let failBatch = 0;
let requests = 0;
const server = createServer(async (request, response) => {
  try {
    assert.equal(request.url, '/api/datasets/upload');
    assert.equal(request.method, 'POST');
    requests++;
    if (requests === failBatch) {
      response.writeHead(503).end('temporary upload failure');
      request.resume();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const form = await new Request('http://127.0.0.1/api/datasets/upload', {
      method: 'POST',
      headers: { 'content-type': request.headers['content-type'] ?? '' },
      body: new Uint8Array(Buffer.concat(chunks)),
    }).formData();
    assert.equal(form.get('datasetName'), 'rail_integration_dataset');
    const files = form.getAll('files') as File[];
    assert.ok(files.length > 0 && files.length <= 32 && files.length % 2 === 0);
    batchSizes.push(files.length / 2);
    for (const file of files)
      received.set(file.name, new Uint8Array(await file.arrayBuffer()));
    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ files: files.map((file) => file.name) }));
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});

try {
  await storeObject(key, 'image/png', png);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const client = new AiToolkitClient({
    apiUrl: `http://127.0.0.1:${address.port}`,
    timeoutMs: 5000,
  });
  const assets = Array.from({ length: 101 }, () => ({
    id: randomUUID(),
    filename: 'source.png',
    mimeType: 'image/png',
    objectKey: key,
    sizeBytes: png.byteLength,
  }));
  const input = {
    assets,
    items: assets.map((asset) => ({
      assetId: asset.id,
      caption: 'rail cabin',
    })),
    maxDatasetBytes: png.byteLength * assets.length,
    triggerWord: 'railstyle',
    read: readObject,
    upload: (files: Parameters<AiToolkitClient['uploadDataset']>[1]) =>
      client.uploadDataset('rail_integration_dataset', files),
  };
  await uploadLoraDatasetBatches(input);
  assert.deepEqual(batchSizes, [16, 16, 16, 16, 16, 16, 5]);
  assert.equal(received.size, 202);
  assert.deepEqual(received.get('0101.png'), new Uint8Array(png));
  assert.equal(
    new TextDecoder().decode(received.get('0101.txt')),
    'railstyle, rail cabin',
  );
  const before = requests;
  await assert.rejects(
    uploadLoraDatasetBatches({
      ...input,
      maxDatasetBytes: input.maxDatasetBytes - 1,
    }),
    { code: 'LORA_DATASET_TOO_LARGE' },
  );
  assert.equal(requests, before);
  requests = 0;
  failBatch = 2;
  await assert.rejects(uploadLoraDatasetBatches(input), /HTTP 503/);
  assert.equal(requests, 2);
  failBatch = 0;
  await uploadLoraDatasetBatches(input);
  assert.equal(received.size, 202, '重试覆盖同名文件，不生成重复图片/标注');
  console.warn(
    'LoRA 数据集集成通过：真实 MinIO 读取、101 图/202 文件分批 HTTP multipart、配对与总容量保护、失败停止和同名重试；未创建 GPU 任务。',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await deleteObject(key);
}
