<script lang="ts" setup>
import type { AiAssistantStatus, AiConversation, AiMessage } from '#/api';

import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { message, Modal } from 'ant-design-vue';

import {
  clearAiMessagesApi,
  createAiConversationApi,
  getAiAssistantStatusApi,
  getAiAttachmentDownloadApi,
  getAiAttachmentPreviewApi,
  getAiConversationsApi,
  getAiMessagesApi,
  removeAiAttachmentApi,
  sendAiMessageApi,
  uploadAiAttachmentApi,
} from '#/api';
import { usePlatformStore } from '#/store';

interface PendingFile {
  attachmentId?: string;
  file: File;
  id: string;
  previewUrl?: string;
  state: 'failed' | 'local' | 'ready' | 'uploading';
}

const platformStore = usePlatformStore();
const isOpen = ref(false);
const initialized = ref(false);
const initializing = ref(false);
const loadingMessages = ref(false);
const sending = ref(false);
const status = ref<AiAssistantStatus>();
const conversations = ref<AiConversation[]>([]);
const activeConversationId = ref('');
const messages = ref<AiMessage[]>([]);
const draft = ref('');
const pendingFiles = ref<PendingFile[]>([]);
const fileInput = ref<HTMLInputElement>();
const composerInput = ref<HTMLTextAreaElement>();
const messageViewport = ref<HTMLElement>();
const imagePreviewUrls = reactive(new Map<string, string>());

const attachmentAccept =
  '.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.mp4,.mov,.webm,.txt,.md,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';
const defaultMaxAttachmentBytes = 50 * 1024 * 1024;

const activeConversation = computed(() =>
  conversations.value.find(
    (conversation) => conversation.id === activeConversationId.value,
  ),
);
const contextProjectName = computed(
  () =>
    activeConversation.value?.projectName ??
    platformStore.currentProject?.name ??
    '未关联项目',
);
const canSend = computed(
  () =>
    !sending.value &&
    (draft.value.trim().length > 0 || pendingFiles.value.length > 0),
);

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function conversationLabel(conversation: AiConversation) {
  const project = conversation.projectName
    ? ` · ${conversation.projectName}`
    : '';
  return `${conversation.title}${project}`;
}

async function scrollToLatest() {
  await nextTick();
  const viewport = messageViewport.value;
  if (viewport) viewport.scrollTop = viewport.scrollHeight;
}

async function loadImagePreviews(nextMessages: AiMessage[], requestId: string) {
  const imageAttachments = nextMessages.flatMap((item) =>
    item.attachments.filter((attachment) => attachment.isImage),
  );
  await Promise.allSettled(
    imageAttachments.map(async (attachment) => {
      const result = await getAiAttachmentPreviewApi(attachment.id);
      if (activeConversationId.value === requestId) {
        imagePreviewUrls.set(attachment.id, result.url);
      }
    }),
  );
}

async function loadMessages(conversationId: string) {
  if (!conversationId) {
    messages.value = [];
    return;
  }
  loadingMessages.value = true;
  imagePreviewUrls.clear();
  try {
    const result = await getAiMessagesApi(conversationId);
    if (activeConversationId.value !== conversationId) return;
    messages.value = result;
    void loadImagePreviews(result, conversationId);
    await scrollToLatest();
  } finally {
    if (activeConversationId.value === conversationId) {
      loadingMessages.value = false;
    }
  }
}

async function refreshConversations() {
  conversations.value = await getAiConversationsApi();
}

async function initializeAssistant() {
  if (initialized.value || initializing.value) return;
  initializing.value = true;
  try {
    const [nextStatus, nextConversations] = await Promise.all([
      getAiAssistantStatusApi(),
      getAiConversationsApi(),
    ]);
    status.value = nextStatus;
    conversations.value = nextConversations;
    activeConversationId.value = nextConversations[0]?.id ?? '';
    if (activeConversationId.value) {
      await loadMessages(activeConversationId.value);
    }
    initialized.value = true;
  } finally {
    initializing.value = false;
  }
}

