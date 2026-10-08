import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AiAssistant from '#/components/assistant/ai-assistant.vue';
import { assetImageDragType } from '#/components/assistant/asset-image-drag';

const api = vi.hoisted(() => ({
  clearAiMessagesApi: vi.fn(),
  createAiConversationApi: vi.fn(),
  deleteAiConversationApi: vi.fn(),
  getAiAssistantStatusApi: vi.fn(),
  getAiAttachmentDownloadApi: vi.fn(),
  getAiAttachmentPreviewApi: vi.fn(),
  getAiConversationsApi: vi.fn(),
  getAiMessagesApi: vi.fn(),
  getAssetPreviewApi: vi.fn(),
  removeAiAttachmentApi: vi.fn(),
  renameAiConversationApi: vi.fn(),
  sendAiMessageApi: vi.fn(),
  uploadAiAttachmentApi: vi.fn(),
}));
const notices = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
}));
vi.mock('#/api', () => api);
vi.mock('@vben/icons', () => ({ IconifyIcon: { render: () => null } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/design' }) }));
vi.mock('ant-design-vue', () => ({
  message: notices,
  Modal: { confirm: vi.fn() },
}));
vi.mock('#/components/platform/platform-markdown.vue', () => ({
  default: { render: () => null },
}));

let dispose: () => void;
beforeEach(() => {
  vi.resetAllMocks();
  api.getAiAssistantStatusApi.mockResolvedValue({
    configured: true,
    maxImagesPerMessage: 4,
    maxAttachmentBytes: 1024,
  });
  api.getAiConversationsApi.mockResolvedValue([]);
  api.getAiMessagesApi.mockResolvedValue([]);
  api.getAssetPreviewApi.mockResolvedValue({
    mode: 'url',
    mimeType: 'image/png',
    url: '/fresh-url',
  });
  api.createAiConversationApi.mockResolvedValue({ id: 'test-conversation' });
  api.uploadAiAttachmentApi.mockResolvedValue({ id: 'test-attachment' });
  api.sendAiMessageApi.mockResolvedValue({ serviceError: null });
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(
        async () => new Response(new Blob(['png'], { type: 'image/png' })),
      ),
  );
  const root = document.createElement('div');
  document.body.append(root);
  const app = createApp(AiAssistant);
  app.mount(root);
  dispose = () => {
    app.unmount();
    root.remove();
  };
});
afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
});

function button(label: string) {
  const element = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  );
  if (!element) throw new Error(`Missing button ${label}`);
  return element;
}
async function open() {
  button('打开 AI 设计助手').click();
  await vi.waitFor(() => expect(api.getAiConversationsApi).toHaveBeenCalled());
  await nextTick();
}
function drag(type = 'drop', index = 0) {
  const zone = required(
    document.querySelector('[data-testid="assistant-attachment-dropzone"]'),
  );
  const transfer = new DataTransfer();
  transfer.setData(
    assetImageDragType,
    JSON.stringify({
      version: 1,
      assetId: `7cc01e26-3d58-4f4c-9d04-dd3f5404611${index}`,
      name: `客室${index}.png`,
    }),
  );
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  zone.dispatchEvent(event);
  return event;
}
function pendingCount() {
  return document.querySelectorAll('.rail-ai-pending-file').length;
}

describe('assistant image drop interaction', () => {
  it('shows drop feedback, stages a preview without sending, then uses existing upload/send', async () => {
    await open();
    drag('dragenter');
    await nextTick();
    expect(document.querySelector('.is-drop-active')).not.toBeNull();
    expect(document.body.textContent).toContain('松开添加');
    drag();
    await vi.waitFor(() => expect(pendingCount()).toBe(1));
    expect(document.querySelector('.is-drop-active')).toBeNull();
    expect(api.uploadAiAttachmentApi).not.toHaveBeenCalled();
    expect(api.sendAiMessageApi).not.toHaveBeenCalled();
    expect(document.querySelector('.rail-ai-pending-file img')).not.toBeNull();
    const input = required(
      document.querySelector<HTMLTextAreaElement>(
        '.rail-ai-input-shell textarea',
      ),
    );
    input.value = '分析客室材质';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    button('发送消息').click();
    await vi.waitFor(() =>
      expect(api.sendAiMessageApi).toHaveBeenCalledWith('test-conversation', {
        attachmentIds: ['test-attachment'],
        content: '分析客室材质',
      }),
    );
    expect(api.uploadAiAttachmentApi.mock.calls[0]?.[1].name).toBe('客室0.png');
    await vi.waitFor(() => expect(pendingCount()).toBe(0));
  });
  it('deduplicates dragged assets and enforces the configured image limit', async () => {
    await open();
    for (let i = 0; i < 4; i++) {
      drag('drop', i);
      await vi.waitFor(() => expect(pendingCount()).toBe(i + 1));
    }
    drag();
    expect(notices.info).toHaveBeenCalledWith('这张图片已在待发送附件中');
    drag('drop', 4);
    expect(notices.warning).toHaveBeenCalledWith(
      expect.stringContaining('4 张图片'),
    );
    expect(api.getAssetPreviewApi).toHaveBeenCalledTimes(4);
  });
  it('keeps permission/read failure out of pending attachments and permits retry', async () => {
    await open();
    api.getAssetPreviewApi.mockRejectedValueOnce(new Error('无权读取该图片'));
    drag();
    await vi.waitFor(() =>
      expect(notices.error).toHaveBeenCalledWith('无权读取该图片'),
    );
    expect(pendingCount()).toBe(0);
    drag();
    await vi.waitFor(() => expect(pendingCount()).toBe(1));
    button('移除 客室0.png').click();
    await nextTick();
    expect(pendingCount()).toBe(0);
    expect(api.removeAiAttachmentApi).not.toHaveBeenCalled();
  });
  it('blocks send and conversation switching while the image is being read', async () => {
    await open();
    let resolve: (value: unknown) => void = () => {};
    api.getAssetPreviewApi.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    drag();
    await nextTick();
    expect(button('发送消息').disabled).toBe(true);
    expect(button('新建对话').disabled).toBe(true);
    expect(button('选择历史对话').disabled).toBe(true);
    resolve({ mode: 'url', mimeType: 'image/png', url: '/fresh-url' });
    await vi.waitFor(() => expect(pendingCount()).toBe(1));
    expect(button('发送消息').disabled).toBe(false);
  });
});

function required<T>(value: null | T): T {
  if (value === null) throw new Error('Missing assistant element');
  return value;
}
