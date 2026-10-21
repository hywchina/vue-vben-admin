import type { AiMessage } from '#/api/platform/assistant';

export function findAssistantReply(
  messages: AiMessage[],
  userMessageId: string,
) {
  const index = messages.findIndex(
    (item) => item.id === userMessageId && item.role === 'user',
  );
  if (index === -1) return;
  for (const item of messages.slice(index + 1)) {
    // A later submission makes attribution ambiguous; never display it as this reply.
    if (item.role === 'user') return;
    if (item.role === 'assistant') return item;
  }
}

export async function recoverAssistantReply(input: {
  onMessages: (messages: AiMessage[]) => void;
  readMessages: () => Promise<AiMessage[]>;
  shouldStop: () => boolean;
  timeoutMs?: number;
  userMessageId: string;
}) {
  const deadline = Date.now() + (input.timeoutMs ?? 240_000);
  while (!input.shouldStop() && Date.now() < deadline) {
    try {
      const messages = await input.readMessages();
      if (input.shouldStop()) return;
      input.onMessages(messages);
      const reply = findAssistantReply(messages, input.userMessageId);
      if (reply) return reply;
    } catch {
      // Reading can fail during a temporary disconnect; never repeat the POST.
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