async function openAssistant() {
  isOpen.value = true;
  await initializeAssistant();
  await nextTick();
  composerInput.value?.focus();
}

function closeAssistant() {
  isOpen.value = false;
}

function releasePendingFiles() {
  for (const item of pendingFiles.value) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
  pendingFiles.value = [];
}

async function startNewConversation() {
  activeConversationId.value = '';
  messages.value = [];
  draft.value = '';
  releasePendingFiles();
  await nextTick();
  composerInput.value?.focus();
}

async function selectConversation(event: Event) {
  const target = event.target as HTMLSelectElement;
  activeConversationId.value = target.value;
  messages.value = [];
  releasePendingFiles();
  if (target.value) await loadMessages(target.value);
}

function chooseFiles() {
  fileInput.value?.click();
}

function handleFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  const selectedFiles = [...(target.files ?? [])];
  target.value = '';
  const remainingSlots = Math.max(0, 8 - pendingFiles.value.length);
  if (selectedFiles.length > remainingSlots) {
    message.warning('每条消息最多添加 8 个附件');
  }
  const maxBytes =
    status.value?.maxAttachmentBytes ?? defaultMaxAttachmentBytes;
  for (const file of selectedFiles.slice(0, remainingSlots)) {
    if (file.size === 0) {
      message.warning(`${file.name} 是空文件，已跳过`);
      continue;
    }
    if (file.size > maxBytes) {
      message.warning(`${file.name} 超过单个附件上限 ${formatBytes(maxBytes)}`);
      continue;
    }
    pendingFiles.value.push({
      file,
      id: createLocalId(),
      previewUrl: file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : undefined,
      state: 'local',
    });
  }
}

async function removePendingFile(item: PendingFile) {
  if (item.attachmentId) {
    try {
      await removeAiAttachmentApi(item.attachmentId);
    } catch {
      return;
    }
  }
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  pendingFiles.value = pendingFiles.value.filter(
    (candidate) => candidate.id !== item.id,
  );
}

async function ensureConversation() {
  if (activeConversationId.value) return activeConversationId.value;
  const conversation = await createAiConversationApi(
    platformStore.currentProjectId || undefined,
  );
  conversations.value.unshift(conversation);
  activeConversationId.value = conversation.id;
  return conversation.id;
}

async function uploadPendingFiles(conversationId: string) {
  const attachmentIds: string[] = [];
  for (const item of pendingFiles.value) {
    if (item.attachmentId && item.state === 'ready') {
      attachmentIds.push(item.attachmentId);
      continue;
    }
    item.state = 'uploading';
    try {
      const attachment = await uploadAiAttachmentApi(conversationId, item.file);
      item.attachmentId = attachment.id;
      item.state = 'ready';
      attachmentIds.push(attachment.id);
    } catch (error) {
      item.state = 'failed';
      throw error;
    }
  }
  return attachmentIds;
}

async function handleSend() {
  if (!canSend.value) return;
  const submittedDraft = draft.value;
  draft.value = '';
  sending.value = true;
  try {
    const conversationId = await ensureConversation();
    const attachmentIds = await uploadPendingFiles(conversationId);
    const result = await sendAiMessageApi(conversationId, {
      attachmentIds,
      content: submittedDraft,
    });
    releasePendingFiles();
    await Promise.all([loadMessages(conversationId), refreshConversations()]);
    if (result.serviceError) {
      message.warning(result.serviceError.message);
    }
  } catch (error) {
    if (!draft.value) draft.value = submittedDraft;
    if (error instanceof Error && error.message.startsWith('附件上传失败')) {
      message.error(error.message);
    }
  } finally {
    sending.value = false;
    await nextTick();
    composerInput.value?.focus();
  }
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  void handleSend();
}

