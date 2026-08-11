<script lang="ts" setup>
import type {
  CapabilityField,
  DesignConversation,
  PlatformCapability,
  PlatformJob,
  PlatformJobOutput,
} from '#/modules/platform/types';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Drawer,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Switch,
  Textarea,
} from 'ant-design-vue';

import {
  archiveDesignConversationApi,
  createDesignConversationApi,
  getAssetDownloadApi,
  getCapabilityApi,
  getDesignConversationDraftApi,
  getDesignConversationsApi,
  renameDesignConversationApi,
  saveDesignConversationDraftApi,
} from '#/api';
import ComfyMaskEditor from '#/components/platform/comfy-mask-editor.vue';
import WorkflowRunCard from '#/components/platform/workflow-run-card.vue';
import { usePlatformStore } from '#/store';
import { selectDesignConversationJobs } from '#/store/platform/helpers';

import CameraAngleControl from '../workspace/camera-angle-control.vue';
import CapabilityMediaField from '../workspace/capability-media-field.vue';

const DEFAULT_APP_KEY = 'text-chat';
const mediaTypes = new Set(['asset', 'capture', 'mask', 'region']);
const route = useRoute();
const router = useRouter();
const platformStore = usePlatformStore();

const loading = ref(false);
const conversations = ref<DesignConversation[]>([]);
const activeConversationId = ref('');
const selectedAppKey = ref(DEFAULT_APP_KEY);
const capability = ref<null | PlatformCapability>(null);
const capabilityLoading = ref(false);
const capabilityCache = reactive<Record<string, PlatformCapability>>({});
const selectedAssets = reactive<Record<number, string>>({});
const parameterValues = reactive<Record<string, unknown>>({});
const parameterDrawerOpen = ref(false);
const submitting = ref(false);
const renameOpen = ref(false);
const renameTitle = ref('');
const appSearch = ref('');
const outputMaskEditorOpen = ref(false);
const outputMaskSource = ref('');
const outputMaskTitle = ref('');
const actionOutput = ref<PlatformJobOutput>();
const continueOpen = ref(false);
const continueAppKey = ref('');
const continueAssetIndex = ref<number>();
const continueSubmitting = ref(false);
const draftReadyKey = ref('');
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let loadGeneration = 0;
let hydratingDraft = false;

const activeConversation = computed(() =>
  conversations.value.find((item) => item.id === activeConversationId.value),
);
const application = computed(() =>
  platformStore.applications.find((item) => item.key === selectedAppKey.value),
);
const availableApplications = computed(() => {
  const query = appSearch.value.trim().toLowerCase();
  return platformStore.applications
    .filter((item) => item.visible && item.capabilityCode)
    .filter(
      (item) =>
        !query ||
        `${item.name}${item.shortName}${item.description}`
          .toLowerCase()
          .includes(query),
    )
    .toSorted((a, b) => {
      if (a.key === DEFAULT_APP_KEY) return -1;
      if (b.key === DEFAULT_APP_KEY) return 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });
});
const conversationJobs = computed(() =>
  selectDesignConversationJobs(
    platformStore.currentJobs,
    activeConversationId.value,
    platformStore.currentProjectId,
  ),
);
const activeJob = computed(() =>
  conversationJobs.value.find((job) =>
    ['cancelling', 'queued', 'running'].includes(job.status),
  ),
);
const mediaFields = computed(
  () =>
    capability.value?.fields
      .filter((field) => mediaTypes.has(field.type))
      .toSorted((a, b) => (a.assetIndex ?? 0) - (b.assetIndex ?? 0)) ?? [],
);
const scalarFields = computed(
  () =>
    capability.value?.fields.filter(
      (field) => !mediaTypes.has(field.type) && field.uiControl === 'default',
    ) ?? [],
);
const cameraFields = computed(
  () =>
    capability.value?.fields.filter((field) =>
      field.uiControl.startsWith('camera-'),
    ) ?? [],
);
const promptField = computed(() =>
  scalarFields.value.find(
    (field) =>
      field.key === 'prompt' ||
      field.type === 'textarea' ||
      (field.type === 'text' && field.required),
  ),
);
const compactFields = computed(() =>
  scalarFields.value
    .filter((field) => field.key !== promptField.value?.key)
    .slice(0, 4),
);
const selectedAssetIds = computed(() =>
  mediaFields.value.flatMap((field) => {
    if (field.assetIndex === undefined) return [];
    const id = selectedAssets[field.assetIndex];
    return id ? [id] : [];
  }),
);
const continueDestinations = computed(() => {
  const kind = actionOutput.value?.kind;
  if (!kind) return [];
  return platformStore.applications
    .filter(
      (item) =>
        item.visible &&
        item.capabilityCode &&
        item.acceptedAssetTypes.includes(kind),
    )
    .map((item) => ({ label: item.name, value: item.key }));
});
const continueInputOptions = computed(() => {
  const target = capabilityCache[continueAppKey.value];
  const kind = actionOutput.value?.kind;
  if (!target || !kind) return [];
  return target.fields.flatMap((field) =>
    field.assetIndex !== undefined &&
    mediaTypes.has(field.type) &&
    field.acceptedKinds.includes(kind)
      ? [
          {
            label: `${field.label}${field.required ? '（必填）' : ''}`,
            value: field.assetIndex,
          },
        ]
      : [],
  );
});

function formatConversationTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function fieldTextValue(field: CapabilityField) {
  const value = parameterValues[field.key];
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
}

function fieldNumberValue(field: CapabilityField) {
  const value = parameterValues[field.key];
  return typeof value === 'number' ? value : undefined;
}

function fieldBooleanValue(field: CapabilityField) {
  return parameterValues[field.key] === true;
}

function fieldJsonValue(field: CapabilityField) {
  const value = parameterValues[field.key];
  if (typeof value === 'string') return value;
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

function setFieldValue(field: CapabilityField, value: unknown) {
  parameterValues[field.key] = value;
  scheduleDraftSave();
}

function setFieldNumberValue(
  field: CapabilityField,
  value: null | number | string,
) {
  const normalized = typeof value === 'string' ? Number(value) : value;
  parameterValues[field.key] = normalized ?? field.defaultValue;
  scheduleDraftSave();
}

function resetDraftState(nextCapability?: PlatformCapability) {
  for (const key of Object.keys(parameterValues)) {
    Reflect.deleteProperty(parameterValues, key);
  }
  for (const key of Object.keys(selectedAssets)) {
    Reflect.deleteProperty(selectedAssets, key);
  }
  for (const field of nextCapability?.fields ?? []) {
    if (!mediaTypes.has(field.type) || field.type === 'region') {
      parameterValues[field.key] = field.defaultValue;
    }
  }
}

function draftPayload() {
  const conversationId = activeConversationId.value;
  const appKey = application.value?.key;
  const projectId = platformStore.currentProjectId;
  if (
    !conversationId ||
    !appKey ||
    !projectId ||
    !capability.value ||
    draftReadyKey.value !== `${conversationId}:${appKey}`
  ) {
    return;
  }
  return {
    appKey,
    conversationId,
    inputAssetIds: Object.fromEntries(
      Object.entries(selectedAssets).filter(([, id]) => Boolean(id)),
    ),
    parameterValues: taskParameters(),
    projectId,
  };
}

async function saveDraftNow() {
  if (hydratingDraft) return;
  const payload = draftPayload();
  if (!payload) return;
  await saveDesignConversationDraftApi(payload).catch(() => undefined);
}

function scheduleDraftSave() {
  if (hydratingDraft || !draftPayload()) return;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    draftTimer = undefined;
    void saveDraftNow();
  }, 500);
}

async function loadCapability(appKey = selectedAppKey.value) {
  const generation = ++loadGeneration;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = undefined;
  draftReadyKey.value = '';
  capability.value = null;
  const app = platformStore.applications.find((item) => item.key === appKey);
  const conversationId = activeConversationId.value;
  const projectId = platformStore.currentProjectId;
  if (!app?.capabilityCode || !conversationId || !projectId) return;
  capabilityLoading.value = true;
  try {
    const nextCapability =
      capabilityCache[appKey] ?? (await getCapabilityApi(app.capabilityCode));
    capabilityCache[appKey] = nextCapability;
    const draft = await getDesignConversationDraftApi(
      conversationId,
      projectId,
      appKey,
    );
    if (
      generation !== loadGeneration ||
      selectedAppKey.value !== appKey ||
      activeConversationId.value !== conversationId
    ) {
      return;
    }
    capability.value = nextCapability;
    hydratingDraft = true;
    resetDraftState(nextCapability);
    const scalarKeys = new Set(
      nextCapability.fields
        .filter(
          (field) => !mediaTypes.has(field.type) || field.type === 'region',
        )
        .map((field) => field.key),
    );
    for (const [key, value] of Object.entries(draft.parameterValues)) {
      if (scalarKeys.has(key)) parameterValues[key] = value;
    }
    for (const [index, assetId] of Object.entries(draft.inputAssetIds)) {
      selectedAssets[Number(index)] = assetId;
    }
    draftReadyKey.value = `${conversationId}:${appKey}`;
  } finally {
    if (generation === loadGeneration) {
      hydratingDraft = false;
      capabilityLoading.value = false;
    }
  }
}

async function hydrateTimelineCapabilities() {
  const appKeys = [...new Set(conversationJobs.value.map((job) => job.appKey))];
  await Promise.allSettled(
    appKeys.map(async (appKey) => {
      if (capabilityCache[appKey]) return;
      const app = platformStore.applications.find(
        (item) => item.key === appKey,
      );
      if (!app?.capabilityCode) return;
      capabilityCache[appKey] = await getCapabilityApi(app.capabilityCode);
    }),
  );
}

