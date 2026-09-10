<script lang="ts" setup>
import type { AiAssistantStatus, AiConversation, AiMessage } from '#/api';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { message, Modal } from 'ant-design-vue';

import {
  clearAiMessagesApi,
  createAiConversationApi,
  deleteAiConversationApi,
  getAiAssistantStatusApi,
  getAiAttachmentDownloadApi,
  getAiAttachmentPreviewApi,
  getAiConversationsApi,
  getAiMessagesApi,
  removeAiAttachmentApi,
  renameAiConversationApi,
  sendAiMessageApi,
  uploadAiAttachmentApi,
} from '#/api';
import PlatformMarkdown from '#/components/platform/platform-markdown.vue';
import { copyTextToClipboard } from '#/utils/copy-text';

import assistantLogo from './assistant-logo.svg';
import { assistantPanelSize, clampFloatingPosition } from './floating-position';

interface PendingFile {
  attachmentId?: string;
  file: File;
  id: string;
  previewUrl?: string;
  state: 'failed' | 'local' | 'ready' | 'uploading';
}

type DisplayAttachment = AiMessage['attachments'][number] & {
  isLocal?: boolean;
  previewUrl?: string;
};

interface DisplayMessage extends Omit<AiMessage, 'attachments'> {
  attachments: DisplayAttachment[];
  uiState?: 'sending';
}

const isOpen = ref(false);
const route = useRoute();
const viewport = reactive({
  width: window.innerWidth,
  height: window.innerHeight,
});
const viewportOffset = reactive({ x: 0, y: 0 });
const launcherPosition = ref({
  x: viewport.width - 78,
  y: viewport.height - 78,
});
const launcherStyle = computed(() => ({
  left: `${launcherPosition.value.x + viewportOffset.x}px`,
  top: `${launcherPosition.value.y + viewportOffset.y}px`,
  right: 'auto',
  bottom: 'auto',
}));
const panelPosition = computed(() => {
  const size = assistantPanelSize(viewport);
  return clampFloatingPosition(
    {
      x: launcherPosition.value.x + 56 - size.width,
      y: launcherPosition.value.y + 56 - size.height,
    },
    size,
    viewport,
  );
});
const panelStyle = computed(() => ({
  width: `${assistantPanelSize(viewport).width}px`,
  height: `${assistantPanelSize(viewport).height}px`,
  left: `${panelPosition.value.x + viewportOffset.x}px`,
  top: `${panelPosition.value.y + viewportOffset.y}px`,
  right: 'auto',
  bottom: 'auto',
}));
let drag:
  | undefined
  | {
      id: number;
      moved: boolean;
      originX: number;
      originY: number;
      panel: boolean;
      x: number;
      y: number;
    };
let suppressLauncherClick = false;
function beginDrag(event: PointerEvent, panel: boolean) {
  if (
    !event.isPrimary ||
    event.button !== 0 ||
    (panel &&
      (event.target as HTMLElement).closest(
        'button, input, .rail-ai-conversation-menu',
      ))
  )
    return;
  event.preventDefault();
  const origin = panel ? panelPosition.value : launcherPosition.value;
  drag = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    originX: origin.x,
    originY: origin.y,
    panel,
    moved: false,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function moveDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 5) return;
  drag.moved = true;
  const size = drag.panel
    ? assistantPanelSize(viewport)
    : { width: 56, height: 56 };
  const position = clampFloatingPosition(
    { x: drag.originX + dx, y: drag.originY + dy },
    size,
    viewport,
  );
  launcherPosition.value = drag.panel
    ? { x: position.x + size.width - 56, y: position.y + size.height - 56 }
    : position;
}
function endDrag(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.id) return;
  suppressLauncherClick =
    !drag.panel && drag.moved && event.type !== 'pointercancel';
  drag = undefined;
}
function activateLauncher() {
  if (suppressLauncherClick) {
    suppressLauncherClick = false;
    return;
  }
  void openAssistant();
}
function resizeFloatingAssistant() {
  viewport.width = window.visualViewport?.width ?? window.innerWidth;
  viewport.height = window.visualViewport?.height ?? window.innerHeight;
  viewportOffset.x = window.visualViewport?.offsetLeft ?? 0;
  viewportOffset.y = window.visualViewport?.offsetTop ?? 0;
  launcherPosition.value = clampFloatingPosition(
    launcherPosition.value,
    { width: 56, height: 56 },
    viewport,
  );
  drag = undefined;
}
watch(
  () => route.path,
  () => {
    drag = undefined;
    closeAssistant();
  },
);
const initialized = ref(false);
const initializing = ref(false);
const loadingMessages = ref(false);
const sending = ref(false);
const status = ref<AiAssistantStatus>();
const conversations = ref<AiConversation[]>([]);
const activeConversationId = ref('');
const messages = ref<DisplayMessage[]>([]);
const draft = ref('');
const pendingFiles = ref<PendingFile[]>([]);
const fileInput = ref<HTMLInputElement>();
const composerInput = ref<HTMLTextAreaElement>();
const messageViewport = ref<HTMLElement>();
const conversationPicker = ref<HTMLElement>();
const imagePreviewUrls = reactive(new Map<string, string>());
const conversationMenuOpen = ref(false);
const conversationSearch = ref('');
const conversationSortOrder = ref<'asc' | 'desc'>('desc');
const editingConversationId = ref('');
const editingConversationTitle = ref('');
const renamingConversation = ref(false);