function confirmClearConversation() {
  if (!activeConversationId.value || messages.value.length === 0) return;
  Modal.confirm({
    cancelText: '取消',
    centered: true,
    content: '此操作会删除当前对话中的所有消息和附件，且无法恢复。',
    okButtonProps: { danger: true },
    okText: '清空对话',
    async onOk() {
      const conversationId = activeConversationId.value;
      await clearAiMessagesApi(conversationId);
      messages.value = [];
      imagePreviewUrls.clear();
      await refreshConversations();
      message.success('当前对话已清空');
    },
    title: '确认清空对话？',
  });
}

async function downloadAttachment(attachmentId: string) {
  const result = await getAiAttachmentDownloadApi(attachmentId);
  window.open(result.url, '_blank', 'noopener,noreferrer');
}

function useSuggestion(text: string) {
  draft.value = text;
  nextTick(() => composerInput.value?.focus());
}

onBeforeUnmount(() => releasePendingFiles());
</script>

<template>
  <Teleport to="body">
    <Transition name="rail-ai-panel">
      <section
        v-if="isOpen"
        class="rail-ai-assistant"
        role="dialog"
        aria-label="AI 设计助手"
        @keydown.esc="closeAssistant"
      >
        <div class="rail-ai-track" aria-hidden="true">
          <span></span><i></i><span></span>
        </div>

        <header class="rail-ai-header">
          <div class="rail-ai-brand">
            <span class="rail-ai-brand__mark">
              <IconifyIcon icon="lucide:bot" />
            </span>
            <div>
              <div class="rail-ai-brand__title">AI 设计助手</div>
              <div class="rail-ai-brand__status">
                <span
                  class="rail-ai-status-dot"
                  :class="{ 'is-ready': status?.configured }"
                ></span>
                {{
                  status?.configured
                    ? `${status.provider} · ${status.model}`
                    : 'AI 服务待接入'
                }}
              </div>
            </div>
          </div>
          <div class="rail-ai-actions">
            <button
              type="button"
              title="新建对话"
              aria-label="新建对话"
              @click="startNewConversation"
            >
              <IconifyIcon icon="lucide:square-pen" />
            </button>
            <button
              type="button"
              title="清空当前对话"
              aria-label="清空当前对话"
              :disabled="!activeConversationId || messages.length === 0"
              @click="confirmClearConversation"
            >
              <IconifyIcon icon="lucide:trash-2" />
            </button>
            <button
              type="button"
              title="关闭"
              aria-label="关闭 AI 设计助手"
              @click="closeAssistant"
            >
              <IconifyIcon icon="lucide:x" />
            </button>
          </div>
        </header>

        <div class="rail-ai-context">
          <label>
            <IconifyIcon icon="lucide:messages-square" />
            <select
              aria-label="选择历史对话"
              :value="activeConversationId"
              @change="selectConversation"
            >
              <option value="">新对话</option>
              <option
                v-for="conversation in conversations"
                :key="conversation.id"
                :value="conversation.id"
              >
                {{ conversationLabel(conversation) }}
              </option>
            </select>
          </label>
          <span class="rail-ai-project" :title="contextProjectName">
            <IconifyIcon icon="lucide:folder-kanban" />
            {{ contextProjectName }}
          </span>
        </div>

        <main ref="messageViewport" class="rail-ai-messages" aria-live="polite">
          <div v-if="initializing || loadingMessages" class="rail-ai-loading">
            <span></span>
            <p>正在读取对话…</p>
          </div>

          <div v-else-if="messages.length === 0" class="rail-ai-empty">
            <div class="rail-ai-empty__mark">
              <IconifyIcon icon="lucide:train-front" />
            </div>
            <p class="rail-ai-empty__eyebrow">RAIL DESIGN COPILOT</p>
            <h2>从当前设计上下文开始</h2>
            <p>可以询问设计思路、检查方案条件，或上传图片和文档一起分析。</p>
            <div class="rail-ai-suggestions">
              <button
                type="button"
                @click="useSuggestion('帮我梳理当前客室概念方案的核心约束')"
              >
                梳理方案约束
              </button>
              <button
                type="button"
                @click="useSuggestion('给出轨道客室材料与 CMF 设计的检查清单')"
              >
                生成 CMF 检查清单
              </button>
            </div>
          </div>

          <div v-else class="rail-ai-message-list">
            <article
              v-for="item in messages"
              :key="item.id"
              class="rail-ai-message"
              :class="[
                item.role === 'user' ? 'is-user' : 'is-assistant',
                { 'is-failed': item.status === 'failed' },
              ]"
            >
              <div v-if="item.role !== 'user'" class="rail-ai-avatar">
                <IconifyIcon icon="lucide:bot" />
              </div>
              <div class="rail-ai-message__body">
                <div v-if="item.attachments.length" class="rail-ai-attachments">
                  <button
                    v-for="attachment in item.attachments"
                    :key="attachment.id"
                    type="button"
                    class="rail-ai-attachment"
                    @click="downloadAttachment(attachment.id)"
                  >
                    <img
                      v-if="
                        attachment.isImage &&
                        imagePreviewUrls.get(attachment.id)
                      "
                      :src="imagePreviewUrls.get(attachment.id)"
                      :alt="attachment.filename"
                    />
                    <span v-else class="rail-ai-attachment__icon">
                      <IconifyIcon icon="lucide:file-text" />
                    </span>
                    <span class="rail-ai-attachment__meta">
                      <strong>{{ attachment.filename }}</strong>
                      <small>{{ formatBytes(attachment.sizeBytes) }}</small>
                    </span>
                  </button>
                </div>
                <p v-if="item.content">{{ item.content }}</p>
                <div class="rail-ai-message__time">
                  <IconifyIcon
                    v-if="item.status === 'failed'"
                    icon="lucide:circle-alert"
                  />
                  {{ item.status === 'failed' ? '未完成 · ' : ''
                  }}{{ formatTime(item.createdAt) }}
                </div>
              </div>
            </article>
          </div>
        </main>

        <footer class="rail-ai-composer">
          <div v-if="!status?.configured" class="rail-ai-service-note">
            <IconifyIcon icon="lucide:info" />
            对话可正常保存；配置 AI 服务后即可获取回复。
          </div>
          <div v-if="pendingFiles.length" class="rail-ai-pending-files">
            <div
              v-for="item in pendingFiles"
              :key="item.id"
              class="rail-ai-pending-file"
              :class="{ 'is-failed': item.state === 'failed' }"
            >
              <img v-if="item.previewUrl" :src="item.previewUrl" alt="" />
              <IconifyIcon v-else icon="lucide:file-text" />
              <span>
                <strong>{{ item.file.name }}</strong>
                <small>
                  {{
                    item.state === 'uploading'
                      ? '上传中…'
                      : item.state === 'failed'
                        ? '上传失败，可重试'
                        : formatBytes(item.file.size)
                  }}
                </small>
              </span>
              <button
                type="button"
                :disabled="item.state === 'uploading' || sending"
                :aria-label="`移除 ${item.file.name}`"
                @click="removePendingFile(item)"
              >
                <IconifyIcon icon="lucide:x" />
              </button>
            </div>
          </div>
          <div class="rail-ai-input-shell">
            <textarea
              ref="composerInput"
              v-model="draft"
              maxlength="20000"
              rows="1"
              placeholder="输入问题，Shift + Enter 换行…"
              aria-label="输入发给 AI 设计助手的消息"
              @keydown="handleComposerKeydown"
            ></textarea>
            <div class="rail-ai-input-actions">
              <input
                ref="fileInput"
                class="rail-ai-file-input"
                type="file"
                multiple
                :accept="attachmentAccept"
                @change="handleFiles"
              />
              <button
                type="button"
                class="rail-ai-attach-button"
                title="添加图片或文件"
                aria-label="添加图片或文件"
                :disabled="sending || pendingFiles.length >= 8"
                @click="chooseFiles"
              >
                <IconifyIcon icon="lucide:paperclip" />
              </button>
              <span>{{ draft.length.toLocaleString() }} / 20,000</span>
              <button
                type="button"
                class="rail-ai-send-button"
                :disabled="!canSend"
                :aria-label="sending ? '正在发送' : '发送消息'"
                @click="handleSend"
              >
                <IconifyIcon
                  :icon="sending ? 'lucide:loader-circle' : 'lucide:arrow-up'"
                  :class="{ 'is-spinning': sending }"
                />
              </button>
            </div>
          </div>
          <p class="rail-ai-footnote">
            AI 内容可能存在偏差，关键设计参数请人工复核
          </p>
        </footer>
      </section>
    </Transition>

    <button
      v-if="!isOpen"
      type="button"
      class="rail-ai-float-button"
      aria-label="打开 AI 设计助手"
      title="AI 设计助手"
      @click="openAssistant"
    >
      <span class="rail-ai-float-button__signal"></span>
      <IconifyIcon icon="lucide:bot" />
      <b>AI</b>
    </button>
  </Teleport>
