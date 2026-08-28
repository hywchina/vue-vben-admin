import { describe, expect, it, vi } from 'vitest';

import { AiToolkitClient } from './client';

function json(value: unknown) {
  return Response.json(value, { status: 200 });
}

describe('aI Toolkit client', () => {
  it('uploads a dataset, submits a job and starts both job and GPU queue', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ success: true, name: 'rail_dataset' }))
      .mockResolvedValueOnce(json({ files: ['0001.png', '0001.txt'] }))
      .mockResolvedValueOnce(json({ DATASETS_FOLDER: '/srv/datasets' }))
      .mockResolvedValueOnce(json({ id: 'external-1', status: 'stopped' }))
      .mockResolvedValueOnce(json({ status: 'queued' }))
      .mockResolvedValueOnce(json({ is_running: true }));
    const client = new AiToolkitClient({
      apiUrl: 'http://toolkit.test/',
      fetchImplementation,
      timeoutMs: 1000,
      token: 'secret',
    });
    await client.createDataset('Rail Dataset');
    await client.uploadDataset('rail_dataset', [
      {
        bytes: new Uint8Array([137, 80, 78, 71]),
        filename: '0001.png',
        mimeType: 'image/png',
      },
      {
        bytes: new TextEncoder().encode('railstyle, interior'),
        filename: '0001.txt',
        mimeType: 'text/plain',
      },
    ]);
    expect(await client.getDatasetRoot()).toBe('/srv/datasets');
    const job = await client.createJob({
      gpuIds: '0',
      jobConfig: { job: 'extension' },
      jobRef: 'TSK-00000001',
      name: 'rail_lora_tsk_00000001',
    });
    await client.start(job.id, '0');
    expect(fetchImplementation).toHaveBeenCalledTimes(6);
    const uploadRequest = fetchImplementation.mock.calls[1]?.[1];
    expect(uploadRequest?.body).toBeInstanceOf(FormData);
    const createRequest = fetchImplementation.mock.calls[3]?.[1];
    const createHeaders = createRequest?.headers;
    expect(createHeaders).toBeInstanceOf(Headers);
    if (!(createHeaders instanceof Headers)) {
      throw new TypeError('Expected request headers');
    }
    expect(createHeaders.get('Authorization')).toBe('Bearer secret');
  });

  it('filters artifacts to safetensors files', async () => {
    const client = new AiToolkitClient({
      apiUrl: 'http://toolkit.test',
      fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(
        json({
          files: [
            { path: '/output/model.safetensors', size: 100 },
            { path: '/output/optimizer.pt', size: 50 },
          ],
        }),
      ),
      timeoutMs: 1000,
    });
    expect(await client.getFiles('job-1')).toEqual([
      { path: '/output/model.safetensors', size: 100 },
    ]);
  });
});