async function refreshConversations() {
  const projectId = platformStore.currentProjectId;
  conversations.value = projectId
    ? await getDesignConversationsApi(projectId)
    : [];
}

async function ensureConversation() {
  const projectId = platformStore.currentProjectId;
  if (!projectId) return;
  await refreshConversations();
  const requestedId =
    typeof route.query.conversationId === 'string'
      ? route.query.conversationId
      : '';
  const requestedAppKey =
    typeof route.query.appKey === 'string' &&
    platformStore.applications.some(
      (item) => item.key === route.query.appKey && item.visible,
    )
      ? route.query.appKey
      : undefined;
  const target =
    conversations.value.find((item) => item.id === requestedId) ??
    conversations.value[0];
  if (target) {
    await selectConversation(target.id, requestedAppKey);
    return;
  }
  await createConversation();
}

async function createConversation() {
  const projectId = platformStore.currentProjectId;
  if (!projectId) {
    message.warning('请先创建或选择项目');
    return;
  }
  const conversation = await createDesignConversationApi({ projectId });
  conversations.value.unshift(conversation);
  const requestedAppKey =
    typeof route.query.appKey === 'string' ? route.query.appKey : undefined;
  await selectConversation(conversation.id, requestedAppKey);
}

async function selectConversation(
  conversationId: string,
  preferredAppKey?: string,
) {
  if (!conversationId || activeConversationId.value === conversationId) {
    if (conversationId) await loadCapability();
    return;
  }
  await saveDraftNow();
  activeConversationId.value = conversationId;
  const conversation = conversations.value.find(
    (item) => item.id === conversationId,
  );
  const availablePreferredApp =
    preferredAppKey &&
    platformStore.applications.some(
      (item) => item.key === preferredAppKey && item.visible,
    )
      ? preferredAppKey
      : undefined;
  const availableLastApp =
    conversation?.lastAppKey &&
    platformStore.applications.some(
      (item) => item.key === conversation.lastAppKey && item.visible,
    )
      ? conversation.lastAppKey
      : undefined;
  selectedAppKey.value =
    availablePreferredApp ?? availableLastApp ?? DEFAULT_APP_KEY;
  await router.replace({ query: { conversationId } });
  await loadCapability();
  void hydrateTimelineCapabilities();
}

async function chooseApplication(appKey: string) {
  if (appKey === selectedAppKey.value && capability.value) return;
  await saveDraftNow();
  selectedAppKey.value = appKey;
  await loadCapability(appKey);
}

function openRename() {
  if (!activeConversation.value) return;
  renameTitle.value = activeConversation.value.title;
  renameOpen.value = true;
}

async function renameConversation() {
  const title = renameTitle.value.trim();
  const conversation = activeConversation.value;
  if (!title || !conversation) return;
  const result = await renameDesignConversationApi(conversation.id, {
    projectId: platformStore.currentProjectId,
    title,
  });
  conversation.title = result.title;
  conversation.updatedAt = result.updatedAt;
  renameOpen.value = false;
  message.success('会话名称已更新');
}

function archiveConversation(conversation: DesignConversation) {
  Modal.confirm({
    content: '会话将从历史列表隐藏，项目资产、任务台账和审计记录会继续保留。',
    okButtonProps: { danger: true },
    okText: '删除会话',
    title: `删除“${conversation.title}”？`,
    async onOk() {
      await archiveDesignConversationApi(
        conversation.id,
        platformStore.currentProjectId,
      );
      conversations.value = conversations.value.filter(
        (item) => item.id !== conversation.id,
      );
      if (activeConversationId.value === conversation.id) {
        activeConversationId.value = '';
        const next = conversations.value[0];
        await (next ? selectConversation(next.id) : createConversation());
      }
    },
  });
}

function taskParameters() {
  return Object.fromEntries(
    (capability.value?.fields ?? [])
      .filter((field) => !mediaTypes.has(field.type) || field.type === 'region')
      .map((field) => [field.key, parameterValues[field.key]]),
  );
}

