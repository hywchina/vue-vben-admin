import { describe, expect, it } from 'vitest';

import {
  AssistantProviderError,
  buildAssistantProviderMessage,
  detectAssistantProvider,
  parseAssistantProviderResponse,
  requestAssistantCompletion,
  selectRecentImageAttachmentIds,
} from './provider';

describe('assistant provider response', () => {
  it('accepts GeekAI/OpenAI and legacy provider payloads', () => {
    expect(
      parseAssistantProviderResponse({
        choices: [{ message: { content: '标准对话回复', role: 'assistant' } }],
        id: 'chatcmpl-1',
      }),
    ).toEqual({ content: '标准对话回复', messageId: 'chatcmpl-1' });
    expect(
      parseAssistantProviderResponse({
        content: '直接回复',
        messageId: 'upstream-1',
      }),
    ).toEqual({ content: '直接回复', messageId: 'upstream-1' });
    expect(
      parseAssistantProviderResponse({ data: { content: '嵌套回复' } }),
    ).toEqual({ content: '嵌套回复' });
  });

  it('rejects empty or incompatible provider payloads', () => {
    for (const payload of [
      {},
      { choices: [] },
      { content: '' },
      { result: '无效字段' },
    ]) {
      expect(() => parseAssistantProviderResponse(payload)).toThrow(
        AssistantProviderError,
      );
    }
  });

  it('builds controlled multimodal messages without pretending to read documents', () => {
    expect(
      buildAssistantProviderMessage({
        attachments: [
          {
            filename: 'reference.png',
            mimeType: 'image/png',
            url: 'https://objects.example/reference.png',
          },
          {
            filename: 'detail.webp',
            mimeType: 'image/webp',
            url: 'data:image/webp;base64,dGVzdA==',
          },
          {
            filename: 'requirements.pdf',
            mimeType: 'application/pdf',
            url: 'https://objects.example/requirements.pdf',
          },
        ],
        content: '请检查设计',
        role: 'user',
      }),
    ).toMatchObject({
      content: [
        { text: '请检查设计', type: 'text' },
        {
          image_url: { url: 'https://objects.example/reference.png' },
          type: 'image_url',
        },
        {
          image_url: { url: 'data:image/webp;base64,dGVzdA==' },
          type: 'image_url',
        },
        { text: expect.stringContaining('requirements.pdf'), type: 'text' },
      ],
      role: 'user',
    });
  });

  it('keeps the newest images within the vLLM request limits', () => {
    const selected = selectRecentImageAttachmentIds({
      attachments: [
        {
          id: 'old-image',
          messageId: 'message-1',
          mimeType: 'image/png',
          sizeBytes: 4,
        },
        {
          id: 'new-image-1',
          messageId: 'message-2',
          mimeType: 'image/png',
          sizeBytes: 4,
        },
        {
          id: 'new-image-2',
          messageId: 'message-2',
          mimeType: 'image/jpeg',
          sizeBytes: 4,
        },
      ],
      maxBytes: 8,
      maxImages: 2,
      messageIds: ['message-1', 'message-2'],
    });
    expect([...selected].toSorted()).toEqual(['new-image-1', 'new-image-2']);
  });

  it('identifies local vLLM without exposing its URL to the browser', () => {
    expect(
      detectAssistantProvider('http://127.0.0.1:18081/v1/chat/completions'),
    ).toBe('vLLM');
    expect(
      detectAssistantProvider('http://vllm:8000/v1/chat/completions'),
    ).toBe('vLLM');
  });

  it('sends the standard OpenAI/vLLM chat-completions contract and maps its response', async () => {
    let requestBody: Record<string, unknown> | undefined;
    let requestHeaders: Headers | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      expect(String(input)).toBe('http://127.0.0.1:18081/v1/chat/completions');
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestHeaders = new Headers(init?.headers);
      return Response.json(
        {
          choices: [
            { message: { content: '轨道客室设计建议', role: 'assistant' } },
          ],
          id: 'chatcmpl-mock',
        },
        { status: 200 },
      );
    };

    await expect(
      requestAssistantCompletion(
        {
          apiKey: 'test-only-key',
          apiUrl: 'http://127.0.0.1:18081/v1/chat/completions',
          messages: [
            { content: '你是设计助手', role: 'system' },
            { content: '第一轮：这是客室座椅方案', role: 'user' },
            { content: '已记录第一轮方案', role: 'assistant' },
            { content: '第二轮：在上一轮基础上调整 CMF', role: 'user' },
          ],
          model: 'qwen3-vl-8b-instruct',
          timeoutMs: 1000,
        },
        fetcher,
      ),
    ).resolves.toEqual({
      content: '轨道客室设计建议',
      messageId: 'chatcmpl-mock',
    });
    expect(requestHeaders?.get('authorization')).toBe('Bearer test-only-key');
    expect(requestBody).toMatchObject({
      messages: [
        { content: '你是设计助手', role: 'system' },
        { content: '第一轮：这是客室座椅方案', role: 'user' },
        { content: '已记录第一轮方案', role: 'assistant' },
        { content: '第二轮：在上一轮基础上调整 CMF', role: 'user' },
      ],
      model: 'qwen3-vl-8b-instruct',
      stream: false,
    });
  });

  it('maps provider authentication failures without exposing response bodies', async () => {
    const fetcher: typeof fetch = async () =>
      Response.json(
        { error: { message: 'sensitive' } },
        {
          status: 401,
        },
      );
    await expect(
      requestAssistantCompletion(
        {
          apiKey: 'invalid-test-key',
          apiUrl: 'https://geekai.co/api/v1/chat/completions',
          messages: [{ content: '你好', role: 'user' }],
          model: 'qwen3-vl-8b-instruct',
          timeoutMs: 1000,
        },
        fetcher,
      ),
    ).rejects.toMatchObject({ code: 'AI_ASSISTANT_AUTH_FAILED' });
  });
});
