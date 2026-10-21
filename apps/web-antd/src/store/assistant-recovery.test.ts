import type { AiMessage } from '#/api/platform/assistant';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAiMessagesApi, sendAiMessageApi } from '#/api/platform/assistant';
import { requestClient } from '#/api/request';
import {
  findAssistantReply,
  recoverAssistantReply,
} from '#/components/assistant/message-recovery';

vi.mock('#/api/request', () => ({
  requestClient: { get: vi.fn(), post: vi.fn() },
}));

const user = {
  id: 'user-message',
  role: 'user',
  status: 'completed',
  attachments: [],
} as unknown as AiMessage;
const reply = {
  id: 'reply',
  role: 'assistant',
  status: 'completed',
  attachments: [],
  content: '回答',
  createdAt: '2026-10-21T00:00:00.000Z',
  errorCode: null,
} as AiMessage;
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('assistant slow replies and connection recovery', () => {
  it('waits 240 seconds only on send and keeps normal reads on the shared client', () => {
    const input = {
      content: '设计问题',
      attachmentIds: [],
      clientMessageId: user.id,
    };
    sendAiMessageApi('conversation', input);
    expect(requestClient.post).toHaveBeenCalledWith(
      '/assistant/conversations/conversation/messages',
      input,
      { timeout: 240_000, showErrorMessage: false },
    );
    getAiMessagesApi('conversation');
    expect(requestClient.get).toHaveBeenCalledWith(
      '/assistant/conversations/conversation/messages',
      { showErrorMessage: true },
    );
    getAiMessagesApi('conversation', true);
    expect(requestClient.get).toHaveBeenLastCalledWith(
      '/assistant/conversations/conversation/messages',
      { showErrorMessage: false },
    );
  });

  it('only attributes a reply after the exact submitted message', () => {
    expect(findAssistantReply([reply, user], user.id)).toBeUndefined();
    expect(findAssistantReply([user, reply], user.id)).toBe(reply);
    expect(
      findAssistantReply(
        [user, { ...user, id: 'another-send' }, reply],
        user.id,
      ),
    ).toBeUndefined();
    expect(findAssistantReply([reply], user.id)).toBeUndefined();
  });

  it('recovers after a disconnect without posting the question again', async () => {
    vi.useFakeTimers();
    const readMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([user])
      .mockResolvedValue([user, reply]);
    const onMessages = vi.fn();
    const result = recoverAssistantReply({
      userMessageId: user.id,
      readMessages,
      onMessages,
      shouldStop: () => false,
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await result).toBe(reply);
    expect(onMessages).toHaveBeenLastCalledWith([user, reply]);
    expect(requestClient.post).not.toHaveBeenCalled();
  });

  it('preserves real model failure and stops polling at the deadline', async () => {
    const failed = {
      ...reply,
      status: 'failed' as const,
      errorCode: 'AI_ASSISTANT_TIMEOUT',
    };
    expect(
      await recoverAssistantReply({
        userMessageId: user.id,
        readMessages: async () => [user, failed],
        onMessages: vi.fn(),
        shouldStop: () => false,
      }),
    ).toBe(failed);
    vi.useFakeTimers();
    const readMessages = vi.fn().mockResolvedValue([user]);
    const result = recoverAssistantReply({
      userMessageId: user.id,
      readMessages,
      onMessages: vi.fn(),
      shouldStop: () => false,
      timeoutMs: 3000,
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await result).toBeUndefined();
    expect(readMessages).toHaveBeenCalledTimes(2);
  });

  it('does not apply an old response after leaving the conversation', async () => {
    let stopped = false;
    let resolve!: (value: AiMessage[]) => void;
    const onMessages = vi.fn();
    const result = recoverAssistantReply({
      userMessageId: user.id,
      readMessages: () =>
        new Promise((done) => {
          resolve = done;
        }),
      onMessages,
      shouldStop: () => stopped,
    });
    stopped = true;
    resolve([user, reply]);
    await result;
    expect(onMessages).not.toHaveBeenCalled();
  });
});
