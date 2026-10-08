import type { AiToolkitClient } from './client';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LoraTrainingWorker } from './worker';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  read: vi.fn(),
  notify: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../../config', () => ({
  getConfig: () => ({
    loraMaxDatasetBytes: 4000,
    loraWorkerLeaseSeconds: 180,
    loraTimeoutMs: 120_000,
    loraPollIntervalMs: 5000,
    loraModelPath: '/models/model',
    loraVaePath: '/models/vae',
  }),
}));
vi.mock('../../../database', () => ({ useDatabase: () => mocks.sql }));
vi.mock('../../../storage', () => ({
  readObject: mocks.read,
  deleteObject: vi.fn(),
  storeObject: vi.fn(),
}));
vi.mock('../../notifications/repository', () => ({
  createNotification: mocks.notify,
}));
vi.mock('../../audit/writer', () => ({ writeSystemAudit: mocks.audit }));

let leaseOwner = '';
let stopped = false;
let lostLease = false;
let inputBytes = 4;
const assets = Array.from({ length: 101 }, (_, index) => ({
  id: `asset-${index}`,
  filename: 'image.png',
  mimeType: 'image/png',
  objectKey: `key-${index}`,
  sizeBytes: 4,
}));

beforeEach(() => {
  vi.clearAllMocks();
  stopped = false;
  lostLease = false;
  inputBytes = 4;
  Object.assign(mocks.sql, {
    json: (value: unknown) => value,
    begin: (callback: (sql: unknown) => unknown) => callback(mocks.sql),
  });
  mocks.sql.mockImplementation(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join(' ');
      if (query.includes('SELECT job_id AS')) return [{ jobId: 'job' }];
      if (query.includes('lease_owner =') && query.includes('SET\n'))
        leaseOwner = String(values[0]);
      if (query.includes('COALESCE(('))
        return [
          {
            jobId: 'job',
            publicId: 'TSK-TEST',
            projectId: 'project',
            jobName: 'test',
            createdBy: 'user',
            status: 'pending',
            gpuIds: '0',
            externalJobId: null,
            datasetName: 'rail_dataset',
            inputAssets: assets.map((asset) => ({
              ...asset,
              sizeBytes: inputBytes,
            })),
            parameters: {
              baseModel: 'flux2-klein-9b',
              steps: 1500,
              totalSteps: 1500,
              repeats: 1,
              rank: 16,
              resolution: 512,
              learningRate: 0.0001,
              triggerWord: 'railstyle',
              previewPrompt: 'rail',
              datasetItems: assets.map((asset) => ({
                assetId: asset.id,
                caption: 'rail interior',
              })),
            },
          },
        ];
      if (query.includes('RETURNING status'))
        return lostLease
          ? []
          : [{ status: stopped ? 'cancel_requested' : 'submitting' }];
      if (query.includes('SELECT lease_owner'))
        return [
          {
            leaseOwner: lostLease ? 'another-worker' : leaseOwner,
            status: stopped ? 'cancel_requested' : 'submitting',
          },
        ];
      if (query.includes('RETURNING attempt_count')) return [{ attempts: 1 }];
      return [];
    },
  );
  mocks.read.mockResolvedValue(new Uint8Array(4));
});

function client() {
  return {
    getJobByRef: vi.fn(async () => null),
    createDataset: vi.fn(async () => ({ name: 'rail_dataset', success: true })),
    uploadDataset: vi.fn(async () => ({})),
    getDatasetRoot: vi.fn(async () => '/datasets'),
    createJob: vi.fn(async () => ({ id: 'external', status: 'stopped' })),
    start: vi.fn(async () => undefined),
  };
}
function queries() {
  return mocks.sql.mock.calls
    .map(([strings]) => (strings as TemplateStringsArray).join(' '))
    .join('\n');
}
async function run(adapter: ReturnType<typeof client>) {
  await new LoraTrainingWorker({
    client: adapter as unknown as AiToolkitClient,
  }).runOnce();
}

describe('loRA Worker batched submission', () => {
  it('creates and starts training only after all 7 batches, renewing its lease during preparation', async () => {
    const adapter = client();
    adapter.createJob.mockImplementation(async () => {
      expect(adapter.uploadDataset).toHaveBeenCalledTimes(7);
      return { id: 'external', status: 'stopped' };
    });
    await run(adapter);
    expect(adapter.start).toHaveBeenCalledWith('external', '0');
    expect(queries().match(/RETURNING status/g)?.length).toBeGreaterThan(100);
    expect(queries()).toContain('AND lease_expires_at > now()');
  });
  it('does not create or start training after a batch fails', async () => {
    const adapter = client();
    adapter.uploadDataset
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('offline'));
    await run(adapter);
    expect(adapter.createJob).not.toHaveBeenCalled();
    expect(adapter.start).not.toHaveBeenCalled();
    expect(mocks.read).toHaveBeenCalledTimes(32);
    expect(queries()).toContain('attempt_count = attempt_count + 1');
  });
  it('acknowledges cancellation between batches without creating a GPU task', async () => {
    const adapter = client();
    adapter.uploadDataset.mockImplementation(async () => {
      stopped = true;
      return {};
    });
    await run(adapter);
    expect(adapter.uploadDataset).toHaveBeenCalledOnce();
    expect(adapter.createJob).not.toHaveBeenCalled();
    expect(queries()).toContain("SET status = 'cancelled'");
  });
  it('does not write a retry or overwrite the job after losing its lease', async () => {
    const adapter = client();
    adapter.uploadDataset.mockImplementation(async () => {
      lostLease = true;
      return {};
    });
    await run(adapter);
    expect(adapter.createJob).not.toHaveBeenCalled();
    expect(queries()).not.toContain('attempt_count = attempt_count + 1');
    expect(queries()).not.toContain("SET status = 'failed'");
  });
  it('rechecks dataset capacity and fails safely before reading images', async () => {
    inputBytes = 100;
    const adapter = client();
    await run(adapter);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(adapter.uploadDataset).not.toHaveBeenCalled();
    expect(adapter.createJob).not.toHaveBeenCalled();
    expect(queries()).toContain("SET status = 'failed'");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ code: 'LORA_DATASET_TOO_LARGE' }),
      }),
    );
  });
});
