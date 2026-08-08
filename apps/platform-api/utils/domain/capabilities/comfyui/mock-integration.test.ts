import type { AddressInfo } from 'node:net';

import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { WORKFLOW_CATALOG } from '../../workflows/catalog';
import {
  isWorkflowMediaParameter,
  materializeWorkflow,
  materializeWorkflowAssets,
  parseWorkflowVersion,
} from '../../workflows/schema';
import { ComfyUiClient } from './client';
import { extractComfyOutputFiles } from './worker';

const pixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('comfyUI mock protocol integration', () => {
  const servers: ReturnType<typeof createServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  it('materializes, submits, polls and downloads a text-to-image output', async () => {
    let submittedPrompt: Record<string, unknown> | undefined;
    let historyRequests = 0;
    const server = createServer(async (request, response) => {
      response.setHeader('access-control-allow-headers', 'content-type');
      response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      response.setHeader('access-control-allow-origin', '*');
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'POST' && url.pathname === '/prompt') {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          prompt: Record<string, unknown>;
        };
        submittedPrompt = body.prompt;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ number: 1, prompt_id: 'prompt-1' }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/history/prompt-1') {
        historyRequests += 1;
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify(
            historyRequests === 1
              ? {}
              : {
                  'prompt-1': {
                    outputs: {
                      '2': {
                        images: [
                          {
                            filename: 'rail-platform.png',
                            subfolder: '',
                            type: 'output',
                          },
                        ],
                      },
                    },
                    status: { completed: true, status_str: 'success' },
                  },
                },
          ),
        );
        return;
      }
      if (request.method === 'GET' && url.pathname === '/queue') {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            queue_pending: [[1, 'prompt-1', {}, {}, []]],
            queue_running: [],
          }),
        );
        return;
      }
      if (request.method === 'GET' && url.pathname === '/view') {
        response.setHeader('content-type', 'image/png');
        response.end(pixelPng);
        return;
      }
      response.statusCode = 404;
      response.end();
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as AddressInfo;
    const client = new ComfyUiClient({
      apiUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 2000,
    });

    const workflow = materializeWorkflow(
      {
        '1': {
          class_type: 'PrimitiveStringMultiline',
          inputs: { value: '' },
        },
        '2': { class_type: 'SaveImage', inputs: { images: ['1', 0] } },
      },
      [
        {
          advanced: false,
          key: 'prompt',
          label: '提示词',
          inputName: 'value',
          nodeId: '1',
          required: true,
          type: 'text',
        },
      ],
      { prompt: '明亮的轨道客室概念图' },
    );
    const submission = await client.submit(workflow, 'platform-job-1');
    expect(submission.externalJobId).toBe('prompt-1');
    expect(submittedPrompt?.['1']).toMatchObject({
      inputs: { value: '明亮的轨道客室概念图' },
    });

    expect(await client.getStatus(submission.externalJobId)).toMatchObject({
      status: 'queued',
    });
    const completed = await client.getStatus(submission.externalJobId);
    expect(completed.status).toBe('succeeded');
    const [output] = extractComfyOutputFiles(completed.outputs ?? {}, [
      {
        field: 'images',
        kind: 'image',
        nodeId: '2',
        role: 'primary',
      },
    ]);
    expect(output?.file.filename).toBe('rail-platform.png');
    if (!output) throw new Error('模拟服务没有返回预期输出');
    const downloaded = await client.download(output.file);
    expect(downloaded.mimeType).toBe('image/png');
    expect(Buffer.from(downloaded.bytes)).toEqual(pixelPng);
  });

  it('simulates submission and mapped outputs for all registered workflows', async () => {
    const outputByPrompt = new Map<
      string,
      { field: string; kind: string; nodeId: string }
    >();
    let promptSequence = 0;
    let pendingOutput:
      | undefined
      | { field: string; kind: string; nodeId: string };
    const server = createServer(async (request, response) => {
      response.setHeader('access-control-allow-headers', 'content-type');
      response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      response.setHeader('access-control-allow-origin', '*');
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'POST' && url.pathname === '/prompt') {
        for await (const _chunk of request) {
          // Drain the real prompt payload to exercise request serialization.
        }
        const promptId = `catalog-${++promptSequence}`;
        if (!pendingOutput) throw new Error('模拟输出定义缺失');
        outputByPrompt.set(promptId, pendingOutput);
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({ number: promptSequence, prompt_id: promptId }),
        );
        return;
      }
      if (request.method === 'GET' && url.pathname.startsWith('/history/')) {
        const promptId = decodeURIComponent(
          url.pathname.slice('/history/'.length),
        );
        const output = outputByPrompt.get(promptId);
        if (!output) {
          response.statusCode = 404;
          response.end('{}');
          return;
        }
        const value =
          output.kind === 'text'
            ? ['模拟 ComfyUI 文本输出']
            : [
                {
                  filename:
                    output.kind === 'model3d'
                      ? 'mock-output.glb'
                      : 'mock-output.png',
                  subfolder: '',
                  type: 'output',
                },
              ];
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({
            [promptId]: {
              outputs: { [output.nodeId]: { [output.field]: value } },
              status: { completed: true, status_str: 'success' },
            },
          }),
        );
        return;
      }
      if (request.method === 'GET' && url.pathname === '/view') {
        const isGlb = url.searchParams.get('filename')?.endsWith('.glb');
        response.setHeader(
          'content-type',
          isGlb ? 'model/gltf-binary' : 'image/png',
        );
        response.end(isGlb ? Buffer.from('glTF-mock') : pixelPng);
        return;
      }
      response.statusCode = 404;
      response.end('{}');
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as AddressInfo;
    const client = new ComfyUiClient({
      apiUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 2000,
    });

    for (const entry of WORKFLOW_CATALOG) {
      const apiJson = JSON.parse(
        await readFile(
          resolve(process.cwd(), 'workflows/comfyui', entry.fileName),
          'utf8',
        ),
      ) as unknown;
      const parsed = parseWorkflowVersion({ apiJson, ...entry.version });
      const parameters = Object.fromEntries(
        parsed.parameterSchema
          .filter(
            (field) =>
              !isWorkflowMediaParameter(field) || field.type === 'region',
          )
          .flatMap((field) =>
            field.defaultValue === undefined
              ? []
              : [[field.key, field.defaultValue]],
          ),
      );
      let prompt = materializeWorkflow(
        parsed.apiJson,
        parsed.parameterSchema,
        parameters,
      );
      const assets = new Map<
        number,
        { dataUrl: string; kind: string; uploadName: string }
      >();
      for (const field of parsed.parameterSchema.filter(
        isWorkflowMediaParameter,
      )) {
        if (field.assetIndex === undefined) continue;
        assets.set(field.assetIndex, {
          dataUrl: 'data:image/png;base64,AA==',
          kind: 'image',
          uploadName: `rail-platform/mock/input-${field.assetIndex}.png`,
        });
      }
      prompt = materializeWorkflowAssets(
        prompt,
        parsed.parameterSchema,
        assets,
      );
      const primaryOutput = parsed.outputSchema.find(
        (output) => output.role === 'primary',
      );
      if (!primaryOutput) throw new Error('工作流缺少主要输出');
      pendingOutput = primaryOutput;
      const submitted = await client.submit(prompt, entry.application.key);
      const completed = await client.getStatus(submitted.externalJobId);
      expect(completed.status).toBe('succeeded');
      const [mapped] = extractComfyOutputFiles(
        completed.outputs ?? {},
        parsed.outputSchema,
      );
      expect(mapped).toBeDefined();
      if (!mapped) {
        throw new Error(`${entry.application.key} 缺少映射输出`);
      }
      let outputBytesLength: number;
      if (mapped.inline) {
        outputBytesLength = mapped.inline.bytes.byteLength;
      } else {
        const downloaded = await client.download(mapped.file);
        outputBytesLength = downloaded.bytes.byteLength;
      }
      expect(outputBytesLength).toBeGreaterThan(0);
    }

    expect(promptSequence).toBe(WORKFLOW_CATALOG.length);
  });

  it('uses both queue deletion and interrupt for cancellation', async () => {
    const requests: { body: unknown; path: string }[] = [];
    const server = createServer(async (request, response) => {
      response.setHeader('access-control-allow-headers', 'content-type');
      response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      response.setHeader('access-control-allow-origin', '*');
      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push({
        body:
          chunks.length > 0
            ? JSON.parse(Buffer.concat(chunks).toString())
            : undefined,
        path: request.url ?? '',
      });
      response.setHeader('content-type', 'application/json');
      response.end('{}');
    });
    servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as AddressInfo;
    const client = new ComfyUiClient({
      apiUrl: `http://127.0.0.1:${address.port}`,
      timeoutMs: 2000,
    });

    await client.cancel('prompt-2');
    expect(requests).toEqual([
      { body: { delete: ['prompt-2'] }, path: '/queue' },
      { body: { prompt_id: 'prompt-2' }, path: '/interrupt' },
    ]);
  });
});
