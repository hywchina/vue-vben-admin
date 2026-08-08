import { describe, expect, it } from 'vitest';

import {
  AssistantProviderError,
  parseAssistantProviderResponse,
} from './provider';

describe('assistant provider response', () => {
  it('accepts direct and nested provider payloads', () => {
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
    for (const payload of [{}, { content: '' }, { result: '无效字段' }]) {
      expect(() => parseAssistantProviderResponse(payload)).toThrowError(
        AssistantProviderError,
      );
    }
  });
});