async function runCapability() {
  if (!application.value || !capability.value || !activeConversationId.value) {
    return;
  }
  const missingAsset = mediaFields.value.find(
    (field) =>
      field.required &&
      (field.assetIndex === undefined || !selectedAssets[field.assetIndex]),
  );
  if (missingAsset) {
    parameterDrawerOpen.value = true;
    message.warning(`请先完成“${missingAsset.label}”`);
    return;
  }
  const missingParameter = scalarFields.value.find(
    (field) =>
      field.required &&
      String(parameterValues[field.key] ?? '').trim().length === 0,
  );
  if (missingParameter) {
    message.warning(`请填写“${missingParameter.label}”`);
    return;
  }
  if (activeJob.value) {
    message.warning('当前设计会话已有任务在运行，请等待完成或取消后再提交');
    return;
  }
  submitting.value = true;
  try {
    const job = await platformStore.runApplication(
      application.value.key,
      { designConversationId: activeConversationId.value },
      selectedAssetIds.value,
      taskParameters(),
    );
    if (job?.status === 'failed') {
      message.warning(job.error?.message ?? '能力服务执行失败');
    } else if (job) {
      message.success('任务已提交，可以切换到其他设计会话继续工作');
    }
    await refreshConversations();
    void hydrateTimelineCapabilities();
  } finally {
    submitting.value = false;
  }
}

async function rerunJob(job: PlatformJob) {
  await chooseApplication(job.appKey);
  hydratingDraft = true;
  try {
    resetDraftState(capability.value ?? undefined);
    for (const [key, value] of Object.entries(job.parameters)) {
      parameterValues[key] = value;
    }
    for (const input of job.inputs)
      selectedAssets[input.position] = input.assetId;
  } finally {
    hydratingDraft = false;
  }
  await saveDraftNow();
  await runCapability();
}

async function selectAsset(field: CapabilityField, assetId: string) {
  if (field.assetIndex === undefined) return;
  const occupied = Object.entries(selectedAssets).find(
    ([index, id]) => Number(index) !== field.assetIndex && id === assetId,
  );
  if (occupied) {
    message.warning('该资产已用于另一个输入位');
    return;
  }
  const previousAssetId = selectedAssets[field.assetIndex];
  selectedAssets[field.assetIndex] = assetId;
  if (field.type === 'region' && previousAssetId !== assetId) {
    parameterValues[field.key] = '';
  }
  await saveDraftNow();
}

async function uploadMedia(
  field: CapabilityField,
  file: File,
  options: {
    derivedFromAssetId?: string;
    silent?: boolean;
    tags?: string[];
  } = {},
) {
  const asset = await platformStore.uploadAsset({
    description: `${capability.value?.name ?? application.value?.name} 设计会话输入`,
    derivedFromAssetId: options.derivedFromAssetId,
    file,
    name: file.name.replace(/\.[^.]+$/, ''),
    tags: options.tags ?? ['设计会话输入'],
    type: 'image',
  });
  await selectAsset(field, asset.id);
  if (!options.silent) message.success('图像已登记为当前项目资产');
  return asset;
}

async function saveInputMask(field: CapabilityField, file: File) {
  const index = field.assetIndex;
  const selectedAsset =
    index === undefined
      ? undefined
      : platformStore.currentAssets.find(
          (asset) => asset.id === selectedAssets[index],
        );
  await uploadMedia(field, file, {
    derivedFromAssetId: selectedAsset?.derivedFromAssetId ?? selectedAsset?.id,
    tags: ['设计会话输入', '遮罩'],
  });
}

function captureRefreshRate() {
  const field = capability.value?.fields.find((item) =>
    item.label.includes('捕获间隔'),
  );
  const value = field ? parameterValues[field.key] : undefined;
  return typeof value === 'number' ? value : 500;
}

async function waitForJob(jobId: string) {
  while (true) {
    await platformStore.refreshCurrentProjectData();
    const job = platformStore.currentJobs.find((item) => item.id === jobId);
    if (job && ['cancelled', 'failed', 'succeeded'].includes(job.status)) {
      return job.status === 'succeeded';
    }
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }
}

async function runLiveCapture(field: CapabilityField, file: File) {
  await uploadMedia(field, file, {
    silent: true,
    tags: ['设计会话输入', '实时捕获'],
  });
  await runCapability();
  const job = conversationJobs.value.at(-1);
  return job ? await waitForJob(job.id) : false;
}

async function stopLiveCapture() {
  if (activeJob.value) await platformStore.cancelJob(activeJob.value.id);
}

async function saveOutput(output: PlatformJobOutput) {
  if (!output.saved) await platformStore.saveWorkflowOutput(output.assetId);
  message.success('生成结果已保存到当前项目资产中心');
}

async function downloadOutput(output: PlatformJobOutput) {
  const result = await getAssetDownloadApi(output.assetId);
  if (result.mode === 'url') {
    window.open(result.url, '_blank', 'noopener,noreferrer');
    return;
  }
  Modal.info({
    content: result.content,
    okText: '关闭',
    title: output.name,
    width: 720,
  });
}

function openOutputMask(output: PlatformJobOutput, previewUrl: string) {
  actionOutput.value = output;
  outputMaskSource.value = previewUrl;
  outputMaskTitle.value = output.name;
  outputMaskEditorOpen.value = true;
}