const attachmentAccept =
  '.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.mp4,.mov,.webm,.txt,.md,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip';
const defaultMaxAttachmentBytes = 50 * 1024 * 1024;
const defaultMaxImagesPerMessage = 4;

const canSend = computed(
  () =>
    !sending.value &&
    (draft.value.trim().length > 0 || pendingFiles.value.length > 0),
);
const pendingImageCount = computed(
  () =>
    pendingFiles.value.filter((item) => item.file.type.startsWith('image/'))
      .length,
);
const maxImagesPerMessage = computed(
  () => status.value?.maxImagesPerMessage ?? defaultMaxImagesPerMessage,
);
const visibleConversations = computed(() => {
  const query = conversationSearch.value.trim().toLocaleLowerCase('zh-CN');
  const direction = conversationSortOrder.value === 'desc' ? -1 : 1;
  return conversations.value
    .filter((conversation) => {
      if (!query) return true;
      return conversation.title.toLocaleLowerCase('zh-CN').includes(query);
    })
    .toSorted((left, right) => {
      const leftTime = Date.parse(
        left.lastMessageAt ?? left.createdAt ?? left.updatedAt,
      );
      const rightTime = Date.parse(
        right.lastMessageAt ?? right.createdAt ?? right.updatedAt,
      );
      return (leftTime - rightTime) * direction;
    });
});

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createOptimisticMessage(content: string): DisplayMessage {
  const createdAt = new Date().toISOString();
  return {
    attachments: pendingFiles.value.map((item) => ({
      createdAt,
      filename: item.file.name,
      id: `local-attachment-${item.id}`,
      isImage: item.file.type.startsWith('image/'),
      isLocal: true,
      mimeType: item.file.type,
      previewUrl: item.previewUrl,
      sizeBytes: item.file.size,
      status: 'pending',
    })),
    content,
    createdAt,
    errorCode: null,
    id: `local-message-${createLocalId()}`,
    role: 'user',
    status: 'completed',
    uiState: 'sending',
  };
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function formatConversationDate(conversation: AiConversation) {
  return formatTime(conversation.lastMessageAt ?? conversation.createdAt);
}

function closeConversationMenu() {
  conversationMenuOpen.value = false;
  editingConversationId.value = '';
  editingConversationTitle.value = '';
}

function toggleConversationMenu() {
  conversationMenuOpen.value = !conversationMenuOpen.value;
  if (!conversationMenuOpen.value) {
    editingConversationId.value = '';
    editingConversationTitle.value = '';
  }
}

function toggleConversationSort() {
  conversationSortOrder.value =
    conversationSortOrder.value === 'desc' ? 'asc' : 'desc';
}

function startConversationRename(conversation: AiConversation) {
  editingConversationId.value = conversation.id;
  editingConversationTitle.value = conversation.title;
  void nextTick(() => {
    const input = conversationPicker.value?.querySelector<HTMLInputElement>(
      '.rail-ai-conversation-rename input',
    );
    input?.focus();
    input?.select();
  });
}

function cancelConversationRename() {
  editingConversationId.value = '';
  editingConversationTitle.value = '';
}

async function saveConversationRename(conversation: AiConversation) {
  const title = editingConversationTitle.value.trim();
  if (!title) {
    message.warning('会话名称不能为空');
    return;
  }
  if (title === conversation.title) {
    cancelConversationRename();
    return;
  }
  renamingConversation.value = true;
  try {
    const updated = await renameAiConversationApi(conversation.id, title);
    conversations.value = conversations.value.map((item) =>
      item.id === conversation.id
        ? { ...item, title: updated.title, updatedAt: updated.updatedAt }
        : item,
    );
    cancelConversationRename();
    message.success('会话名称已更新');
  } finally {
    renamingConversation.value = false;
  }
}

function handleOutsideConversationMenu(event: PointerEvent) {
  if (!conversationMenuOpen.value) return;
  const target = event.target;
  if (target instanceof Node && conversationPicker.value?.contains(target)) {
    return;
  }
  closeConversationMenu();
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
  closeConversationMenu();
  isOpen.value = false;
}

function confirmDeleteConversation(conversation: AiConversation) {
  if (sending.value) return;
  Modal.confirm({
    title: '删除这条对话？',
    content: `“${conversation.title}”及其中的消息、附件将被删除，无法恢复。`,
    okText: '删除对话',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await deleteAiConversationApi(conversation.id);
      conversations.value = conversations.value.filter(
        (item) => item.id !== conversation.id,
      );
      if (activeConversationId.value === conversation.id) {
        activeConversationId.value = '';
        messages.value = [];
        draft.value = '';
        releasePendingFiles();
      }
      message.success('对话已删除');
    },
  });
}

