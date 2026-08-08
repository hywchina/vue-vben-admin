import { describe, expect, it } from 'vitest';

import {
  AssistantProviderError,
  buildAssistantProviderMessage,
  parseAssistantProviderResponse,
  requestAssistantCompletion,
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
        { text: expect.stringContaining('requirements.pdf'), type: 'text' },
      ],
      role: 'user',
    });
  });

  it('sends the GeekAI chat-completions contract and maps its response', async () => {
    let requestBody: Record<string, unknown> | undefined;
    let requestHeaders: Headers | undefined;
    const fetcher: typeof fetch = async (input, init) => {
      expect(String(input)).toBe('https://geekai.co/api/v1/chat/completions');
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
          apiUrl: 'https://geekai.co/api/v1/chat/completions',
          messages: [{ content: '你好', role: 'user' }],
          model: 'deepseek-v4-flash-0731',
          sessionId: '5f7aa1c4-748f-4b98-bf5c-6a172255f8bb',
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
      messages: [{ content: '你好', role: 'user' }],
      model: 'deepseek-v4-flash-0731',
      sess_id: '5f7aa1c4-748f-4b98-bf5c-6a172255f8bb',
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
          model: 'deepseek-v4-flash-0731',
          sessionId: 'a957c787-e0f1-4f1e-aa42-9e67d17e39c4',
          timeoutMs: 1000,
        },
        fetcher,
      ),
    ).rejects.toMatchObject({ code: 'AI_ASSISTANT_AUTH_FAILED' });
  });
});