async function saveOutputMask(file: File) {
  const output = actionOutput.value;
  if (!output) throw new Error('当前没有可编辑的图片结果');
  await platformStore.uploadAsset({
    description: '设计会话工作流结果遮罩编辑',
    file,
    name: file.name.replace(/\.[^.]+$/, ''),
    tags: ['工作流结果编辑', '遮罩'],
    type: 'image',
  });
  message.success('遮罩编辑结果已保存到当前项目资产中心');
}

async function loadContinueCapability(appKey: string) {
  continueAssetIndex.value = undefined;
  if (capabilityCache[appKey]) return;
  const app = platformStore.applications.find((item) => item.key === appKey);
  if (app?.capabilityCode) {
    capabilityCache[appKey] = await getCapabilityApi(app.capabilityCode);
  }
}

function openContinue(output: PlatformJobOutput) {
  actionOutput.value = output;
  if (continueDestinations.value.length === 0) {
    message.warning('当前没有可接收该结果的应用');
    return;
  }
  continueAppKey.value = continueDestinations.value[0]?.value ?? '';
  continueOpen.value = true;
  void loadContinueCapability(continueAppKey.value);
}

async function continueDesign() {
  const output = actionOutput.value;
  if (
    !output ||
    !continueAppKey.value ||
    continueAssetIndex.value === undefined
  ) {
    return;
  }
  continueSubmitting.value = true;
  try {
    if (!output.saved) await platformStore.saveWorkflowOutput(output.assetId);
    await chooseApplication(continueAppKey.value);
    const target = mediaFields.value.find(
      (field) => field.assetIndex === continueAssetIndex.value,
    );
    if (!target) throw new Error('目标应用输入位已变化，请重新选择');
    await selectAsset(target, output.assetId);
    continueOpen.value = false;
    parameterDrawerOpen.value = true;
    message.success('结果已加入资产并填入当前会话的目标应用');
  } finally {
    continueSubmitting.value = false;
  }
}

function jobApplication(job: PlatformJob) {
  return platformStore.applications.find((item) => item.key === job.appKey);
}

function jobCapability(job: PlatformJob) {
  return capabilityCache[job.appKey];
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    await platformStore.refreshCurrentProjectData();
    void hydrateTimelineCapabilities();
  }, 2000);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
}