function releasePendingFiles() {
  for (const item of pendingFiles.value) {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  }
  pendingFiles.value = [];
}

async function startNewConversation() {
  if (sending.value) return;
  closeConversationMenu();
  activeConversationId.value = '';
  messages.value = [];
  draft.value = '';
  releasePendingFiles();
  await nextTick();
  composerInput.value?.focus();
}

async function selectConversation(conversationId: string) {
  if (sending.value) return;
  closeConversationMenu();
  if (conversationId === activeConversationId.value) return;
  activeConversationId.value = conversationId;
  messages.value = [];
  releasePendingFiles();
  if (conversationId) await loadMessages(conversationId);
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
  let remainingImageSlots = Math.max(
    0,
    maxImagesPerMessage.value - pendingImageCount.value,
  );
  let skippedImages = 0;
  for (const file of selectedFiles.slice(0, remainingSlots)) {
    if (file.size === 0) {
      message.warning(`${file.name} 是空文件，已跳过`);
      continue;
    }
    if (file.size > maxBytes) {
      message.warning(`${file.name} 超过单个附件上限 ${formatBytes(maxBytes)}`);
      continue;
    }
    if (file.type.startsWith('image/') && remainingImageSlots === 0) {
      skippedImages += 1;
      continue;
    }
    if (file.type.startsWith('image/')) remainingImageSlots -= 1;
    pendingFiles.value.push({
      file,
      id: createLocalId(),
      previewUrl: file.type.startsWith('image/')
        ? URL.createObjectURL(file)
        : undefined,
      state: 'local',
    });
  }
  if (skippedImages > 0) {
    message.warning(`每条消息最多添加 ${maxImagesPerMessage.value} 张图片`);
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
  const conversation = await createAiConversationApi();
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
  const optimisticMessage = createOptimisticMessage(submittedDraft);
  draft.value = '';
  sending.value = true;
  messages.value.push(optimisticMessage);
  await scrollToLatest();
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
    messages.value = messages.value.filter(
      (item) => item.id !== optimisticMessage.id,
    );
    if (!draft.value) draft.value = submittedDraft;
    if (error instanceof Error && error.message.startsWith('附件上传失败')) {
      message.error(error.message);
    }
  } finally {
    sending.value = false;
    await scrollToLatest();
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

async function copyAssistantMessage(content: string) {
  const copied = await copyTextToClipboard(content);
  if (copied) {
    message.success('回复内容已复制');
    return;
  }
  message.error('复制失败，请检查浏览器剪贴板权限后重试');
}

onMounted(() => {
  window.addEventListener('resize', resizeFloatingAssistant);
  window.visualViewport?.addEventListener('resize', resizeFloatingAssistant);
  window.visualViewport?.addEventListener('scroll', resizeFloatingAssistant);
  resizeFloatingAssistant();
  document.addEventListener('pointerdown', handleOutsideConversationMenu);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeFloatingAssistant);
  window.visualViewport?.removeEventListener('resize', resizeFloatingAssistant);
  window.visualViewport?.removeEventListener('scroll', resizeFloatingAssistant);
  document.removeEventListener('pointerdown', handleOutsideConversationMenu);
  releasePendingFiles();
});
</script>

<template>
  <Teleport to="body">
    <Transition name="rail-ai-panel">
      <section
        v-if="isOpen"
        class="rail-ai-assistant"
        :style="panelStyle"
        role="dialog"
        aria-label="AI 设计助手"
        @keydown.esc="closeAssistant"
      >
        <header
          class="rail-ai-header"
          title="拖动标题栏移动助手"
          @pointerdown="beginDrag($event, true)"
          @pointermove="moveDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @lostpointercapture="endDrag"
        >
          <div class="rail-ai-brand">
            <img
              :src="assistantLogo"
              draggable="false"
              @dragstart.prevent
              class="rail-ai-brand__mark"
              alt=""
            />
            <div class="rail-ai-brand__title">AI 助手</div>
          </div>
          <div class="rail-ai-actions">
            <div ref="conversationPicker" class="rail-ai-conversation-picker">
              <button
                type="button"
                class="rail-ai-conversation-trigger"
                aria-haspopup="dialog"
                :aria-expanded="conversationMenuOpen"
                aria-label="选择历史对话"
                :disabled="sending"
                title="历史对话"
                @click="toggleConversationMenu"
              >
                <IconifyIcon icon="lucide:history" />
              </button>

              <div
                v-if="conversationMenuOpen"
                class="rail-ai-conversation-menu"
                role="dialog"
                aria-label="历史对话管理"
                @keydown.esc.stop="closeConversationMenu"
              >
                <div class="rail-ai-conversation-tools">
                  <button
                    type="button"
                    title="清空当前对话"
                    aria-label="清空当前对话"
                    :disabled="!activeConversationId || messages.length === 0"
                    @click="confirmClearConversation"
                  >
                    <IconifyIcon icon="lucide:trash-2" />
                  </button>
                  <label>
                    <IconifyIcon icon="lucide:search" />
                    <input
                      v-model="conversationSearch"
                      type="search"
                      maxlength="120"
                      placeholder="按名称查找"
                      aria-label="按名称查找历史对话"
                    />
                  </label>
                  <button
                    type="button"
                    class="rail-ai-conversation-sort"
                    :title="
                      conversationSortOrder === 'desc'
                        ? '当前从新到旧，点击改为从旧到新'
                        : '当前从旧到新，点击改为从新到旧'
                    "
                    :aria-label="
                      conversationSortOrder === 'desc'
                        ? '按时间从新到旧'
                        : '按时间从旧到新'
                    "
                    @click="toggleConversationSort"
                  >
                    <IconifyIcon
                      :icon="
                        conversationSortOrder === 'desc'
                          ? 'lucide:arrow-down-wide-narrow'
                          : 'lucide:arrow-up-narrow-wide'
                      "
                    />
                    {{ conversationSortOrder === 'desc' ? '新→旧' : '旧→新' }}
                  </button>
                </div>

                <div class="rail-ai-conversation-list" role="list">
                  <button
                    type="button"
                    class="rail-ai-conversation-new"
                    @click="startNewConversation"
                  >
                    <IconifyIcon icon="lucide:plus" />
                    新对话
                  </button>
                  <div
                    v-for="conversation in visibleConversations"
                    :key="conversation.id"
                    class="rail-ai-conversation-item"
                    :class="{
                      'is-active': conversation.id === activeConversationId,
                    }"
                    role="listitem"
                  >
                    <form
                      v-if="editingConversationId === conversation.id"
                      class="rail-ai-conversation-rename"
                      @submit.prevent="saveConversationRename(conversation)"
                    >
                      <input
                        v-model="editingConversationTitle"
                        maxlength="120"
                        aria-label="新的会话名称"
                        @keydown.esc.stop.prevent="cancelConversationRename"
                      />
                      <button
                        type="submit"
                        title="保存名称"
                        aria-label="保存名称"
                        :disabled="renamingConversation"
                      >
                        <IconifyIcon icon="lucide:check" />
                      </button>
                      <button
                        type="button"
                        title="取消重命名"
                        aria-label="取消重命名"
                        :disabled="renamingConversation"
                        @click="cancelConversationRename"
                      >
                        <IconifyIcon icon="lucide:x" />
                      </button>
                    </form>
                    <template v-else>
                      <button
                        type="button"
                        class="rail-ai-conversation-main"
                        @click="selectConversation(conversation.id)"
                      >
                        <strong>{{ conversation.title }}</strong>
                        <small>
                          {{ formatConversationDate(conversation) }}
                        </small>
                      </button>
                      <button
                        type="button"
                        class="rail-ai-conversation-rename-button"
                        :aria-label="`重命名 ${conversation.title}`"
                        title="重命名"
                        @click="startConversationRename(conversation)"
                      >
                        <IconifyIcon icon="lucide:pencil" />
                      </button>
                      <button
                        type="button"
                        class="rail-ai-conversation-delete-button"
                        :aria-label="`删除 ${conversation.title}`"
                        title="删除对话"
                        :disabled="sending"
                        @click="confirmDeleteConversation(conversation)"
                      >
                        <IconifyIcon icon="lucide:trash-2" />
                      </button>
                    </template>
                  </div>
                  <p v-if="visibleConversations.length === 0">
                    没有匹配的历史对话
                  </p>
                </div>
              </div>
            </div>
            <button
              type="button"
              title="新建对话"
              aria-label="新建对话"
              :disabled="sending"
              @click="startNewConversation"
            >
              <IconifyIcon icon="lucide:plus" />
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

        <main ref="messageViewport" class="rail-ai-messages" aria-live="polite">
          <div v-if="initializing || loadingMessages" class="rail-ai-loading">
            <span></span>
            <p>正在读取对话…</p>
          </div>

          <div
            v-else-if="messages.length === 0"
            class="rail-ai-empty"
            aria-label="暂无消息"
          >
            <strong class="rail-ai-welcome">有什么我能帮你的吗？</strong>
          </div>

          <div v-else class="rail-ai-message-list">
            <article
              v-for="item in messages"
              :key="item.id"
              class="rail-ai-message"
              :class="[
                item.role === 'user' ? 'is-user' : 'is-assistant',
                {
                  'is-failed': item.status === 'failed',
                  'is-sending': item.uiState === 'sending',
                },
              ]"
            >
              <div v-if="item.role !== 'user'" class="rail-ai-avatar">
                <img
                  :src="assistantLogo"
                  draggable="false"
                  @dragstart.prevent
                  alt=""
                />
              </div>
              <div class="rail-ai-message__body">
                <div v-if="item.attachments.length" class="rail-ai-attachments">
                  <button
                    v-for="attachment in item.attachments"
                    :key="attachment.id"
                    type="button"
                    class="rail-ai-attachment"
                    :class="{ 'is-local': attachment.isLocal }"
                    :disabled="attachment.isLocal"
                    @click="
                      attachment.isLocal || downloadAttachment(attachment.id)
                    "
                  >
                    <img
                      v-if="
                        attachment.isImage &&
                        (attachment.previewUrl ||
                          imagePreviewUrls.get(attachment.id))
                      "
                      :src="
                        attachment.previewUrl ||
                        imagePreviewUrls.get(attachment.id)
                      "
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
                <PlatformMarkdown
                  v-if="item.role !== 'user' && item.content"
                  class="rail-ai-message__markdown"
                  :content="item.content"
                />
                <p v-else-if="item.content">{{ item.content }}</p>
                <div class="rail-ai-message__meta">
                  <button
                    v-if="item.role !== 'user' && item.content"
                    type="button"
                    class="rail-ai-copy-button"
                    title="复制 Markdown"
                    aria-label="复制 Markdown"
                    @click="copyAssistantMessage(item.content)"
                  >
                    <IconifyIcon icon="lucide:copy" />
                  </button>
                  <div class="rail-ai-message__time">
                    <IconifyIcon
                      v-if="item.uiState === 'sending'"
                      icon="lucide:loader-circle"
                      class="is-spinning"
                    />
                    <IconifyIcon
                      v-if="item.status === 'failed'"
                      icon="lucide:circle-alert"
                    />
                    {{
                      item.uiState === 'sending'
                        ? '正在发送…'
                        : `${item.status === 'failed' ? '未完成 · ' : ''}${formatTime(item.createdAt)}`
                    }}
                  </div>
                </div>
              </div>
              <div
                v-if="item.role === 'user'"
                class="rail-ai-avatar is-user"
                aria-label="用户"
              >
                <IconifyIcon icon="lucide:user-round" />
              </div>
            </article>
            <article
              v-if="sending"
              class="rail-ai-message is-assistant is-waiting"
              aria-label="AI 正在生成回复"
            >
              <div class="rail-ai-avatar">
                <img
                  :src="assistantLogo"
                  draggable="false"
                  @dragstart.prevent
                  alt=""
                />
              </div>
              <div class="rail-ai-message__body">
                <div class="rail-ai-thinking" aria-hidden="true">
                  <span></span><span></span><span></span>
                </div>
                <div class="rail-ai-message__time">正在生成回复…</div>
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
              placeholder="输入消息…"
              title="Enter 发送，Shift + Enter 换行"
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
                :title="`添加图片或文件；每条消息最多 ${maxImagesPerMessage} 张图片`"
                :aria-label="`添加图片或文件；每条消息最多 ${maxImagesPerMessage} 张图片`"
                :disabled="sending || pendingFiles.length >= 8"
                @click="chooseFiles"
              >
                <IconifyIcon icon="lucide:paperclip" />
              </button>

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
        </footer>
      </section>
    </Transition>

    <button
      v-if="!isOpen"
      type="button"
      class="rail-ai-float-button"
      :style="launcherStyle"
      @pointerdown="beginDrag($event, false)"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @lostpointercapture="endDrag"
      aria-label="打开 AI 设计助手"
      title="AI 设计助手"
      @click="activateLauncher"
    >
      <img :src="assistantLogo" draggable="false" @dragstart.prevent alt="" />
    </button>
  </Teleport>
