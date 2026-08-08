import { describe, expect, it, vi } from 'vitest';

import { ComfyUiClient } from './client';

function jsonResponse(value: unknown) {
  return Response.json(value, {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

describe('comfyUI client', () => {
  it('submits, polls and downloads an output', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ number: 1, prompt_id: 'prompt-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          'prompt-1': {
            outputs: {
              '356': {
                images: [
                  { filename: 'output.png', subfolder: '', type: 'output' },
                ],
              },
            },
            status: { status_str: 'success' },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png' },
          status: 200,
        }),
      );
    const client = new ComfyUiClient({
      apiUrl: 'http://comfy.test',
      fetchImplementation,
      timeoutMs: 1000,
    });
    const submitted = await client.submit({ '1': {} }, 'job-1');
    const status = await client.getStatus(submitted.externalJobId);
    const output = await client.download({
      filename: 'output.png',
      type: 'output',
    });
    expect(submitted.externalJobId).toBe('prompt-1');
    expect(status.status).toBe('succeeded');
    expect(output.mimeType).toBe('image/png');
  });

  it('reports execution errors and targets cancellation by prompt id', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          'prompt-2': {
            status: {
              messages: [
                ['execution_error', { exception_message: '模型文件不存在' }],
              ],
              status_str: 'error',
            },
          },
        }),
      )
      .mockResolvedValue(jsonResponse({}));
    const client = new ComfyUiClient({
      apiUrl: 'http://comfy.test',
      fetchImplementation,
      timeoutMs: 1000,
    });
    expect(await client.getStatus('prompt-2')).toMatchObject({
      errorCode: 'COMFYUI_EXECUTION_FAILED',
      errorMessage: '模型文件不存在',
      status: 'failed',
    });
    await client.cancel('prompt-2');
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('uploads a platform input asset to the controlled ComfyUI subfolder', async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ name: 'source.png', subfolder: 'rail-platform/job-1' }),
      );
    const client = new ComfyUiClient({
      apiUrl: 'http://comfy.test',
      fetchImplementation,
      timeoutMs: 1000,
    });
    const uploaded = await client.uploadInput({
      bytes: new Uint8Array([137, 80, 78, 71]),
      filename: 'source.png',
      mimeType: 'image/png',
      subfolder: 'rail-platform/job-1',
    });
    expect(uploaded.value).toBe('rail-platform/job-1/source.png');
    const request = fetchImplementation.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(FormData);
  });
});