watch(
  () => platformStore.currentProjectId,
  async () => {
    loading.value = true;
    activeConversationId.value = '';
    try {
      await ensureConversation();
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
watch(activeJob, (job) => (job ? startPolling() : stopPolling()), {
  immediate: true,
});
watch(continueAppKey, (appKey) => {
  if (continueOpen.value && appKey) void loadContinueCapability(appKey);
});
onBeforeUnmount(() => {
  stopPolling();
  if (draftTimer) clearTimeout(draftTimer);
  void saveDraftNow();
});
</script>

<template>
  <main class="design-page">
    <aside class="conversation-sidebar">
      <div class="conversation-brand">
        <span>PROJECT DESIGN</span>
        <h1>开始设计</h1>
        <p>{{ platformStore.currentProject?.name ?? '请先选择项目' }}</p>
      </div>
      <Button block type="primary" @click="createConversation">
        <IconifyIcon icon="lucide:square-pen" />
        新建会话
      </Button>
      <div class="conversation-list-heading">历史会话</div>
      <div class="conversation-list">
        <button
          v-for="item in conversations"
          :key="item.id"
          :class="{ active: item.id === activeConversationId }"
          class="conversation-item"
          type="button"
          @click="selectConversation(item.id)"
        >
          <span class="conversation-item__icon">
            <IconifyIcon icon="lucide:messages-square" />
          </span>
          <span class="conversation-item__body">
            <strong>{{ item.title }}</strong>
            <small>
              {{ item.roundCount }} 轮 ·
              {{ formatConversationTime(item.updatedAt) }}
            </small>
          </span>
          <i v-if="item.activeJobCount" title="任务运行中"></i>
          <span
            v-if="item.id === activeConversationId"
            class="conversation-actions"
          >
            <button title="重命名" type="button" @click.stop="openRename">
              <IconifyIcon icon="lucide:pencil" />
            </button>
            <button
              title="删除"
              type="button"
              @click.stop="archiveConversation(item)"
            >
              <IconifyIcon icon="lucide:trash-2" />
            </button>
          </span>
        </button>
      </div>
    </aside>

    <section class="design-thread">
      <header class="thread-header">
        <div>
          <strong>{{ activeConversation?.title ?? '新设计会话' }}</strong>
          <span>同一会话内组合使用多项设计能力</span>
        </div>
        <div class="thread-status">
          <i :class="{ running: activeJob }"></i>
          {{ activeJob ? '正在生成' : '可以开始' }}
        </div>
      </header>

      <div class="thread-scroll">
        <Spin :spinning="loading">
          <div v-if="conversationJobs.length" class="thread-timeline">
            <WorkflowRunCard
              v-for="(job, index) in conversationJobs"
              :key="job.id"
              :accent="jobApplication(job)?.color ?? '#b91c32'"
              :fields="jobCapability(job)?.fields ?? []"
              :job="job"
              :round="index + 1"
              :supports-image-comparison="
                jobCapability(job)?.supportsImageComparison ?? false
              "
              @download="downloadOutput"
              @flow="openContinue"
              @mask="openOutputMask"
              @rerun="rerunJob"
              @save="saveOutput"
            />
          </div>
          <div v-else class="thread-welcome">
            <div class="welcome-mark">
              <IconifyIcon icon="lucide:sparkles" />
            </div>
            <span>RAIL DESIGN COPILOT</span>
            <h2>从一个设计问题开始</h2>
            <p>
              默认使用“文生文”工作流。你可以随时切换到文生图、重绘、扩图等能力，所有输入与结果都会保留在本会话中。
            </p>
          </div>
        </Spin>
      </div>

      <footer class="design-composer">
        <div class="composer-app-row">
          <button
            v-for="item in availableApplications"
            :key="item.key"
            :class="{ active: item.key === selectedAppKey }"
            type="button"
            @click="chooseApplication(item.key)"
          >
            <IconifyIcon :icon="item.icon" />
            {{ item.shortName }}
          </button>
        </div>
        <div
          class="composer-box"
          :style="{ '--app-accent': application?.color }"
        >
          <div class="composer-title">
            <span>
              <IconifyIcon
                :icon="application?.icon ?? 'lucide:message-circle'"
              />
              {{ application?.name ?? '选择应用' }}
            </span>
            <Button
              size="small"
              type="text"
              @click="parameterDrawerOpen = true"
            >
              <IconifyIcon icon="lucide:sliders-horizontal" />
              全部参数
            </Button>
          </div>
          <Textarea
            v-if="promptField"
            :value="fieldTextValue(promptField)"
            :maxlength="promptField.maxLength"
            :placeholder="promptField.placeholder ?? '描述你的设计需求…'"
            :rows="3"
            auto-size
            @update:value="setFieldValue(promptField, $event)"
            @press-enter="
              !$event.shiftKey && (runCapability(), $event.preventDefault())
            "
          />
          <div v-else class="composer-no-prompt">
            该应用主要使用图片或结构化参数，请打开“全部参数”完成输入。
          </div>
          <div class="composer-bottom">
            <div class="parameter-chips">
              <button
                v-for="field in compactFields"
                :key="field.key"
                type="button"
                @click="parameterDrawerOpen = true"
              >
                {{ field.label }}
                <strong>{{ fieldTextValue(field) ?? '设置' }}</strong>
              </button>
              <button
                v-if="mediaFields.length"
                type="button"
                @click="parameterDrawerOpen = true"
              >
                输入资产
                <strong>
                  {{ selectedAssetIds.length }}/{{ mediaFields.length }}
                </strong>
              </button>
            </div>
            <Button
              :disabled="!activeConversationId || Boolean(activeJob)"
              :loading="submitting"
              shape="circle"
              type="primary"
              @click="runCapability"
            >
              <IconifyIcon icon="lucide:arrow-up" />
            </Button>
          </div>
        </div>
      </footer>
    </section>

    <Drawer
      v-model:open="parameterDrawerOpen"
      :title="`${application?.name ?? '应用'} · 参数与输入`"
      class="design-parameter-drawer"
      placement="right"
      width="min(520px, 94vw)"
    >
      <Spin :spinning="capabilityLoading">
        <div class="drawer-section" v-if="mediaFields.length">
          <h3>输入内容</h3>
          <CapabilityMediaField
            v-for="field in mediaFields"
            :key="field.key"
            :accent="application?.color ?? '#b91c32'"
            :assets="platformStore.currentAssets"
            :field="field"
            :live-capture="(file) => runLiveCapture(field, file)"
            :refresh-rate="captureRefreshRate()"
            :save-mask="(file) => saveInputMask(field, file)"
            :selected-asset-id="
              field.assetIndex === undefined
                ? undefined
                : selectedAssets[field.assetIndex]
            "
            :value="parameterValues[field.key]"
            :stop-live-capture="stopLiveCapture"
            @select="selectAsset(field, $event)"
            @update:value="setFieldValue(field, $event)"
            @upload="uploadMedia(field, $event)"
          />
        </div>
        <div v-if="cameraFields.length" class="drawer-section">
          <h3>镜头控制</h3>
          <CameraAngleControl
            :accent="application?.color ?? '#b91c32'"
            :fields="cameraFields"
            :values="parameterValues"
            @update="setFieldNumberValue"
          />
        </div>
        <div class="drawer-section">
          <h3>应用参数</h3>
          <label
            v-for="field in scalarFields"
            :key="field.key"
            class="drawer-field"
          >
            <span>
              {{ field.label }}
              <i v-if="field.required">必填</i>
              <em v-if="field.advanced">高级</em>
            </span>
            <small v-if="field.help">{{ field.help }}</small>
            <Textarea
              v-if="field.type === 'textarea'"
              :value="fieldTextValue(field)"
              :maxlength="field.maxLength"
              :placeholder="field.placeholder"
              :rows="4"
              @update:value="setFieldValue(field, $event)"
            />
            <Textarea
              v-else-if="field.type === 'json'"
              :value="fieldJsonValue(field)"
              :rows="5"
              @update:value="setFieldValue(field, $event)"
            />
            <Input
              v-else-if="field.type === 'text'"
              :value="fieldTextValue(field)"
              :maxlength="field.maxLength"
              :placeholder="field.placeholder"
              @update:value="setFieldValue(field, $event)"
            />
            <InputNumber
              v-else-if="field.type === 'number'"
              :max="field.max"
              :min="field.min"
              :step="field.step"
              :value="fieldNumberValue(field)"
              class="w-full"
              @update:value="setFieldNumberValue(field, $event)"
            />
            <Select
              v-else-if="field.type === 'select'"
              :options="field.options"
              :value="fieldTextValue(field)"
              class="w-full"
              @update:value="setFieldValue(field, $event)"
            />
            <Switch
              v-else
              :checked="fieldBooleanValue(field)"
              @update:checked="setFieldValue(field, $event)"
            />
          </label>
        </div>
      </Spin>
      <template #extra>
        <Button type="primary" @click="parameterDrawerOpen = false">
          完成
        </Button>
      </template>
    </Drawer>

    <Modal
      v-model:open="renameOpen"
      ok-text="保存"
      title="重命名设计会话"
      @ok="renameConversation"
    >
      <Input
        v-model:value="renameTitle"
        :maxlength="120"
        @press-enter="renameConversation"
      />
    </Modal>

    <Modal
      v-model:open="continueOpen"
      :confirm-loading="continueSubmitting"
      :ok-button-props="{ disabled: continueAssetIndex === undefined }"
      ok-text="加入资产并继续"
      title="在本会话中继续设计"
      @ok="continueDesign"
    >
      <p class="continue-description">
        结果会先登记为当前项目资产，再直接填入本会话所选应用；不需要选择其他应用会话，也不需要重复上传。
      </p>
      <Select
        v-model:value="continueAppKey"
        :options="continueDestinations"
        class="w-full"
        placeholder="选择下一步应用"
      />
      <Select
        v-model:value="continueAssetIndex"
        :options="continueInputOptions"
        class="mt-3 w-full"
        placeholder="选择目标输入位"
      />
    </Modal>

    <ComfyMaskEditor
      v-if="actionOutput?.kind === 'image'"
      v-model:open="outputMaskEditorOpen"
      :on-save="saveOutputMask"
      :src="outputMaskSource"
      :title="outputMaskTitle"
    />
  </main>
</template>

<style scoped>
.design-page {
  --design-border: #e3e6e8;
  --design-muted: #68747d;

  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  height: calc(100vh - 106px);
  min-height: 640px;
  overflow: hidden;
  color: #172027;
  background: #f5f6f7;
}

.conversation-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 20px 14px;
  background: #fff;
  border-right: 1px solid var(--design-border);
}

.conversation-brand {
  padding: 0 5px 18px;
}

.conversation-brand span {
  font:
    700 11px/1.2 'IBM Plex Mono',
    monospace;
  color: var(--rail-red);
  letter-spacing: 0.16em;
}

.conversation-brand h1 {
  margin: 4px 0 2px;
  font-size: 23px;
  font-weight: 760;
}

.conversation-brand p,
.conversation-list-heading {
  margin: 0;
  font-size: 12px;
  color: var(--design-muted);
}

.conversation-list-heading {
  padding: 22px 7px 8px;
  font-weight: 700;
}

.conversation-list {
  display: grid;
  gap: 4px;
  overflow-y: auto;
}

.conversation-item {
  position: relative;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 9px 8px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 10px;
}

.conversation-item:hover,
.conversation-item.active {
  background: #f3f4f5;
}

.conversation-item.active {
  box-shadow: inset 3px 0 var(--rail-red);
}

.conversation-item__icon {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--rail-red);
  background: #fff;
  border: 1px solid var(--design-border);
  border-radius: 9px;
}

.conversation-item__body {
  display: grid;
  min-width: 0;
}

.conversation-item__body strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.conversation-item__body small {
  font-size: 11px;
  color: var(--design-muted);
}

.conversation-item > i {
  width: 7px;
  height: 7px;
  background: #2f9e62;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgb(47 158 98 / 12%);
}

.conversation-actions {
  display: none;
  gap: 2px;
}

.conversation-item:hover .conversation-actions,
.conversation-item.active:hover .conversation-actions {
  display: flex;
}

.conversation-actions button {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  color: var(--design-muted);
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--design-border);
  border-radius: 7px;
}