</template>

<style scoped>
.rail-ai-assistant {
  --assistant-red: #b91c32;
  --assistant-red-dark: #8f1426;
  --assistant-ink: #20252c;
  --assistant-steel: #5e6975;
  --assistant-mist: #f4f6f8;
  --assistant-line: #dde2e7;

  position: fixed;
  right: 22px;
  bottom: 24px;
  z-index: 1200;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  width: min(430px, calc(100vw - 32px));
  height: min(720px, calc(100dvh - 48px));
  overflow: hidden;
  color: var(--assistant-ink);
  background: #fff;
  border: 1px solid #d8dde3;
  border-radius: 18px;
  box-shadow:
    0 28px 70px rgb(25 31 38 / 20%),
    0 4px 14px rgb(25 31 38 / 8%);
}

.rail-ai-track {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 6px;
  align-items: center;
  width: 100%;
  padding: 0 20px;
  pointer-events: none;
}

.rail-ai-track span {
  height: 3px;
  background: var(--assistant-red);
}

.rail-ai-track i {
  width: 10px;
  height: 10px;
  background: #fff;
  border: 3px solid var(--assistant-red);
  border-radius: 50%;
}

.rail-ai-header {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 78px;
  padding: 16px 16px 13px;
  border-bottom: 1px solid var(--assistant-line);
}