</template>

<style scoped>
.rail-ai-avatar img {
  display: block;
  width: 100%;
  height: 100%;
}

.rail-ai-assistant button:focus-visible {
  outline: 2px solid var(--assistant-red);
  outline-offset: 2px;
}

.rail-ai-assistant {
  --assistant-red: #bb1b21;
  --assistant-red-dark: #94151a;
  --assistant-ink: var(--rail-theme-text, #20252c);
  --assistant-steel: var(--rail-theme-secondary, #5e6975);
  --assistant-mist: var(--rail-theme-surface, #f4f6f8);
  --assistant-line: var(--rail-theme-border, #dde2e7);

  position: fixed;
  right: 22px;
  bottom: 24px;
  z-index: 1200;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(430px, calc(100vw - 32px));
  height: min(720px, calc(100dvh - 48px));
  overflow: hidden;
  color: var(--assistant-ink);
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #d8dde3);
  border-radius: 18px;
  box-shadow:
    0 16px 48px rgb(25 31 38 / 10%),
    0 4px 14px rgb(25 31 38 / 8%);
}

.rail-ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 68px;
  padding: 14px 20px;
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.rail-ai-brand {
  display: flex;
  gap: 11px;
  align-items: center;
  min-width: 0;
}

.rail-ai-brand__mark {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
}

.rail-ai-brand__title {
  font-size: 16px;
  font-weight: 750;
  line-height: 1.25;
  letter-spacing: -0.02em;
}

.rail-ai-actions {
  display: flex;
  gap: 3px;
}

.rail-ai-actions > button,
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

.rail-ai-actions > button:hover:not(:disabled),
.rail-ai-pending-file button:hover:not(:disabled) {
  color: var(--assistant-red);
  background: var(--rail-theme-surface, #fff0f2);
}

.rail-ai-actions > button:disabled,
.rail-ai-pending-file button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.rail-ai-conversation-picker {
  position: static;
  min-width: 0;
}

.rail-ai-conversation-trigger {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--assistant-steel);
  background: transparent;
  border: 0;
  border-radius: 8px;
}

.rail-ai-conversation-trigger:hover,
.rail-ai-conversation-trigger[aria-expanded='true'] {
  color: var(--assistant-red);
  background: var(--rail-theme-surface, #fff0f2);
}

.rail-ai-conversation-menu {
  position: absolute;
  top: 64px;
  right: 16px;
  left: 16px;
  z-index: 8;
  display: flex;
  flex-direction: column;
  width: auto;
  max-height: calc(100% - 84px);
  overflow: hidden;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--assistant-line);
  border-radius: 12px;
  box-shadow: 0 16px 38px rgb(28 35 43 / 16%);
}

.rail-ai-conversation-tools {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 6px;
  padding: 7px;
  background: var(--rail-theme-surface, #fafbfc);
  border-bottom: 1px solid var(--assistant-line);
}

.rail-ai-conversation-tools label {
  display: flex;
  gap: 5px;
  align-items: center;
  min-width: 0;
  padding: 0 7px;
  color: var(--assistant-steel);
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--assistant-line);
  border-radius: 7px;
}

.rail-ai-conversation-tools input {
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0;
  font-size: 11px;
  color: var(--assistant-ink);
  outline: none;
  background: transparent;
  border: 0;
}

.rail-ai-conversation-sort {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  align-items: center;
  height: 32px;
  padding: 0 7px;
  font-size: 10px;
  color: var(--assistant-steel);
  white-space: nowrap;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--assistant-line);
  border-radius: 7px;
}

.rail-ai-conversation-sort:hover {
  color: var(--assistant-red);
  border-color: #d99ca7;
}

.rail-ai-conversation-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 274px;
  padding: 6px;
  overflow-y: auto;
}

.rail-ai-conversation-new,
.rail-ai-conversation-main {
  min-width: 0;
  text-align: left;
  background: transparent;
  border: 0;
}

.rail-ai-conversation-new {
  display: flex;
  gap: 6px;
  align-items: center;
  width: 100%;
  padding: 7px 8px;
  font-size: 11px;
  font-weight: 650;
  color: var(--assistant-red);
  white-space: nowrap;
  border-radius: 7px;
}

.rail-ai-conversation-new:hover {
  background: var(--rail-theme-surface, #fff0f2);
}

.rail-ai-conversation-item {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) 28px 28px;
  gap: 3px;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 8px;
}

.rail-ai-conversation-item:hover,
.rail-ai-conversation-item.is-active {
  background: var(--assistant-mist);
}

.rail-ai-conversation-item.is-active {
  border-color: var(--rail-theme-border, #e5c0c7);
}

.rail-ai-conversation-main {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 7px 5px 7px 8px;
}

.rail-ai-conversation-main strong,
.rail-ai-conversation-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-ai-conversation-main strong {
  font-size: 11px;
  font-weight: 650;
  color: var(--assistant-ink);
}

.rail-ai-conversation-main small {
  font-size: 9px;
  color: var(--assistant-steel);
}

.rail-ai-conversation-delete-button,
.rail-ai-conversation-rename-button,
.rail-ai-conversation-rename button {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  font-size: 13px;
  color: var(--assistant-steel);
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.rail-ai-conversation-delete-button:hover,
.rail-ai-conversation-rename-button:hover,
.rail-ai-conversation-rename button:hover:not(:disabled) {
  color: var(--assistant-red);
  background: var(--rail-theme-surface, #fff0f2);
}

.rail-ai-conversation-rename {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px 26px;
  grid-column: 1 / -1;
  gap: 2px;
  align-items: center;
  padding: 4px;
}

.rail-ai-conversation-rename input {
  min-width: 0;
  height: 28px;
  padding: 0 7px;
  font-size: 11px;
  color: var(--assistant-ink);
  outline: none;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid #d99ca7;
  border-radius: 6px;
}

.rail-ai-conversation-list > p {
  padding: 20px 8px;
  margin: 0;
  font-size: 10px;
  color: var(--assistant-steel);
  text-align: center;
}

.rail-ai-messages {
  min-height: 0;
  padding: 16px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: transparent;
}

.rail-ai-messages::-webkit-scrollbar {
  width: 6px;
}

.rail-ai-messages::-webkit-scrollbar-thumb {
  background: var(--rail-theme-surface, #cbd1d7);
  border-radius: 99px;
}

.rail-ai-loading,
.rail-ai-empty {
  display: grid;
  place-content: center;
  justify-items: center;
  height: 100%;
  min-height: 0;
  text-align: center;
}

.rail-ai-loading span {
  width: 24px;
  height: 24px;
  border: 2px solid var(--rail-theme-border, #d5dae0);
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
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #e4c4ca);
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
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  margin-top: 2px;
}

.rail-ai-avatar.is-user {
  display: grid;
  place-items: center;
  font-size: 17px;
  color: var(--assistant-steel);
  background: var(--assistant-mist);
  border-radius: 50%;
}

.rail-ai-message__body {
  min-width: 0;
  padding: 3px 4px;
  background: transparent;
  border: 0;
  box-shadow: none;
}

.rail-ai-message.is-user .rail-ai-message__body {
  border-radius: 13px 4px 13px 13px;
}

.rail-ai-message.is-sending .rail-ai-message__body {
  opacity: 0.88;
}

.rail-ai-message.is-failed .rail-ai-message__body {
  color: #784d17;
  background: transparent;
}

.rail-ai-message__body > p {
  margin: 0;
  font-size: 13px;
  line-height: 1.68;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.rail-ai-message__body :deep(.platform-markdown) {
  padding: 0;
  font-size: 13px;
  line-height: 1.68;
  color: inherit;
}

.rail-ai-message__body
  :deep(.platform-markdown :is(p, blockquote, ul, ol, pre)) {
  margin: 0 0 8px;
}

.rail-ai-message__body
  :deep(.platform-markdown :is(p, blockquote, ul, ol, pre):last-child) {
  margin-bottom: 0;
}

.rail-ai-message__body :deep(.platform-markdown__heading) {
  margin: 3px 0 7px;
  font-size: 14px;
  color: inherit;
}

.rail-ai-message__body :deep(.platform-markdown :is(ul, ol)) {
  padding-left: 20px;
}

.rail-ai-message__body :deep(.platform-markdown pre) {
  padding: 9px;
  font-size: 11px;
  border-radius: 7px;
}

.rail-ai-message__meta {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 20px;
  margin-top: 5px;
}

.rail-ai-message__time {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
  margin-left: auto;
  font-size: 9px;
  color: var(--rail-theme-secondary, #8a949e);
}

.rail-ai-copy-button {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  font-size: 12px;
  color: var(--assistant-steel);
  background: transparent;
  border: 0;
  border-radius: 6px;
  transition: 150ms ease;
}

.rail-ai-copy-button:hover {
  color: var(--assistant-red);
  background: var(--rail-theme-surface, #fff0f2);
}

.rail-ai-message.is-user .rail-ai-message__time {
  justify-content: flex-end;
}

.rail-ai-thinking {
  display: flex;
  gap: 4px;
  align-items: center;
  min-width: 38px;
  height: 18px;
}

.rail-ai-thinking span {
  width: 5px;
  height: 5px;
  background: var(--assistant-steel);
  border-radius: 50%;
  animation: rail-ai-thinking 1.1s ease-in-out infinite;
}

.rail-ai-thinking span:nth-child(2) {
  animation-delay: 120ms;
}

.rail-ai-thinking span:nth-child(3) {
  animation-delay: 240ms;
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

.rail-ai-attachment.is-local {
  cursor: default;
  opacity: 0.86;
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
  object-fit: contain;
  background: var(--rail-theme-surface, #fff);
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
  padding: 12px 20px 20px;
  background: transparent;
}

.rail-ai-service-note {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  margin-bottom: 8px;
  font-size: 10px;
  color: #80520f;
  background: var(--rail-theme-surface, #fff8e9);
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
  background: var(--rail-theme-surface, #fff5f5);
  border-color: #e7b2b2;
}

.rail-ai-pending-file > img,
.rail-ai-pending-file > svg {
  width: 34px;
  height: 34px;
  padding: 6px;
  color: var(--assistant-red);
  object-fit: contain;
  background: var(--rail-theme-surface, #fff);
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
  position: relative;
  min-height: 52px;
  overflow: hidden;
  background: var(--rail-theme-surface, #f6f7f8);
  border: 1px solid transparent;
  border-radius: 24px;
}

.rail-ai-input-shell:focus-within {
  border-color: var(--assistant-red);
  box-shadow: 0 0 0 3px rgb(185 28 50 / 9%);
}

.rail-ai-input-shell textarea {
  display: block;
  width: 100%;
  min-height: 50px;
  max-height: 124px;
  padding: 14px 48px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 22px;
  color: var(--assistant-ink);
  resize: none;
  outline: none;
  background: transparent;
  border: 0;
}

.rail-ai-input-shell textarea::placeholder {
  color: var(--rail-theme-muted, #9aa2aa);
}

.rail-ai-input-actions {
  display: contents;
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
  position: absolute;
  right: 10px;
  bottom: 9px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
  color: #fff;
  background: var(--assistant-red);
  border: 0;
  border-radius: 50%;
}

.rail-ai-attach-button {
  position: absolute;
  bottom: 9px;
  left: 12px;
  color: var(--assistant-steel);
  background: transparent;
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

.rail-ai-float-button {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 1199;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  padding: 0;
  touch-action: none;
  user-select: none;
  background: transparent;
  border: 0;
  border-radius: 50%;
  box-shadow: none;
  transition: transform 160ms ease;
}

.rail-ai-float-button img {
  display: block;
  width: 32px;
  height: 32px;
  filter: drop-shadow(0 3px 6px rgb(187 27 33 / 16%));
}

.rail-ai-welcome {
  font-size: 16px;
  font-weight: 600;
  color: var(--assistant-ink);
}

.rail-ai-float-button:hover {
  transform: translateY(-2px);
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

@keyframes rail-ai-thinking {
  0%,
  60%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

:global(.dark) .rail-ai-assistant {
  --assistant-ink: #f1f3f5;
  --assistant-steel: var(--rail-theme-muted, #a8b0b8);
  --assistant-mist: var(--rail-theme-surface, #171b20);
  --assistant-line: var(--rail-theme-border, #343a42);

  background: var(--rail-theme-surface, #20252c);
  border-color: var(--rail-theme-border, #3b424a);
}

:global(.dark) .rail-ai-composer,
:global(.dark) .rail-ai-conversation-menu,
:global(.dark) .rail-ai-conversation-sort,
:global(.dark) .rail-ai-conversation-tools label,
:global(.dark) .rail-ai-input-shell,
:global(.dark) .rail-ai-empty__mark,
:global(.dark) .rail-ai-message__body {
  background: var(--rail-theme-surface, #20252c);
}

:global(.dark) .rail-ai-conversation-tools {
  background: var(--rail-theme-surface, #171b20);
}

:global(.dark) .rail-ai-conversation-tools input,
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