.design-thread {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  overflow: hidden;
}

.thread-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 60px;
  padding: 10px 24px;
  background: rgb(255 255 255 / 94%);
  border-bottom: 1px solid var(--design-border);
}

.thread-header > div:first-child {
  display: grid;
  text-align: center;
}

.thread-header strong {
  font-size: 15px;
}

.thread-header span,
.thread-status {
  font-size: 12px;
  color: var(--design-muted);
}

.thread-status {
  display: flex;
  gap: 7px;
  align-items: center;
}

.thread-status i {
  width: 8px;
  height: 8px;
  background: #91a09a;
  border-radius: 50%;
}

.thread-status i.running {
  background: #2f9e62;
  animation: design-pulse 1.2s ease-in-out infinite;
}

.thread-scroll {
  padding: 24px clamp(18px, 5vw, 72px);
  overflow-y: auto;
}

.thread-timeline {
  display: grid;
  gap: 18px;
  max-width: 1180px;
  margin: 0 auto;
}

.thread-welcome {
  display: grid;
  place-items: center;
  max-width: 620px;
  min-height: 48vh;
  margin: auto;
  text-align: center;
}

.welcome-mark {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 14px;
  font-size: 25px;
  color: #fff;
  background: var(--rail-red);
  border-radius: 18px 7px;
  box-shadow: 0 14px 32px rgb(185 28 50 / 20%);
}