.rail-ai-brand {
  display: flex;
  gap: 11px;
  align-items: center;
  min-width: 0;
}

.rail-ai-brand__mark {
  display: grid;
  flex: 0 0 40px;
  place-items: center;
  width: 40px;
  height: 40px;
  font-size: 21px;
  color: #fff;
  background: var(--assistant-red);
  border-radius: 12px 12px 12px 4px;
  box-shadow: 0 6px 16px rgb(185 28 50 / 24%);
}

.rail-ai-brand__title {
  font-size: 16px;
  font-weight: 750;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.rail-ai-brand__status {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
  font-size: 11px;
  color: var(--assistant-steel);
}

.rail-ai-status-dot {
  width: 7px;
  height: 7px;
  background: #c78222;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgb(199 130 34 / 12%);
}

.rail-ai-status-dot.is-ready {
  background: #287a53;
  box-shadow: 0 0 0 3px rgb(40 122 83 / 12%);
}

.rail-ai-actions {
  display: flex;
  gap: 3px;
}

.rail-ai-actions button,
.rail-ai-pending-file button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  font-size: 16px;
  color: var(--assistant-steel);
  background: transparent;
  border: 0;
  border-radius: 8px;
  transition: 150ms ease;
}

.rail-ai-actions button:hover:not(:disabled),
.rail-ai-pending-file button:hover:not(:disabled) {
  color: var(--assistant-red);
  background: #fff0f2;
}

.rail-ai-actions button:disabled,
.rail-ai-pending-file button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.rail-ai-context {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-height: 48px;
  padding: 8px 14px;
  background: #fafbfc;
  border-bottom: 1px solid var(--assistant-line);
}