.thread-welcome > span {
  font:
    700 11px/1.2 'IBM Plex Mono',
    monospace;
  color: var(--rail-red);
  letter-spacing: 0.16em;
}

.thread-welcome h2 {
  margin: 8px 0 6px;
  font-size: 26px;
}

.thread-welcome p {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--design-muted);
}

.design-composer {
  padding: 0 clamp(18px, 5vw, 72px) 20px;
  background: linear-gradient(transparent, #f5f6f7 24%);
}

.composer-app-row {
  display: flex;
  gap: 6px;
  max-width: 980px;
  padding: 8px 0;
  margin: 0 auto;
  overflow-x: auto;
}

.composer-app-row button,
.parameter-chips button {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 5px;
  align-items: center;
  padding: 6px 10px;
  font-size: 12px;
  color: #4d5961;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--design-border);
  border-radius: 999px;
}

.composer-app-row button.active {
  color: var(--rail-red);
  background: #fff3f5;
  border-color: #e5a9b2;
}

.composer-box {
  max-width: 980px;
  padding: 12px 14px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid
    color-mix(in srgb, var(--app-accent) 35%, var(--design-border));
  border-radius: 20px;
  box-shadow: 0 14px 42px rgb(29 38 44 / 10%);
}

.composer-title,
.composer-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.composer-title > span {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 13px;
  font-weight: 750;
  color: var(--app-accent);
}

.composer-box :deep(textarea.ant-input) {
  padding: 9px 0;
  font-size: 14px;
  line-height: 1.65;
  resize: none;
  border: 0;
  box-shadow: none;
}

.composer-no-prompt {
  padding: 14px 0;
  font-size: 13px;
  color: var(--design-muted);
}

.parameter-chips {
  display: flex;
  gap: 5px;
  min-width: 0;
  overflow-x: auto;
}

.parameter-chips button {
  padding: 4px 8px;
  background: #f7f8f8;
}

.parameter-chips strong {
  max-width: 86px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #1f2b32;
  white-space: nowrap;
}

.drawer-section + .drawer-section {
  padding-top: 20px;
  margin-top: 20px;
  border-top: 1px solid var(--design-border);
}

.drawer-section h3 {
  margin: 0 0 14px;
  font-size: 15px;
}

.drawer-field {
  display: grid;
  gap: 7px;
  margin-bottom: 16px;
}

.drawer-field > span {
  font-size: 13px;
  font-weight: 700;
}

.drawer-field i,
.drawer-field em {
  padding: 2px 5px;
  margin-left: 5px;
  font-size: 11px;
  font-style: normal;
  color: var(--rail-red);
  background: #fff0f2;
  border-radius: 5px;
}

.drawer-field em {
  color: #65737d;
  background: #f0f2f3;
}

.drawer-field small,
.continue-description {
  font-size: 12px;
  line-height: 1.6;
  color: var(--design-muted);
}

@keyframes design-pulse {
  50% {
    opacity: 0.35;
  }
}

@media (max-width: 900px) {
  .design-page {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .thread-scroll,
  .design-composer {
    padding-right: 14px;
    padding-left: 14px;
  }
}
</style>