.rail-ai-context label {
  display: flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
  color: var(--assistant-steel);
}

.rail-ai-context select {
  width: 100%;
  min-width: 0;
  padding: 3px 24px 3px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 650;
  color: var(--assistant-ink);
  outline: none;
  background: transparent;
  border: 0;
}

.rail-ai-project {
  display: flex;
  gap: 5px;
  align-items: center;
  max-width: 145px;
  padding-left: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--assistant-steel);
  white-space: nowrap;
  border-left: 1px solid var(--assistant-line);
}

.rail-ai-project svg {
  flex: 0 0 auto;
}

.rail-ai-messages {
  min-height: 0;
  padding: 19px 16px 24px;
  overflow-y: auto;
  scroll-behavior: smooth;
  overscroll-behavior: contain;
  background:
    linear-gradient(90deg, rgb(185 28 50 / 2%) 1px, transparent 1px) 0 0 / 48px
      48px,
    var(--assistant-mist);
}

.rail-ai-messages::-webkit-scrollbar {
  width: 6px;
}

.rail-ai-messages::-webkit-scrollbar-thumb {
  background: #cbd1d7;
  border-radius: 99px;
}

.rail-ai-loading,
.rail-ai-empty {
  display: grid;
  place-content: center;
  justify-items: center;
  height: 100%;
  min-height: 280px;
  text-align: center;
}

.rail-ai-loading span {
  width: 24px;
  height: 24px;
  border: 2px solid #d5dae0;
  border-top-color: var(--assistant-red);
  border-radius: 50%;
  animation: rail-ai-spin 0.8s linear infinite;
}

.rail-ai-loading p {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--assistant-steel);
}

.rail-ai-empty {
  padding: 24px 12px;
}

.rail-ai-empty__mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 62px;
  height: 62px;
  margin-bottom: 14px;
  font-size: 30px;
  color: var(--assistant-red);
  background: #fff;
  border: 1px solid #e4c4ca;
  border-radius: 18px;
  box-shadow: 0 10px 28px rgb(27 34 42 / 8%);
}

.rail-ai-empty__mark::after {
  position: absolute;
  right: -5px;
  bottom: -5px;
  width: 17px;
  height: 17px;
  content: '';
  background: var(--assistant-red);
  border: 4px solid var(--assistant-mist);
  border-radius: 50%;
}

.rail-ai-empty__eyebrow {
  margin: 0 0 7px !important;
  font-size: 9px !important;
  font-weight: 800;
  color: var(--assistant-red) !important;
  letter-spacing: 0.18em;
}

.rail-ai-empty h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 760;
  letter-spacing: -0.03em;
}

.rail-ai-empty > p:not(.rail-ai-empty__eyebrow) {
  max-width: 320px;
  margin: 9px 0 16px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--assistant-steel);
}

.rail-ai-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: center;
}

.rail-ai-suggestions button {
  padding: 7px 11px;
  font-size: 11px;
  color: var(--assistant-ink);
  background: #fff;
  border: 1px solid var(--assistant-line);
  border-radius: 999px;
  transition: 150ms ease;
}

.rail-ai-suggestions button:hover {
  color: var(--assistant-red);
  border-color: #d99ca7;
}

.rail-ai-message-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.rail-ai-message {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  max-width: 91%;
}

.rail-ai-message.is-user {
  align-self: flex-end;
  justify-content: flex-end;
}

.rail-ai-avatar {
  display: grid;
  flex: 0 0 28px;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-top: 2px;
  font-size: 15px;
  color: #fff;
  background: var(--assistant-ink);
  border-radius: 9px 9px 9px 3px;
}

.rail-ai-message__body {
  min-width: 0;
  padding: 10px 12px 7px;
  background: #fff;
  border: 1px solid #dde2e7;
  border-radius: 4px 13px 13px;
  box-shadow: 0 2px 6px rgb(28 35 43 / 3%);
}

.rail-ai-message.is-user .rail-ai-message__body {
  color: #fff;
  background: var(--assistant-red);
  border-color: var(--assistant-red);
  border-radius: 13px 4px 13px 13px;
  box-shadow: 0 5px 14px rgb(185 28 50 / 15%);
}

.rail-ai-message.is-failed .rail-ai-message__body {
  color: #784d17;
  background: #fff9ed;
  border-color: #e3c999;
}

.rail-ai-message__body > p {
  margin: 0;
  font-size: 13px;
  line-height: 1.68;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.rail-ai-message__time {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 5px;
  font-size: 9px;
  color: #8a949e;
}

.rail-ai-message.is-user .rail-ai-message__time {
  color: rgb(255 255 255 / 68%);
}

.rail-ai-attachments {
  display: grid;
  gap: 7px;
  margin-bottom: 8px;
}

.rail-ai-attachment {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-width: 180px;
  padding: 6px;
  color: inherit;
  text-align: left;
  background: rgb(244 246 248 / 90%);
  border: 1px solid rgb(221 226 231 / 90%);
  border-radius: 9px;
}

.rail-ai-message.is-user .rail-ai-attachment {
  background: rgb(255 255 255 / 12%);
  border-color: rgb(255 255 255 / 22%);
}

.rail-ai-attachment img,
.rail-ai-attachment__icon {
  display: grid;
  flex: 0 0 42px;
  place-items: center;
  width: 42px;
  height: 42px;
  font-size: 19px;
  object-fit: cover;
  background: #fff;
  border-radius: 7px;
}

.rail-ai-attachment__meta {
  display: grid;
  min-width: 0;
}

.rail-ai-attachment__meta strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}

.rail-ai-attachment__meta small {
  margin-top: 2px;
  font-size: 9px;
  opacity: 0.7;
}

.rail-ai-composer {
  padding: 10px 12px 11px;
  background: #fff;
  border-top: 1px solid var(--assistant-line);
}

.rail-ai-service-note {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  margin-bottom: 8px;
  font-size: 10px;
  color: #80520f;
  background: #fff8e9;
  border-radius: 7px;
}

.rail-ai-pending-files {
  display: flex;
  gap: 7px;
  padding: 2px 0 9px;
  overflow-x: auto;
}

.rail-ai-pending-file {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: 34px minmax(74px, 1fr) 24px;
  gap: 6px;
  align-items: center;
  max-width: 210px;
  padding: 5px;
  background: var(--assistant-mist);
  border: 1px solid var(--assistant-line);
  border-radius: 9px;
}

.rail-ai-pending-file.is-failed {
  background: #fff5f5;
  border-color: #e7b2b2;
}

.rail-ai-pending-file > img,
.rail-ai-pending-file > svg {
  width: 34px;
  height: 34px;
  padding: 6px;
  color: var(--assistant-red);
  object-fit: cover;
  background: #fff;
  border-radius: 6px;
}

.rail-ai-pending-file > img {
  padding: 0;
}

.rail-ai-pending-file > span {
  display: grid;
  min-width: 0;
}

.rail-ai-pending-file strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  white-space: nowrap;
}

.rail-ai-pending-file small {
  margin-top: 2px;
  font-size: 9px;
  color: var(--assistant-steel);
}

.rail-ai-pending-file button {
  width: 24px;
  height: 24px;
  font-size: 13px;
}

.rail-ai-input-shell {
  overflow: hidden;
  background: #fff;
  border: 1px solid #cfd5db;
  border-radius: 12px;
  box-shadow: 0 2px 7px rgb(28 35 43 / 4%);
  transition: 150ms ease;
}

.rail-ai-input-shell:focus-within {
  border-color: var(--assistant-red);
  box-shadow: 0 0 0 3px rgb(185 28 50 / 9%);
}

.rail-ai-input-shell textarea {
  display: block;
  width: 100%;
  min-height: 43px;
  max-height: 124px;
  padding: 11px 12px 4px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.5;
  color: var(--assistant-ink);
  resize: none;
  outline: none;
  background: transparent;
  border: 0;
}

.rail-ai-input-shell textarea::placeholder {
  color: #9aa2aa;
}

.rail-ai-input-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  min-height: 39px;
  padding: 3px 6px 6px 8px;
}

.rail-ai-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip-path: inset(50%);
}

.rail-ai-attach-button,
.rail-ai-send-button {
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  font-size: 16px;
  border: 0;
  border-radius: 9px;
}

.rail-ai-attach-button {
  color: var(--assistant-steel);
  background: #f2f4f6;
}

.rail-ai-input-actions > span {
  flex: 1;
  font-size: 9px;
  color: #a0a7ae;
}

.rail-ai-send-button {
  color: #fff;
  background: var(--assistant-red);
  box-shadow: 0 5px 12px rgb(185 28 50 / 18%);
}

.rail-ai-send-button:hover:not(:disabled) {
  background: var(--assistant-red-dark);
}

.rail-ai-attach-button:disabled,
.rail-ai-send-button:disabled {
  cursor: not-allowed;
  box-shadow: none;
  opacity: 0.4;
}

.rail-ai-footnote {
  margin: 7px 0 0;
  font-size: 9px;
  color: #969ea6;
  text-align: center;
}

.rail-ai-float-button {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 1199;
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  color: #fff;
  background: #b91c32;
  border: 2px solid #fff;
  border-radius: 18px 18px 18px 6px;
  box-shadow:
    0 12px 28px rgb(185 28 50 / 30%),
    0 2px 8px rgb(26 32 39 / 15%);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease;
}

.rail-ai-float-button:hover {
  box-shadow:
    0 16px 34px rgb(185 28 50 / 36%),
    0 3px 10px rgb(26 32 39 / 15%);
  transform: translateY(-2px);
}

.rail-ai-float-button svg {
  margin-top: -6px;
  font-size: 24px;
}

.rail-ai-float-button b {
  position: absolute;
  bottom: 6px;
  font-size: 9px;
  letter-spacing: 0.12em;
}

.rail-ai-float-button__signal {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 13px;
  height: 13px;
  background: #42a273;
  border: 3px solid #fff;
  border-radius: 50%;
}

.is-spinning {
  animation: rail-ai-spin 0.85s linear infinite;
}

.rail-ai-panel-enter-active,
.rail-ai-panel-leave-active {
  transform-origin: bottom right;
  transition:
    opacity 170ms ease,
    transform 210ms ease;
}

.rail-ai-panel-enter-from,
.rail-ai-panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}

@keyframes rail-ai-spin {
  to {
    transform: rotate(360deg);
  }
}

:global(.dark) .rail-ai-assistant {
  --assistant-ink: #f1f3f5;
  --assistant-steel: #a8b0b8;
  --assistant-mist: #171b20;
  --assistant-line: #343a42;

  background: #20252c;
  border-color: #3b424a;
}

:global(.dark) .rail-ai-context,
:global(.dark) .rail-ai-composer,
:global(.dark) .rail-ai-input-shell,
:global(.dark) .rail-ai-empty__mark,
:global(.dark) .rail-ai-suggestions button,
:global(.dark) .rail-ai-message__body {
  background: #20252c;
}

:global(.dark) .rail-ai-message.is-user .rail-ai-message__body {
  background: var(--assistant-red);
}

:global(.dark) .rail-ai-context select,
:global(.dark) .rail-ai-input-shell textarea {
  color: #f1f3f5;
}

@media (max-width: 640px) {
  .rail-ai-assistant {
    right: 10px;
    bottom: 10px;
    width: calc(100vw - 20px);
    height: calc(100dvh - 20px);
    border-radius: 16px;
  }

  .rail-ai-project {
    max-width: 110px;
  }

  .rail-ai-float-button {
    right: 14px;
    bottom: 14px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rail-ai-panel-enter-active,
  .rail-ai-panel-leave-active,
  .rail-ai-float-button {
    transition: none;
  }
}
</style>
