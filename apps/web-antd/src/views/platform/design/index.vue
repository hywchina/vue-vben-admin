<script lang="ts" setup>
import type {
  DesignModeKey,
  DesignModeToolDefinition,
} from '#/modules/platform/design-modes';
import type {
  CapabilityField,
  DesignConversation,
  DesignPromptTemplateMode,
  PlatformCapability,
  PlatformJob,
  PlatformJobInput,
  PlatformJobOutput,
} from '#/modules/platform/types';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Drawer,
  Input,
  InputNumber,
  message,
  Modal,
  Popover,
  Select,
  Spin,
  Switch,
  Textarea,
} from 'ant-design-vue';

import {
  archiveDesignConversationApi,
  createDesignConversationApi,
  getAssetApi,
  getAssetDownloadApi,
  getAssetPreviewApi,
  getCapabilityApi,
  getDesignConversationDraftApi,
  getDesignConversationsApi,
  renameDesignConversationApi,
  saveDesignConversationDraftApi,
} from '#/api';
import ComfyMaskEditor from '#/components/platform/comfy-mask-editor.vue';
import WorkflowRunCard from '#/components/platform/workflow-run-card.vue';
import {
  applicationsForDesignMode,
  designModeForApplication,
  designModes,
  getDesignMode,
} from '#/modules/platform/design-modes';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { usePlatformStore } from '#/store';
import { selectDesignConversationJobs } from '#/store/platform/helpers';

import AssetPickerModal from '../workspace/asset-picker-modal.vue';
import CameraAngleControl from '../workspace/camera-angle-control.vue';
import CapabilityMediaField from '../workspace/capability-media-field.vue';
import { createRegionInputAnnotations } from '../workspace/region-annotation';
import {
  assignMediaAssetIds,
  mediaInputProgress,
  moveMediaAsset,
  orderedImageMediaFields,
} from './design-composer-media';
import { appendTextInput, markdownTextContent } from './design-input-utils';
import DesignPromptTemplatePopover from './design-prompt-template-popover.vue';
import DesignQuickField from './design-quick-field.vue';

const DEFAULT_APP_KEY = 'text-chat';
const mediaTypes = new Set(['asset', 'capture', 'mask', 'region']);
type BusinessResultAction =
  | 'environment'
  | 'mark'
  | 'multi-angle'
  | 'multi-image'
  | 'three-d'
  | 'understand'
  | 'upscale';
const route = useRoute();
const router = useRouter();
const platformStore = usePlatformStore();

const loading = ref(false);
const sidebarCollapsed = ref(false);
const conversations = ref<DesignConversation[]>([]);
const conversationSearch = ref('');
const activeConversationId = ref('');
const selectedAppKey = ref('');
const selectedModeKey = ref<DesignModeKey>('cabin');
const selectedModeCardKey = ref<DesignModeKey | null>(null);
const selectedBusinessToolKey = ref('');
const threadScrollRef = ref<HTMLElement>();
const capability = ref<null | PlatformCapability>(null);
const capabilityLoading = ref(false);
const capabilityCache = reactive<Record<string, PlatformCapability>>({});
const selectedAssets = reactive<Record<number, string>>({});
const parameterValues = reactive<Record<string, unknown>>({});
const parameterDrawerOpen = ref(false);
const mediaPickerOpen = ref(false);
const markdownPickerOpen = ref(false);
const composerAssetPickerOpen = ref(false);
const composerSourcePickerOpen = ref(false);
const composerFileInputRef = ref<HTMLInputElement>();
const composerUploading = ref(false);
const composerMaskEditorOpen = ref(false);
const composerMaskField = ref<CapabilityField>();
const composerMaskSource = ref('');
const composerMaskTitle = ref('');
const composerPreviewUrls = reactive<Record<string, string>>({});
const submitting = ref(false);
const renameOpen = ref(false);
const renameTitle = ref('');
const appSearch = ref('');
const outputMaskEditorOpen = ref(false);
const outputMaskSource = ref('');
const outputMaskTitle = ref('');
const maskEditDerivedFromAssetId = ref('');
const maskEditSourceAssetId = ref('');
const actionOutput = ref<PlatformJobOutput>();
const actionDesignMode = ref<Exclude<DesignModeKey, 'report'>>('cabin');
const continueOpen = ref(false);
const continueAppKey = ref('');
const continueAssetIndex = ref<number>();
const continueSubmitting = ref(false);
const saveOutputOpen = ref(false);
const saveOutputTarget = ref<PlatformJobOutput>();
const saveOutputFolderId = ref<string>();
const saveOutputSubmitting = ref(false);
const cmfMultiImageOpen = ref(false);
const cmfMultiImageMode = ref<'choose' | 'dialog'>('choose');
const cmfMultiImageOutput = ref<PlatformJobOutput>();
const cmfMultiImageDesignMode = ref<Exclude<DesignModeKey, 'report'>>('cmf');
const cmfMultiImagePrompt = ref('');
const cmfMultiImageFiles = ref<File[]>([]);
const cmfMultiImageSubmitting = ref(false);
const cmfUpscaleOpen = ref(false);
const cmfUpscaleOutput = ref<PlatformJobOutput>();
const cmfUpscaleDesignMode = ref<Exclude<DesignModeKey, 'report'>>('cmf');
const cmfUpscaleFactor = ref(4);
const cmfUpscaleSubmitting = ref(false);
const multiAngleOpen = ref(false);
const multiAngleMode = ref<'choose' | 'dialog'>('choose');
const multiAngleOutput = ref<PlatformJobOutput>();
const multiAngleDesignMode = ref<'cabin' | 'component'>('component');
const multiAngleFile = ref<File>();
const multiAngleSubmitting = ref(false);
const threeDOpen = ref(false);
const threeDMode = ref<'choose' | 'dialog'>('choose');
const threeDOutput = ref<PlatformJobOutput>();
const threeDFiles = ref<File[]>([]);
const threeDSubmitting = ref(false);
const markerEditorRequest = ref(0);
const draftReadyKey = ref('');
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let loadGeneration = 0;
let hydratingDraft = false;
let pageReady = false;

const activeConversation = computed(() =>
  conversations.value.find((item) => item.id === activeConversationId.value),
);
const regularConversations = computed(() =>
  conversations.value.filter((item) => !item.legacy),
);
const visibleConversations = computed(() => {
  const query = conversationSearch.value.trim().toLowerCase();
  return regularConversations.value.filter(
    (item) => !query || item.title.toLowerCase().includes(query),
  );
});
const projectOptions = computed(() =>
  platformStore.projects.map((project) => ({
    label: project.name,
    value: project.id,
  })),
);
const saveOutputFolderOptions = computed(() => [
  { label: '项目资产根目录', value: '' },
  ...platformStore.assetFolders
    .filter((folder) => folder.kind === 'normal')
    .map((folder) => ({
      label: assetFolderPath(folder.id),
      value: folder.id,
    })),
]);
const activeDesignMode = computed(() => getDesignMode(selectedModeKey.value));
const promptTemplateMode = computed<DesignPromptTemplateMode>(() =>
  selectedModeKey.value === 'report' ? 'cabin' : selectedModeKey.value,
);
const modeAvailability = computed(
  () =>
    Object.fromEntries(
      designModes.map((mode) => [
        mode.key,
        Boolean(
          mode.standalonePath ||
          applicationsForDesignMode(platformStore.applications, mode).length >
            0,
        ),
      ]),
    ) as Record<DesignModeKey, boolean>,
);
const availableApplications = computed(() => {
  const query = appSearch.value.trim().toLowerCase();
  return applicationsForDesignMode(
    platformStore.applications,
    activeDesignMode.value,
  ).filter(
    (item) =>
      !query ||
      `${item.name}${item.shortName}${item.description}`
        .toLowerCase()
        .includes(query),
  );
});
const defaultApplicationKey = computed(
  () =>
    availableApplications.value.find(
      (item) => item.key === activeDesignMode.value.defaultApplicationKey,
    )?.key ?? availableApplications.value[0]?.key,
);
const effectiveApplicationKey = computed(
  () => selectedAppKey.value || defaultApplicationKey.value || DEFAULT_APP_KEY,
);
const application = computed(() =>
  platformStore.applications.find(
    (item) => item.key === effectiveApplicationKey.value,
  ),
);
const availableApplicationKeys = computed(() =>
  availableApplications.value.map((item) => item.key),
);
const allAvailableApplicationKeys = computed(() =>
  platformStore.applications
    .filter((item) => item.visible && item.capabilityCode)
    .map((item) => item.key),
);
const activeModePrimaryTools = computed(
  () => activeDesignMode.value.primaryTools ?? [],
);
const primaryApplicationKeySet = computed(
  () => new Set(activeModePrimaryTools.value.map((tool) => tool.appKey)),
);
const modeOverflowApplications = computed(() =>
  availableApplications.value.filter(
    (item) => !primaryApplicationKeySet.value.has(item.key),
  ),
);
const selectedBusinessTool = computed(() =>
  activeModePrimaryTools.value.find(
    (tool) => tool.key === selectedBusinessToolKey.value,
  ),
);
const composerPlaceholder = computed(
  () =>
    selectedBusinessTool.value?.placeholder ??
    activeDesignMode.value.placeholder,
);
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
const composerImageFields = computed(() =>
  orderedImageMediaFields(mediaFields.value),
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
  scalarFields.value.filter(
    (field) =>
      field.key !== promptField.value?.key &&
      !field.advanced &&
      ['boolean', 'number', 'select', 'text'].includes(field.type),
  ),
);
const markdownAssets = computed(() =>
  platformStore.currentAssets.filter(
    (asset) =>
      asset.type === 'text' &&
      (asset.mimeType?.toLowerCase() === 'text/markdown' ||
        /(?:^|[./])md$/i.test(asset.format) ||
        /\.md$/i.test(asset.name)),
  ),
);
const selectedAssetIds = computed(() =>
  mediaFields.value.flatMap((field) => {
    if (field.assetIndex === undefined) return [];
    const id = selectedAssets[field.assetIndex];
    return id ? [id] : [];
  }),
);
const composerInputs = computed(() =>
  composerImageFields.value.flatMap((field) => {
    if (field.assetIndex === undefined) return [];
    const assetId = selectedAssets[field.assetIndex];
    const asset = platformStore.currentAssets.find(
      (item) => item.id === assetId,
    );
    return asset ? [{ asset, field }] : [];
  }),
);
const composerMediaProgress = computed(() =>
  mediaInputProgress(mediaFields.value, selectedAssets),
);
const composerCanAddMedia = computed(
  () =>
    composerMediaProgress.value.filled < composerMediaProgress.value.capacity,
);
const cameraPreviewUrl = computed(() => {
  const source = composerInputs.value.find(
    ({ asset }) => asset.type === 'image',
  );
  return source ? (composerPreviewUrls[source.asset.id] ?? '') : '';
});
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
const welcomeSuggestions = [
  '梳理一份轨道客室空间设计方案',
  '分析当前项目资产可以支持哪些设计方向',
  '给出客室色彩、材料与照明的组合建议',
];

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

function assetFolderPath(folderId: string) {
  const names: string[] = [];
  const visited = new Set<string>();
  let current = platformStore.assetFolders.find((item) => item.id === folderId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId
      ? platformStore.assetFolders.find((item) => item.id === current?.parentId)
      : undefined;
  }
  return names.join(' / ');
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

function setQuickFieldValue(field: CapabilityField, value: unknown) {
  if (field.type === 'number') {
    setFieldNumberValue(field, value as null | number | string);
    return;
  }
  setFieldValue(field, value);
}

async function loadComposerPreview(assetId: string) {
  if (composerPreviewUrls[assetId]) return;
  const asset = platformStore.currentAssets.find((item) => item.id === assetId);
  if (asset?.type !== 'image') return;
  try {
    const preview = await getAssetPreviewApi(assetId);
    if (preview.mode === 'url') composerPreviewUrls[assetId] = preview.url;
  } catch {
    // 预览失败不影响素材提交，仍显示资产名称和类型图标。
  }
}

function openMediaPicker() {
  if (mediaFields.value.length === 0 && !promptField.value) {
    message.info('当前应用不需要输入素材');
    return;
  }
  mediaPickerOpen.value = true;
}

function replaceSelectedAssets(nextSelections: Record<number, string>) {
  for (const key of Object.keys(selectedAssets)) {
    Reflect.deleteProperty(selectedAssets, key);
  }
  Object.assign(selectedAssets, nextSelections);
}

function showComposerMediaProgress() {
  const progress = composerMediaProgress.value;
  if (progress.missingRequired > 0) {
    message.info(
      `已上传 ${progress.filled}/${progress.capacity} 张，还需上传 ${progress.missingRequired} 张`,
    );
    return;
  }
  message.success(
    progress.required === progress.capacity
      ? `已完成 ${progress.filled}/${progress.capacity} 张图片输入`
      : `必填图片已完成，当前 ${progress.filled}/${progress.capacity} 张`,
  );
}

async function addComposerAssetIds(assetIds: string[]) {
  const result = assignMediaAssetIds(
    mediaFields.value,
    selectedAssets,
    assetIds,
  );
  replaceSelectedAssets(result.nextSelections);
  composerAssetPickerOpen.value = false;
  await saveDraftNow();
  if (result.discardedCount > 0) {
    message.warning(
      `当前工作流最多需要 ${composerMediaProgress.value.capacity} 张图片，超出部分未加入`,
    );
  } else if (result.duplicateCount > 0) {
    message.warning('已忽略重复选择的图片');
  }
  if (result.acceptedAssetIds.length > 0) showComposerMediaProgress();
}

function chooseComposerLocalFiles() {
  composerSourcePickerOpen.value = false;
  composerFileInputRef.value?.click();
}

function chooseComposerProjectAssets() {
  composerSourcePickerOpen.value = false;
  composerAssetPickerOpen.value = true;
}

async function uploadComposerFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const selectedFiles = [...(input.files ?? [])].filter((file) =>
    file.type.startsWith('image/'),
  );
  input.value = '';
  if (selectedFiles.length === 0) {
    message.warning('请选择图片文件');
    return;
  }
  const emptyFields = composerImageFields.value.filter(
    (field) =>
      field.assetIndex !== undefined && !selectedAssets[field.assetIndex],
  );
  const retainedFiles = selectedFiles.slice(0, emptyFields.length);
  const discardedCount = selectedFiles.length - retainedFiles.length;
  if (retainedFiles.length === 0) {
    message.warning(
      `当前工作流最多需要 ${composerMediaProgress.value.capacity} 张图片`,
    );
    return;
  }
  composerUploading.value = true;
  let uploadedCount = 0;
  try {
    for (const [index, file] of retainedFiles.entries()) {
      const field = emptyFields[index];
      if (!field) break;
      await uploadMedia(field, file, { silent: true });
      uploadedCount += 1;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '图片上传失败');
  } finally {
    composerUploading.value = false;
  }
  if (discardedCount > 0) {
    message.warning(
      `本次选择 ${selectedFiles.length} 张，当前工作流仅剩 ${retainedFiles.length} 个位置，已只保留前 ${retainedFiles.length} 张`,
    );
  }
  if (uploadedCount > 0) showComposerMediaProgress();
}

async function moveComposerInput(field: CapabilityField, direction: -1 | 1) {
  if (field.assetIndex === undefined) return;
  const nextSelections = moveMediaAsset(
    mediaFields.value,
    selectedAssets,
    field.assetIndex,
    direction,
  );
  if (!nextSelections) return;
  replaceSelectedAssets(nextSelections);
  await saveDraftNow();
}

function composerInputPosition(field: CapabilityField) {
  return composerInputs.value.findIndex((item) => item.field.key === field.key);
}

function openComposerMask(field: CapabilityField, assetName: string) {
  if (field.assetIndex === undefined) return;
  const assetId = selectedAssets[field.assetIndex];
  const source = assetId ? composerPreviewUrls[assetId] : undefined;
  if (!source) {
    message.warning('图片预览尚未加载，请稍后重试');
    return;
  }
  composerMaskField.value = field;
  composerMaskSource.value = source;
  composerMaskTitle.value = assetName;
  composerMaskEditorOpen.value = true;
}

async function saveComposerMask(file: File) {
  const field = composerMaskField.value;
  if (!field) throw new Error('当前没有可编辑的输入图片');
  await saveInputMask(field, file);
}

async function loadMarkdownAsset(assetId: string) {
  const field = promptField.value;
  if (!field) return;
  try {
    const asset =
      markdownAssets.value.find((item) => item.id === assetId) ??
      (await getAssetApi(assetId));
    if (
      asset.projectId !== platformStore.currentProjectId ||
      asset.type !== 'text' ||
      asset.mimeType !== 'text/markdown'
    ) {
      message.warning('请选择当前项目中的 Markdown 文本资产');
      return;
    }
    const result = await getAssetDownloadApi(assetId);
    let rawContent: string;
    if (result.mode === 'inline') {
      rawContent = result.content;
    } else {
      const response = await fetch(result.url);
      rawContent = await response.text();
    }
    const imported = markdownTextContent(rawContent);
    if (!imported) {
      message.warning('该 Markdown 资产没有可读取的文本内容');
      return;
    }
    const next = appendTextInput(
      parameterValues[field.key],
      imported,
      field.maxLength,
    );
    setFieldValue(field, next.value);
    markdownPickerOpen.value = false;
    mediaPickerOpen.value = false;
    message.success(
      next.truncated
        ? 'Markdown 文本已加载，超出输入长度的内容已截断'
        : 'Markdown 文本已加载到输入框',
    );
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '读取 Markdown 资产失败',
    );
  }
}

async function removeSelectedAsset(field: CapabilityField) {
  if (field.assetIndex === undefined) return;
  Reflect.deleteProperty(selectedAssets, field.assetIndex);
  if (field.type === 'region') parameterValues[field.key] = '';
  await saveDraftNow();
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

async function loadCapability(appKey = effectiveApplicationKey.value) {
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
      effectiveApplicationKey.value !== appKey ||
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

async function scrollToLatestRound() {
  const conversationId = activeConversationId.value;
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  const container = threadScrollRef.value;
  if (container) container.scrollTop = container.scrollHeight;
  window.setTimeout(() => {
    if (activeConversationId.value !== conversationId) return;
    const currentContainer = threadScrollRef.value;
    if (currentContainer) {
      currentContainer.scrollTop = currentContainer.scrollHeight;
    }
  }, 240);
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
    regularConversations.value.find((item) => item.id === requestedId) ??
    regularConversations.value[0];
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
    if (conversationId) {
      await loadCapability();
      await scrollToLatestRound();
    }
    return;
  }
  await saveDraftNow();
  selectedModeCardKey.value = null;
  selectedBusinessToolKey.value = '';
  activeConversationId.value = conversationId;
  const availablePreferredApp =
    preferredAppKey &&
    platformStore.applications.some(
      (item) => item.key === preferredAppKey && item.visible,
    )
      ? preferredAppKey
      : undefined;
  if (availablePreferredApp) {
    selectedModeKey.value = designModeForApplication(
      availablePreferredApp,
      selectedModeKey.value,
    ).key;
  }
  selectedAppKey.value = availablePreferredApp ?? '';
  await router.replace({ query: { conversationId } });
  await loadCapability();
  void hydrateTimelineCapabilities();
  await scrollToLatestRound();
}

async function chooseApplication(appKey: string, businessToolKey = '') {
  if (appKey === selectedAppKey.value && capability.value) {
    selectedBusinessToolKey.value = businessToolKey;
    return;
  }
  await saveDraftNow();
  selectedModeKey.value = designModeForApplication(
    appKey,
    selectedModeKey.value,
  ).key;
  selectedBusinessToolKey.value = businessToolKey;
  selectedAppKey.value = appKey;
  await loadCapability(appKey);
}

async function choosePrimaryTool(tool: DesignModeToolDefinition) {
  if (!availableApplicationKeys.value.includes(tool.appKey)) {
    message.info(`${tool.label}能力未配置或当前账号不可用`);
    return;
  }
  await chooseApplication(tool.appKey, tool.key);
}

async function chooseDesignMode(modeKey: DesignModeKey) {
  const mode = getDesignMode(modeKey);
  if (mode.standalonePath) {
    await router.push(mode.standalonePath);
    return;
  }
  const applications = applicationsForDesignMode(
    platformStore.applications,
    mode,
  );
  if (applications.length === 0) {
    message.info(`${mode.label}的执行服务与能力契约尚未接入`);
    return;
  }
  selectedModeCardKey.value = modeKey;
  if (modeKey === selectedModeKey.value && !selectedAppKey.value) return;
  await saveDraftNow();
  selectedModeKey.value = modeKey;
  selectedBusinessToolKey.value = '';
  const preferredKey = mode.defaultApplicationKey ?? DEFAULT_APP_KEY;
  const nextKey =
    applications.find((item) => item.key === preferredKey)?.key ??
    applications[0]?.key;
  if (!nextKey) return;
  selectedAppKey.value = '';
  await loadCapability(nextKey);
}

function applyPromptTemplate(values: string[]) {
  const field = promptField.value;
  if (!field) {
    message.warning('当前应用没有可填写的提示词');
    return;
  }
  const next = appendTextInput(
    parameterValues[field.key],
    values.join('，'),
    field.maxLength,
  );
  setFieldValue(field, next.value);
  if (next.truncated) message.warning('部分模板内容因长度限制已截断');
}

async function clearApplicationSelection() {
  if (!selectedAppKey.value) return;
  await saveDraftNow();
  selectedAppKey.value = '';
  selectedBusinessToolKey.value = '';
  await loadCapability();
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
        const next = regularConversations.value[0];
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

async function prepareRegionAnnotations() {
  return createRegionInputAnnotations({
    fields: mediaFields.value,
    parameterValues,
    async resolvePreviewUrl(assetId) {
      const preview = await getAssetPreviewApi(assetId);
      if (preview.mode !== 'url') throw new Error('分区底图没有可用预览');
      return preview.url;
    },
    async saveAnnotation({ file, originalAssetId }) {
      return platformStore.uploadAsset({
        description: `${capability.value?.name ?? application.value?.name} 分区标记输入快照`,
        derivedFromAssetId: originalAssetId,
        file,
        name: file.name.replace(/\.[^.]+$/, ''),
        tags: ['设计会话输入', '分区标记'],
        type: 'image',
      });
    },
    selectedAssets,
  });
}

async function clearSubmittedComposer() {
  hydratingDraft = true;
  try {
    if (promptField.value) parameterValues[promptField.value.key] = '';
    for (const key of Object.keys(selectedAssets)) {
      Reflect.deleteProperty(selectedAssets, key);
    }
    for (const field of mediaFields.value) {
      if (field.type === 'region') parameterValues[field.key] = '';
    }
  } finally {
    hydratingDraft = false;
  }
  await saveDraftNow();
}

async function runCapability() {
  if (!application.value || !capability.value || !activeConversationId.value) {
    return;
  }
  if (composerMediaProgress.value.missingRequired > 0) {
    const progress = composerMediaProgress.value;
    message.warning(
      `当前工作流需要 ${progress.required} 张图片，已上传 ${progress.filled} 张，还需上传 ${progress.missingRequired} 张`,
    );
    return;
  }
  const missingAsset = mediaFields.value.find(
    (field) =>
      field.required &&
      !field.acceptedKinds.includes('image') &&
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
    const inputAnnotations = await prepareRegionAnnotations();
    const job = await platformStore.runApplication(
      application.value.key,
      {
        designConversationId: activeConversationId.value,
        designMode: selectedModeKey.value || undefined,
      },
      selectedAssetIds.value,
      taskParameters(),
      [],
      inputAnnotations,
    );
    if (job?.status === 'failed') {
      message.warning(job.error?.message ?? '能力服务执行失败');
    } else if (job) {
      await clearSubmittedComposer();
      await scrollToLatestRound();
      message.success('任务已提交，可以切换到其他设计会话继续工作');
    }
    await refreshConversations();
    void hydrateTimelineCapabilities();
  } finally {
    submitting.value = false;
  }
}

async function cancelActiveJob() {
  const job = activeJob.value;
  if (!job || job.status === 'cancelling') return;
  try {
    const result = await platformStore.cancelJob(job.id);
    message.success(
      result.status === 'cancelling' ? '正在停止本轮生成' : '本轮生成已停止',
    );
    await refreshConversations();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '停止任务失败');
  }
}

async function runJobSnapshot(
  job: PlatformJob,
  override?: { parameterKey: string; value: string },
) {
  if (activeJob.value) {
    message.warning('当前设计会话已有任务在运行，请等待完成或停止后再提交');
    return;
  }
  const unavailableInput = job.inputs.find(
    (input) =>
      !platformStore.currentAssets.some((asset) => asset.id === input.assetId),
  );
  if (unavailableInput) {
    message.error(
      `历史输入“${unavailableInput.name || unavailableInput.assetId}”已不可用，无法重新发送`,
    );
    return;
  }
  if (job.designMode) {
    selectedModeKey.value = job.designMode;
    selectedModeCardKey.value = job.designMode;
  }
  await chooseApplication(job.appKey);
  hydratingDraft = true;
  try {
    resetDraftState(capability.value ?? undefined);
    for (const [key, value] of Object.entries(job.parameters)) {
      parameterValues[key] = value;
    }
    if (override) parameterValues[override.parameterKey] = override.value;
    for (const input of job.inputs)
      selectedAssets[input.position] = input.assetId;
  } finally {
    hydratingDraft = false;
  }
  await saveDraftNow();
  await runCapability();
}

async function rerunJob(job: PlatformJob) {
  await runJobSnapshot(job);
}

async function editAndRerunJob(
  job: PlatformJob,
  parameterKey: string,
  value: string,
) {
  await runJobSnapshot(job, { parameterKey, value });
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
  if (output.saved) return;
  saveOutputTarget.value = output;
  saveOutputFolderId.value = undefined;
  saveOutputOpen.value = true;
}

async function confirmSaveOutput() {
  const output = saveOutputTarget.value;
  if (!output) return;
  saveOutputSubmitting.value = true;
  try {
    await platformStore.saveWorkflowOutput(
      output.assetId,
      saveOutputFolderId.value || undefined,
    );
    saveOutputOpen.value = false;
    message.success('生成结果已保存到所选资产目录');
  } finally {
    saveOutputSubmitting.value = false;
  }
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

function designModeForOutput(output: PlatformJobOutput) {
  const mode = conversationJobs.value.find((job) =>
    job.outputs.some((item) => item.assetId === output.assetId),
  )?.designMode;
  if (mode === 'cabin' || mode === 'cmf' || mode === 'component') return mode;
  return selectedModeKey.value === 'report' ? 'cabin' : selectedModeKey.value;
}

async function openOutputMask(output: PlatformJobOutput, previewUrl: string) {
  try {
    await ensureWorkflowOutputAsset(output);
    actionOutput.value = output;
    actionDesignMode.value = designModeForOutput(output);
    maskEditSourceAssetId.value = output.assetId;
    maskEditDerivedFromAssetId.value = output.assetId;
    outputMaskSource.value = previewUrl;
    outputMaskTitle.value = output.name;
    outputMaskEditorOpen.value = true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '无法进入局部重绘');
  }
}

function openInputMask(input: PlatformJobInput, previewUrl: string) {
  actionOutput.value = undefined;
  maskEditSourceAssetId.value = input.assetId;
  maskEditDerivedFromAssetId.value = input.assetId;
  outputMaskSource.value = previewUrl;
  outputMaskTitle.value = input.name || '本轮输入图片';
  outputMaskEditorOpen.value = true;
}

async function saveOutputMask(file: File) {
  if (!maskEditSourceAssetId.value) throw new Error('当前没有可编辑的图片');
  const maskAsset = await platformStore.uploadAsset({
    derivedFromAssetId: maskEditDerivedFromAssetId.value || undefined,
    description: '设计会话图片遮罩编辑',
    file,
    name: file.name.replace(/\.[^.]+$/, ''),
    tags: ['设计会话图片编辑', '遮罩'],
    type: 'image',
  });
  if (actionOutput.value) {
    selectedModeKey.value = actionDesignMode.value;
    selectedModeCardKey.value = actionDesignMode.value;
    await chooseApplication('inpaint-single');
    const maskField = mediaFields.value.find(
      (field) => field.type === 'mask' && field.assetIndex !== undefined,
    );
    if (!maskField) throw new Error('局部重绘能力缺少遮罩输入位');
    await selectAsset(maskField, maskAsset.id);
    message.success('遮罩已保存并填入“局部重绘”编辑框，请确认提示词后发送');
    return;
  }
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
    parameterDrawerOpen.value = false;
    mediaPickerOpen.value = false;
    message.success('结果已加入资产并填入当前会话的目标应用');
  } finally {
    continueSubmitting.value = false;
  }
}

async function ensureWorkflowOutputAsset(output: PlatformJobOutput) {
  if (output.saved) return;
  await platformStore.saveWorkflowOutput(output.assetId);
  output.saved = true;
}

async function prepareOutputInComposer(
  output: PlatformJobOutput,
  appKey: string,
  modeKey = designModeForOutput(output),
  businessToolKey = '',
) {
  await ensureWorkflowOutputAsset(output);
  selectedModeKey.value = modeKey;
  selectedModeCardKey.value = modeKey;
  await chooseApplication(appKey, businessToolKey);
  const target = mediaFields.value.find(
    (field) =>
      field.assetIndex !== undefined && field.acceptedKinds.includes('image'),
  );
  if (!target) throw new Error('目标能力没有可接收图像的输入位');
  await selectAsset(target, output.assetId);
  parameterDrawerOpen.value = false;
  mediaPickerOpen.value = false;
  await nextTick();
  return target;
}

async function understandOutput(
  output: PlatformJobOutput,
  mode: Exclude<DesignModeKey, 'report'>,
) {
  try {
    await prepareOutputInComposer(output, 'image-understanding', mode);
    message.success('图片已填入“图像理解”编辑框，请确认提示词后再发送');
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '无法将图片填入图像理解编辑框',
    );
  }
}

function openMultiImage(
  output: PlatformJobOutput,
  mode: Exclude<DesignModeKey, 'report'>,
) {
  cmfMultiImageOutput.value = output;
  cmfMultiImageDesignMode.value = mode;
  cmfMultiImageMode.value = 'choose';
  cmfMultiImagePrompt.value = '';
  cmfMultiImageFiles.value = [];
  cmfMultiImageOpen.value = true;
}

async function transferCmfMultiImageToComposer() {
  const output = cmfMultiImageOutput.value;
  if (!output) return;
  cmfMultiImageSubmitting.value = true;
  try {
    await prepareOutputInComposer(
      output,
      'multi-image-edit',
      cmfMultiImageDesignMode.value,
    );
    cmfMultiImageOpen.value = false;
    message.success('图片已填入“多图融合”编辑框，请继续添加参考图和提示词');
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '无法进入多图融合编辑框',
    );
  } finally {
    cmfMultiImageSubmitting.value = false;
  }
}

function selectCmfMultiImageFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])].filter((file) =>
    file.type.startsWith('image/'),
  );
  cmfMultiImageFiles.value = files.slice(0, 2);
  if (files.length > 2) message.info('当前融合工作流最多接收两张额外参考图');
  input.value = '';
}

async function runCmfMultiImageDialog() {
  const output = cmfMultiImageOutput.value;
  const prompt = cmfMultiImagePrompt.value.trim();
  if (!output || cmfMultiImageFiles.value.length !== 2 || !prompt) {
    message.warning('请上传两张参考图并填写融合提示词');
    return;
  }
  cmfMultiImageSubmitting.value = true;
  try {
    await prepareOutputInComposer(
      output,
      'multi-image-edit',
      cmfMultiImageDesignMode.value,
    );
    const referenceFields = mediaFields.value
      .filter(
        (field) =>
          field.assetIndex !== undefined &&
          field.assetIndex > 0 &&
          field.acceptedKinds.includes('image'),
      )
      .toSorted(
        (left, right) => (left.assetIndex ?? 0) - (right.assetIndex ?? 0),
      );
    if (referenceFields.length < 2) {
      throw new Error('多图融合能力的参考图输入契约不完整');
    }
    for (const [index, file] of cmfMultiImageFiles.value.entries()) {
      const field = referenceFields[index];
      if (!field) continue;
      await uploadMedia(field, file, {
        silent: true,
        tags: ['设计会话输入', `${activeDesignMode.value.label}多图融合`],
      });
    }
    if (!promptField.value) throw new Error('多图融合能力缺少提示词输入');
    setFieldValue(promptField.value, prompt);
    await saveDraftNow();
    cmfMultiImageOpen.value = false;
    await runCapability();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '多图融合提交失败');
  } finally {
    cmfMultiImageSubmitting.value = false;
  }
}

function openUpscale(
  output: PlatformJobOutput,
  mode: Exclude<DesignModeKey, 'report'>,
) {
  cmfUpscaleOutput.value = output;
  cmfUpscaleDesignMode.value = mode;
  cmfUpscaleFactor.value = 4;
  cmfUpscaleOpen.value = true;
}

async function runCmfUpscale() {
  const output = cmfUpscaleOutput.value;
  if (!output) return;
  cmfUpscaleSubmitting.value = true;
  try {
    await prepareOutputInComposer(
      output,
      'image-upscale',
      cmfUpscaleDesignMode.value,
    );
    const factorField = scalarFields.value.find(
      (field) => field.key === 'upscaleFactor',
    );
    if (!factorField) throw new Error('图像放大能力缺少倍率参数');
    setFieldValue(factorField, cmfUpscaleFactor.value);
    await saveDraftNow();
    cmfUpscaleOpen.value = false;
    await runCapability();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '图像放大提交失败');
  } finally {
    cmfUpscaleSubmitting.value = false;
  }
}

async function markOutput(
  output: PlatformJobOutput,
  mode: 'cabin' | 'component',
) {
  try {
    await prepareOutputInComposer(output, 'region-marker-edit', mode);
    mediaPickerOpen.value = true;
    await nextTick();
    markerEditorRequest.value += 1;
    message.success('图片已进入标记编辑器，请完成区域标记和修改指令');
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '无法进入标记编辑器',
    );
  }
}

async function changeEnvironment(output: PlatformJobOutput) {
  try {
    await prepareOutputInComposer(
      output,
      'single-image-edit',
      'cabin',
      'environment-change',
    );
    message.success('图片已填入“环境更改”编辑框，请选择环境模板并确认后发送');
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '无法进入环境更改编辑框',
    );
  }
}

function openMultiAngle(
  output: PlatformJobOutput,
  mode: 'cabin' | 'component',
) {
  multiAngleOutput.value = output;
  multiAngleDesignMode.value = mode;
  multiAngleMode.value = 'choose';
  multiAngleFile.value = undefined;
  multiAngleOpen.value = true;
}

function selectMultiAngleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = [...(input.files ?? [])].find((item) =>
    item.type.startsWith('image/'),
  );
  multiAngleFile.value = file;
  input.value = '';
}

async function transferMultiAngleToComposer() {
  const output = multiAngleOutput.value;
  if (!output) return;
  multiAngleSubmitting.value = true;
  try {
    await prepareOutputInComposer(
      output,
      'camera-control-multi',
      multiAngleDesignMode.value,
    );
    multiAngleOpen.value = false;
    message.success('图片已填入“多角度生成”编辑框，请确认参数后发送');
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '无法进入多角度生成编辑框',
    );
  } finally {
    multiAngleSubmitting.value = false;
  }
}

async function runMultiAngleDialog() {
  const output = multiAngleOutput.value;
  if (!output) return;
  multiAngleSubmitting.value = true;
  try {
    const sourceField = await prepareOutputInComposer(
      output,
      'camera-control-multi',
      multiAngleDesignMode.value,
    );
    if (multiAngleFile.value) {
      await uploadMedia(sourceField, multiAngleFile.value, {
        silent: true,
        tags: ['设计会话输入', '多角度生成'],
      });
    }
    await saveDraftNow();
    multiAngleOpen.value = false;
    await runCapability();
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '多角度生成提交失败',
    );
  } finally {
    multiAngleSubmitting.value = false;
  }
}

function openThreeD(output: PlatformJobOutput) {
  threeDOutput.value = output;
  threeDMode.value = 'choose';
  threeDFiles.value = [];
  threeDOpen.value = true;
}

function selectThreeDFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])].filter((item) =>
    item.type.startsWith('image/'),
  );
  threeDFiles.value = files.slice(0, 3);
  if (files.length > 3) message.info('三维生成只需补充左、后、右三张视图');
  input.value = '';
}

async function transferThreeDToComposer() {
  const output = threeDOutput.value;
  if (!output) return;
  threeDSubmitting.value = true;
  try {
    await prepareOutputInComposer(output, 'multiview-to-3d', 'component');
    threeDOpen.value = false;
    message.success('当前图片已作为正视图，请继续补充左、后、右三张视图');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '无法进入三维生成');
  } finally {
    threeDSubmitting.value = false;
  }
}

async function runThreeDDialog() {
  const output = threeDOutput.value;
  if (!output || threeDFiles.value.length !== 3) {
    message.warning('请补充左、后、右三张视图');
    return;
  }
  threeDSubmitting.value = true;
  try {
    await prepareOutputInComposer(output, 'multiview-to-3d', 'component');
    const viewFields = mediaFields.value
      .filter(
        (field) =>
          field.assetIndex !== undefined &&
          field.assetIndex > 0 &&
          field.acceptedKinds.includes('image'),
      )
      .toSorted(
        (left, right) => (left.assetIndex ?? 0) - (right.assetIndex ?? 0),
      );
    if (viewFields.length < 3)
      throw new Error('三维生成能力缺少四视图输入契约');
    for (const [index, file] of threeDFiles.value.entries()) {
      const field = viewFields[index];
      if (!field) continue;
      await uploadMedia(field, file, {
        silent: true,
        tags: ['设计会话输入', '三维生成多视图'],
      });
    }
    await saveDraftNow();
    threeDOpen.value = false;
    await runCapability();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '三维生成提交失败');
  } finally {
    threeDSubmitting.value = false;
  }
}

function handleBusinessResultAction(
  action: BusinessResultAction,
  output: PlatformJobOutput,
  mode: Exclude<DesignModeKey, 'report'>,
) {
  if (action === 'multi-image') return openMultiImage(output, mode);
  if (action === 'upscale') return openUpscale(output, mode);
  if (action === 'understand') return void understandOutput(output, mode);
  if (action === 'mark' && mode !== 'cmf') return void markOutput(output, mode);
  if (action === 'environment' && mode === 'cabin') {
    return void changeEnvironment(output);
  }
  if (action === 'multi-angle' && mode !== 'cmf') {
    return openMultiAngle(output, mode);
  }
  if (action === 'three-d' && mode === 'component') return openThreeD(output);
}

async function useWelcomeSuggestion(value: string) {
  const textApp = availableApplications.value.find(
    (item) => item.key === DEFAULT_APP_KEY,
  );
  if (textApp && effectiveApplicationKey.value !== textApp.key) {
    await chooseApplication(textApp.key);
  }
  const field = promptField.value;
  if (!field) return;
  setFieldValue(field, value);
}

async function switchProject(projectId: string) {
  if (projectId === platformStore.currentProjectId) return;
  await saveDraftNow();
  await platformStore.switchProject(projectId);
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

onMounted(async () => {
  loading.value = true;
  try {
    await platformStore.initialize();
    await ensureConversation();
    pageReady = true;
  } finally {
    loading.value = false;
  }
});
watch(
  () => platformStore.currentProjectId,
  async () => {
    if (!pageReady) return;
    loading.value = true;
    activeConversationId.value = '';
    try {
      await ensureConversation();
    } finally {
      loading.value = false;
    }
  },
);
watch(activeJob, (job) => (job ? startPolling() : stopPolling()), {
  immediate: true,
});
watch(continueAppKey, (appKey) => {
  if (continueOpen.value && appKey) void loadContinueCapability(appKey);
});
watch(
  () => composerInputs.value.map((item) => item.asset.id).join('|'),
  () => {
    for (const { asset } of composerInputs.value) {
      void loadComposerPreview(asset.id);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  stopPolling();
  if (draftTimer) clearTimeout(draftTimer);
  void saveDraftNow();
});
</script>

<template>
  <main :class="{ 'sidebar-collapsed': sidebarCollapsed }" class="design-page">
    <aside class="conversation-sidebar">
      <div class="conversation-sidebar__heading">
        <span>任务栏</span>
        <small>{{ activeConversation?.title ?? '新设计会话' }}</small>
      </div>
      <Select
        :options="projectOptions"
        :value="platformStore.currentProjectId"
        class="project-select"
        placeholder="选择项目"
        @change="(value) => switchProject(String(value))"
      />
      <Button
        block
        data-testid="design-new-conversation"
        type="primary"
        @click="createConversation"
      >
        <IconifyIcon icon="lucide:square-pen" />
        新建会话
      </Button>
      <Input
        v-model:value="conversationSearch"
        allow-clear
        class="conversation-search"
        placeholder="搜索会话"
      >
        <template #prefix>
          <IconifyIcon icon="lucide:search" />
        </template>
      </Input>
      <div class="conversation-list-heading">
        <span>历史会话</span>
        <small>{{ regularConversations.length }}</small>
      </div>
      <div class="conversation-list">
        <div
          v-for="item in visibleConversations"
          :key="item.id"
          :class="{ active: item.id === activeConversationId }"
          :data-conversation-id="item.id"
          class="conversation-item"
          role="button"
          tabindex="0"
          @click="selectConversation(item.id)"
          @keydown.enter="selectConversation(item.id)"
          @keydown.space.prevent="selectConversation(item.id)"
        >
          <span class="conversation-item__icon">
            <IconifyIcon icon="lucide:message-circle" />
          </span>
          <span class="conversation-item__body">
            <strong>{{ item.title }}</strong>
            <small>
              {{ item.roundCount }} 轮 ·
              {{ formatConversationTime(item.updatedAt) }}
            </small>
          </span>
          <span class="conversation-item__tail">
            <i v-if="item.activeJobCount" title="任务运行中"></i>
            <span
              v-if="item.id === activeConversationId"
              class="conversation-actions"
            >
              <button
                aria-label="重命名当前会话"
                title="重命名"
                type="button"
                @click.stop="openRename"
              >
                <IconifyIcon icon="lucide:pencil" />
              </button>
              <button
                aria-label="删除当前会话"
                title="删除"
                type="button"
                @click.stop="archiveConversation(item)"
              >
                <IconifyIcon icon="lucide:trash-2" />
              </button>
            </span>
          </span>
        </div>
        <div
          v-if="visibleConversations.length === 0"
          class="conversation-empty"
        >
          {{ conversationSearch ? '没有匹配的会话' : '还没有设计会话' }}
        </div>
      </div>
    </aside>

    <button
      :aria-label="sidebarCollapsed ? '展开任务栏' : '收起任务栏'"
      class="conversation-sidebar-toggle"
      data-testid="conversation-sidebar-toggle"
      :title="sidebarCollapsed ? '展开任务栏' : '收起任务栏'"
      type="button"
      @click="sidebarCollapsed = !sidebarCollapsed"
    >
      <IconifyIcon
        :icon="
          sidebarCollapsed ? 'lucide:chevron-right' : 'lucide:chevron-left'
        "
      />
    </button>

    <section class="design-thread">
      <div ref="threadScrollRef" class="thread-scroll">
        <Spin :spinning="loading">
          <div v-if="conversationJobs.length" class="thread-timeline">
            <WorkflowRunCard
              v-for="(job, index) in conversationJobs"
              :key="job.id"
              :accent="jobApplication(job)?.color ?? '#b91c32'"
              :available-application-keys="allAvailableApplicationKeys"
              :fields="jobCapability(job)?.fields ?? []"
              flow-label="深化设计"
              :job="job"
              :round="index + 1"
              :supports-image-comparison="
                jobCapability(job)?.supportsImageComparison ?? false
              "
              @business-action="handleBusinessResultAction"
              @download="downloadOutput"
              @edit-rerun="editAndRerunJob"
              @edit-input="openInputMask"
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
              {{ activeDesignMode.description }}
              选择下方真实可用的设计能力后，结果会登记到当前项目并保留完整任务血缘。
            </p>
            <div class="welcome-suggestions">
              <button
                v-for="suggestion in welcomeSuggestions"
                :key="suggestion"
                type="button"
                @click="useWelcomeSuggestion(suggestion)"
              >
                {{ suggestion }}
                <IconifyIcon icon="lucide:arrow-up-right" />
              </button>
            </div>
          </div>
        </Spin>
      </div>

      <footer class="design-composer" data-testid="design-composer">
        <div
          class="composer-box"
          :data-application-count="availableApplications.length"
          :data-effective-app-key="effectiveApplicationKey"
          :style="{ '--app-accent': application?.color }"
        >
          <section
            v-if="composerImageFields.length"
            class="composer-media-tray"
            data-testid="composer-media-tray"
          >
            <div
              class="composer-input-assets"
              data-testid="composer-input-assets"
            >
              <article
                v-for="item in composerInputs"
                :key="`${item.field.key}:${item.asset.id}`"
                class="composer-input-asset"
              >
                <button
                  :aria-label="`遮罩编辑：${item.asset.name}`"
                  class="composer-input-asset__preview"
                  title="点击进入遮罩编辑"
                  type="button"
                  @click="openComposerMask(item.field, item.asset.name)"
                >
                  <img
                    v-if="composerPreviewUrls[item.asset.id]"
                    :alt="item.asset.name"
                    :src="composerPreviewUrls[item.asset.id]"
                  />
                  <IconifyIcon v-else icon="lucide:file-image" />
                </button>
                <div class="composer-input-asset__move-actions">
                  <button
                    :aria-label="`左移${item.asset.name}`"
                    :disabled="composerInputPosition(item.field) === 0"
                    title="左移"
                    type="button"
                    @click="moveComposerInput(item.field, -1)"
                  >
                    <IconifyIcon icon="lucide:arrow-left" />
                  </button>
                  <button
                    :aria-label="`编辑${item.asset.name}`"
                    title="编辑遮罩"
                    type="button"
                    @click.stop="openComposerMask(item.field, item.asset.name)"
                  >
                    <IconifyIcon icon="lucide:paintbrush" />
                  </button>
                  <button
                    :aria-label="`右移${item.asset.name}`"
                    :disabled="
                      composerInputPosition(item.field) ===
                      composerInputs.length - 1
                    "
                    title="右移"
                    type="button"
                    @click="moveComposerInput(item.field, 1)"
                  >
                    <IconifyIcon icon="lucide:arrow-right" />
                  </button>
                </div>
                <button
                  :aria-label="`移除${item.asset.name}`"
                  class="composer-input-asset__remove"
                  title="移除"
                  type="button"
                  @click="removeSelectedAsset(item.field)"
                >
                  <IconifyIcon icon="lucide:x" />
                </button>
              </article>

              <Popover
                v-if="composerCanAddMedia"
                v-model:open="composerSourcePickerOpen"
                placement="topLeft"
                trigger="click"
              >
                <template #content>
                  <div class="composer-media-source-menu">
                    <button type="button" @click="chooseComposerLocalFiles">
                      <IconifyIcon icon="lucide:upload" />
                      <span>
                        <strong>本地上传</strong>
                        <small>可一次选择多张图片</small>
                      </span>
                    </button>
                    <button type="button" @click="chooseComposerProjectAssets">
                      <IconifyIcon :icon="platformSemanticIcons.assets" />
                      <span>
                        <strong>从资产中心选择</strong>
                        <small>支持多选当前项目图片</small>
                      </span>
                    </button>
                  </div>
                </template>
                <button
                  aria-label="添加输入图片"
                  :disabled="composerUploading"
                  class="composer-input-asset__add"
                  data-testid="composer-add-image"
                  type="button"
                >
                  <IconifyIcon
                    :icon="
                      composerUploading ? 'lucide:loader-circle' : 'lucide:plus'
                    "
                  />
                  <span>{{ composerUploading ? '上传中' : '添加图片' }}</span>
                </button>
              </Popover>
            </div>
            <input
              ref="composerFileInputRef"
              accept="image/*"
              hidden
              multiple
              type="file"
              @change="uploadComposerFiles"
            />
          </section>
          <Textarea
            v-if="promptField"
            :auto-size="{ minRows: 2, maxRows: 8 }"
            :value="fieldTextValue(promptField)"
            :maxlength="promptField.maxLength"
            :placeholder="composerPlaceholder"
            data-testid="design-prompt-input"
            @update:value="setFieldValue(promptField, $event)"
            @press-enter="
              !$event.shiftKey && (runCapability(), $event.preventDefault())
            "
          />
          <div v-else class="composer-no-prompt">
            该应用主要使用图片或结构化参数，请添加素材或打开“更多”完成输入。
          </div>
          <div class="composer-bottom">
            <div class="composer-toolbar">
              <template v-if="selectedAppKey">
                <span
                  class="selected-application-chip"
                  data-testid="active-design-application"
                >
                  <span>
                    <IconifyIcon
                      :icon="application?.icon ?? 'lucide:message-circle'"
                    />
                    {{
                      selectedBusinessTool?.label ??
                      application?.shortName ??
                      application?.name ??
                      '选择应用'
                    }}
                  </span>
                  <button
                    aria-label="取消选择当前应用"
                    title="取消选择当前应用"
                    type="button"
                    @click="clearApplicationSelection"
                  >
                    <IconifyIcon icon="lucide:x" />
                  </button>
                </span>
                <DesignPromptTemplatePopover
                  v-if="selectedBusinessTool?.templateCategoryIds"
                  :category-ids="selectedBusinessTool.templateCategoryIds"
                  :mode="promptTemplateMode"
                  @apply="applyPromptTemplate"
                />
                <div class="parameter-chips">
                  <div class="parameter-chips__scroll">
                    <DesignQuickField
                      v-for="field in compactFields"
                      :key="field.key"
                      :field="field"
                      :value="parameterValues[field.key]"
                      @change="setQuickFieldValue(field, $event)"
                    />
                    <button
                      v-if="mediaFields.length"
                      class="composer-media-summary"
                      type="button"
                      @click="openMediaPicker"
                    >
                      <IconifyIcon icon="lucide:paperclip" />
                      素材
                      <strong>
                        {{ selectedAssetIds.length }}/{{ mediaFields.length }}
                      </strong>
                    </button>
                  </div>
                  <button
                    class="composer-more-button"
                    data-testid="open-design-parameters"
                    type="button"
                    @click="parameterDrawerOpen = true"
                  >
                    <IconifyIcon icon="lucide:ellipsis" />
                    更多
                  </button>
                </div>
              </template>

              <div
                v-else
                aria-label="设计应用"
                class="composer-application-shortcuts"
                :class="{
                  'composer-application-shortcuts--business':
                    activeModePrimaryTools.length > 0,
                }"
                :data-application-count="availableApplications.length"
              >
                <template v-if="activeModePrimaryTools.length">
                  <div class="primary-tool-scroll">
                    <button
                      v-for="tool in activeModePrimaryTools"
                      :key="tool.key"
                      :data-app-key="tool.appKey"
                      :data-tool-key="tool.key"
                      :disabled="
                        !availableApplicationKeys.includes(tool.appKey)
                      "
                      :title="
                        availableApplicationKeys.includes(tool.appKey)
                          ? tool.label
                          : `${tool.label}能力未配置或不可用`
                      "
                      type="button"
                      @click="choosePrimaryTool(tool)"
                    >
                      <IconifyIcon :icon="tool.icon" />
                      {{ tool.label }}
                    </button>
                  </div>
                  <div class="primary-tool-fixed">
                    <DesignPromptTemplatePopover
                      :mode="promptTemplateMode"
                      @apply="applyPromptTemplate"
                    />
                    <Popover placement="topLeft" trigger="click">
                      <template #content>
                        <div class="more-applications-grid">
                          <button
                            v-for="item in modeOverflowApplications"
                            :key="item.key"
                            :data-app-key="item.key"
                            type="button"
                            @click="chooseApplication(item.key)"
                          >
                            <IconifyIcon :icon="item.icon" />
                            <span>
                              <strong>{{ item.shortName }}</strong>
                              <small>{{ item.description }}</small>
                            </span>
                          </button>
                          <span
                            v-if="modeOverflowApplications.length === 0"
                            class="more-applications-empty"
                          >
                            暂无更多能力
                          </span>
                        </div>
                      </template>
                      <button
                        data-testid="more-design-applications"
                        title="查看更多应用"
                        type="button"
                      >
                        <IconifyIcon icon="lucide:grid-2x2" />
                        更多
                      </button>
                    </Popover>
                  </div>
                </template>
                <Popover
                  v-if="
                    !activeModePrimaryTools.length &&
                    modeOverflowApplications.length
                  "
                  placement="topLeft"
                  trigger="click"
                >
                  <template #content>
                    <div class="more-applications-grid">
                      <button
                        v-for="item in modeOverflowApplications"
                        :key="item.key"
                        :data-app-key="item.key"
                        type="button"
                        @click="chooseApplication(item.key)"
                      >
                        <IconifyIcon :icon="item.icon" />
                        <span>
                          <strong>{{ item.shortName }}</strong>
                          <small>{{ item.description }}</small>
                        </span>
                      </button>
                    </div>
                  </template>
                  <button
                    data-testid="more-design-applications"
                    title="查看更多应用"
                    type="button"
                  >
                    <IconifyIcon icon="lucide:grid-2x2" />
                    更多
                  </button>
                </Popover>
              </div>
            </div>
            <Button
              :aria-label="activeJob ? '停止生成' : '发送'"
              class="composer-submit"
              :class="{ 'composer-submit--stop': activeJob }"
              :disabled="
                !activeConversationId || activeJob?.status === 'cancelling'
              "
              :loading="submitting || activeJob?.status === 'cancelling'"
              shape="circle"
              type="primary"
              @click="activeJob ? cancelActiveJob() : runCapability()"
            >
              <span v-if="activeJob" class="composer-stop-mark"></span>
              <IconifyIcon v-else icon="lucide:arrow-up" />
            </Button>
          </div>
        </div>
        <nav aria-label="设计业务模式" class="design-mode-switcher">
          <button
            v-for="mode in designModes"
            :key="mode.key"
            :class="{
              active: mode.key === selectedModeCardKey,
              unavailable: !modeAvailability[mode.key],
            }"
            :data-unavailable="!modeAvailability[mode.key] || undefined"
            :aria-pressed="mode.key === selectedModeCardKey"
            :style="{
              backgroundImage: `linear-gradient(90deg, rgba(8, 17, 23, 0.96) 0%, rgba(8, 17, 23, 0.82) 48%, rgba(8, 17, 23, 0.18) 100%), url(${mode.backgroundImage})`,
            }"
            :title="
              modeAvailability[mode.key]
                ? mode.description
                : `${mode.label}执行服务待接入`
            "
            type="button"
            @click="chooseDesignMode(mode.key)"
          >
            <span class="design-mode-switcher__label">
              {{ mode.label }}
              <IconifyIcon icon="lucide:chevron-right" />
            </span>
            <small v-if="!modeAvailability[mode.key]">待接入</small>
          </button>
        </nav>
      </footer>
    </section>

    <Modal
      v-model:open="mediaPickerOpen"
      :footer="null"
      title="添加输入素材"
      width="min(780px, 94vw)"
    >
      <p class="media-picker-description">
        上传新素材、从当前项目资产中选择，或加载 Markdown
        文本；所选内容会立即显示在发送框中。
      </p>
      <button
        v-if="promptField"
        class="markdown-asset-entry"
        data-testid="open-markdown-asset-picker-from-media"
        type="button"
        @click="markdownPickerOpen = true"
      >
        <IconifyIcon icon="lucide:file-text" />
        <span>
          <strong>从资产加载 Markdown 文本</strong>
          <small>只提取 .md 文件中的文字，不加载文档内图片</small>
        </span>
        <em>{{ markdownAssets.length }} 个可用</em>
      </button>
      <div class="media-picker-fields">
        <CapabilityMediaField
          v-for="field in mediaFields"
          :key="field.key"
          accent="#c51f3a"
          :assets="platformStore.currentAssets"
          :field="field"
          :live-capture="(file) => runLiveCapture(field, file)"
          :open-editor-request="markerEditorRequest"
          :project-id="platformStore.currentProjectId"
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
      <div class="media-picker-footer">
        <Button type="primary" @click="mediaPickerOpen = false">完成</Button>
      </div>
    </Modal>

    <AssetPickerModal
      :accepted-kinds="['text']"
      :assets="markdownAssets"
      :open="markdownPickerOpen"
      :project-id="platformStore.currentProjectId"
      @select="loadMarkdownAsset"
      @update:open="markdownPickerOpen = $event"
    />

    <AssetPickerModal
      :accepted-kinds="['image']"
      :assets="platformStore.currentAssets"
      multiple
      :open="composerAssetPickerOpen"
      :project-id="platformStore.currentProjectId"
      :selected-asset-ids="[]"
      @select-multiple="addComposerAssetIds"
      @update:open="composerAssetPickerOpen = $event"
    />

    <Drawer
      v-model:open="parameterDrawerOpen"
      :title="`${application?.name ?? '应用'} · 参数与输入`"
      class="design-parameter-drawer"
      placement="right"
      width="min(520px, 94vw)"
    >
      <Spin :spinning="capabilityLoading">
        <div v-if="promptField" class="drawer-section">
          <h3>文本素材</h3>
          <button
            class="markdown-asset-entry"
            data-testid="open-markdown-asset-picker"
            type="button"
            @click="markdownPickerOpen = true"
          >
            <IconifyIcon icon="lucide:file-text" />
            <span>
              <strong>从资产加载 Markdown 文本</strong>
              <small>只提取文字并追加到当前编辑框</small>
            </span>
            <em>{{ markdownAssets.length }} 个可用</em>
          </button>
        </div>
        <div class="drawer-section" v-if="mediaFields.length">
          <h3>输入内容</h3>
          <CapabilityMediaField
            v-for="field in mediaFields"
            :key="field.key"
            :accent="application?.color ?? '#b91c32'"
            :assets="platformStore.currentAssets"
            :field="field"
            :live-capture="(file) => runLiveCapture(field, file)"
            :project-id="platformStore.currentProjectId"
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
            :preview-url="cameraPreviewUrl"
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
      v-model:open="saveOutputOpen"
      :confirm-loading="saveOutputSubmitting"
      ok-text="保存到此目录"
      title="加入资产中心"
      @ok="confirmSaveOutput"
    >
      <p class="continue-description">
        请选择当前项目中的资产目录。保存后，结果才能作为同一项目内其他设计能力的输入继续使用。
      </p>
      <Select
        v-model:value="saveOutputFolderId"
        :options="saveOutputFolderOptions"
        class="w-full"
        placeholder="项目资产根目录"
      />
    </Modal>

    <Modal
      v-model:open="continueOpen"
      :confirm-loading="continueSubmitting"
      :ok-button-props="{ disabled: continueAssetIndex === undefined }"
      ok-text="加入资产并继续"
      title="在本会话中深化设计"
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

    <Modal
      v-model:open="cmfMultiImageOpen"
      :footer="null"
      :title="
        cmfMultiImageDesignMode === 'cabin' ? '部件/材质融合' : '多图融合'
      "
      width="min(720px, 94vw)"
    >
      <div
        v-if="cmfMultiImageMode === 'choose'"
        class="cmf-action-choices"
        data-testid="cmf-multi-image-methods"
      >
        <button type="button" @click="transferCmfMultiImageToComposer">
          <IconifyIcon icon="lucide:panel-bottom-open" />
          <span>
            <strong>转入下方编辑框</strong>
            <small>将当前图片带入融合能力，再自行添加素材和提示词</small>
          </span>
          <IconifyIcon icon="lucide:arrow-right" />
        </button>
        <button type="button" @click="cmfMultiImageMode = 'dialog'">
          <IconifyIcon :icon="platformSemanticIcons.workbench" />
          <span>
            <strong>在弹窗中完成</strong>
            <small>上传两张参考图并填写提示词，确认后直接进入生成流程</small>
          </span>
          <IconifyIcon icon="lucide:arrow-right" />
        </button>
      </div>
      <div v-else class="cmf-multi-dialog">
        <p class="continue-description">
          当前生成图将作为基础图。请再上传两张参考图，并描述要保留、融合或替换的内容。
        </p>
        <label class="cmf-file-picker">
          <input
            accept="image/*"
            multiple
            type="file"
            @change="selectCmfMultiImageFiles"
          />
          <IconifyIcon icon="lucide:images" />
          <span>
            <strong>上传两张参考图</strong>
            <small>已选择 {{ cmfMultiImageFiles.length }}/2 张</small>
          </span>
        </label>
        <div v-if="cmfMultiImageFiles.length" class="cmf-file-list">
          <span
            v-for="file in cmfMultiImageFiles"
            :key="`${file.name}:${file.size}`"
          >
            <IconifyIcon icon="lucide:image" />
            {{ file.name }}
          </span>
        </div>
        <Textarea
          v-model:value="cmfMultiImagePrompt"
          :auto-size="{ minRows: 4, maxRows: 8 }"
          :maxlength="6000"
          placeholder="描述三张图像的融合关系、目标纹样、色彩与材质效果……"
        />
        <div class="cmf-dialog-actions">
          <Button @click="cmfMultiImageMode = 'choose'">返回</Button>
          <Button
            :disabled="
              cmfMultiImageFiles.length !== 2 || !cmfMultiImagePrompt.trim()
            "
            :loading="cmfMultiImageSubmitting"
            type="primary"
            @click="runCmfMultiImageDialog"
          >
            开始融合
          </Button>
        </div>
      </div>
    </Modal>

    <Modal
      v-model:open="cmfUpscaleOpen"
      :confirm-loading="cmfUpscaleSubmitting"
      ok-text="开始放大"
      title="选择图像放大倍率"
      @ok="runCmfUpscale"
    >
      <p class="continue-description">
        当前图片会作为原始图像，确认倍率后直接创建图像放大任务。
      </p>
      <Select
        v-model:value="cmfUpscaleFactor"
        :options="[
          { label: '2 倍', value: 2 },
          { label: '4 倍（推荐）', value: 4 },
          { label: '8 倍', value: 8 },
        ]"
        class="w-full"
      />
    </Modal>

    <Modal
      v-model:open="multiAngleOpen"
      :footer="null"
      title="多角度生成"
      width="min(720px, 94vw)"
    >
      <div v-if="multiAngleMode === 'choose'" class="cmf-action-choices">
        <button type="button" @click="transferMultiAngleToComposer">
          <IconifyIcon icon="lucide:panel-bottom-open" />
          <span>
            <strong>转入下方编辑框</strong>
            <small>使用当前图片作为源图，检查参数后再发送</small>
          </span>
          <IconifyIcon icon="lucide:arrow-right" />
        </button>
        <button type="button" @click="multiAngleMode = 'dialog'">
          <IconifyIcon :icon="platformSemanticIcons.workbench" />
          <span>
            <strong>在弹窗中完成</strong>
            <small>直接使用当前图片，或上传另一张图片替换后生成</small>
          </span>
          <IconifyIcon icon="lucide:arrow-right" />
        </button>
      </div>
      <div v-else class="cmf-multi-dialog">
        <p class="continue-description">
          多角度工作流只接收一张源图。未上传替换图时，将使用当前生成结果。
        </p>
        <label class="cmf-file-picker">
          <input accept="image/*" type="file" @change="selectMultiAngleFile" />
          <IconifyIcon icon="lucide:image-up" />
          <span>
            <strong>可选：替换源图</strong>
            <small>{{ multiAngleFile?.name ?? '当前使用生成结果' }}</small>
          </span>
        </label>
        <div class="cmf-dialog-actions">
          <Button @click="multiAngleMode = 'choose'">返回</Button>
          <Button
            :loading="multiAngleSubmitting"
            type="primary"
            @click="runMultiAngleDialog"
          >
            开始生成
          </Button>
        </div>
      </div>
    </Modal>

    <Modal
      v-model:open="threeDOpen"
      :footer="null"
      title="三维生成"
      width="min(720px, 94vw)"
    >
      <div v-if="threeDMode === 'choose'" class="cmf-action-choices">
        <button type="button" @click="transferThreeDToComposer">
          <IconifyIcon icon="lucide:panel-bottom-open" />
          <span>
            <strong>转入下方编辑框</strong>
            <small>将当前图片作为正视图，再自行补充左、后、右视图</small>
          </span>
          <IconifyIcon icon="lucide:arrow-right" />
        </button>
        <button type="button" @click="threeDMode = 'dialog'">
          <IconifyIcon :icon="platformSemanticIcons.workbench" />
          <span>
            <strong>在弹窗中完成</strong>
            <small>补充三张视图，确认后直接进入三维生成流程</small>
          </span>
          <IconifyIcon icon="lucide:arrow-right" />
        </button>
      </div>
      <div v-else class="cmf-multi-dialog">
        <p class="continue-description">
          当前图片作为正视图。请按左视图、后视图、右视图的顺序上传三张图片。
        </p>
        <label class="cmf-file-picker">
          <input
            accept="image/*"
            multiple
            type="file"
            @change="selectThreeDFiles"
          />
          <IconifyIcon icon="lucide:box" />
          <span>
            <strong>上传左、后、右三张视图</strong>
            <small>已选择 {{ threeDFiles.length }}/3 张</small>
          </span>
        </label>
        <div v-if="threeDFiles.length" class="cmf-file-list">
          <span
            v-for="(file, index) in threeDFiles"
            :key="`${file.name}:${file.size}`"
          >
            <IconifyIcon icon="lucide:image" />
            {{ ['左视图', '后视图', '右视图'][index] }}：{{ file.name }}
          </span>
        </div>
        <div class="cmf-dialog-actions">
          <Button @click="threeDMode = 'choose'">返回</Button>
          <Button
            :disabled="threeDFiles.length !== 3"
            :loading="threeDSubmitting"
            type="primary"
            @click="runThreeDDialog"
          >
            开始生成
          </Button>
        </div>
      </div>
    </Modal>

    <ComfyMaskEditor
      v-if="composerMaskField"
      v-model:open="composerMaskEditorOpen"
      :on-save="saveComposerMask"
      :src="composerMaskSource"
      :title="composerMaskTitle"
    />

    <ComfyMaskEditor
      v-if="maskEditSourceAssetId"
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
  --design-content-width: 1120px;
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

.conversation-item__tail {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: flex-end;
  width: 64px;
  min-width: 64px;
}

.conversation-item__tail > i {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  background: #2f9e62;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgb(47 158 98 / 12%);
}

.conversation-actions {
  display: none;
  flex: 0 0 auto;
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
  max-width: var(--design-content-width);
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

.composer-toolbar,
.composer-application-shortcuts,
.parameter-chips {
  display: flex;
  align-items: center;
  min-width: 0;
}

.composer-application-shortcuts,
.parameter-chips {
  gap: 2px;
  overflow-x: auto;
}

.composer-application-shortcuts button,
.parameter-chips button,
.selected-application-chip button {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 5px;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 4px 8px;
  font-size: 15px;
  font-weight: 600;
  color: #17191c;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.composer-box {
  width: 100%;
  max-width: var(--design-content-width);
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

.cmf-action-choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.cmf-action-choices > button {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 20px;
  gap: 10px;
  align-items: center;
  min-height: 112px;
  padding: 16px;
  color: #26323a;
  text-align: left;
  cursor: pointer;
  background: #f7f8f9;
  border: 1px solid #e2e6e9;
  border-radius: 12px;
}

.cmf-action-choices > button:hover {
  color: #b91c32;
  background: #fff4f5;
  border-color: #df8e9d;
}

.cmf-action-choices > button > svg:first-child {
  width: 34px;
  height: 34px;
  padding: 8px;
  background: #fff;
  border-radius: 10px;
}

.cmf-action-choices span {
  display: grid;
  gap: 5px;
}

.cmf-action-choices strong {
  font-size: 14px;
}

.cmf-action-choices small {
  font-size: 12px;
  line-height: 1.55;
  color: #74808a;
}

.cmf-multi-dialog {
  display: grid;
  gap: 12px;
}

.cmf-file-picker {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px;
  cursor: pointer;
  background: #f7f8f9;
  border: 1px dashed #cbd2d7;
  border-radius: 10px;
}

.cmf-file-picker input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.cmf-file-picker > svg {
  width: 28px;
  height: 28px;
  color: #b91c32;
}

.cmf-file-picker span {
  display: grid;
  gap: 2px;
}

.cmf-file-picker small {
  color: #74808a;
}

.cmf-file-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cmf-file-list span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  max-width: 100%;
  padding: 5px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
  background: #f2f4f5;
  border-radius: 7px;
}

.cmf-dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@keyframes design-pulse {
  50% {
    opacity: 0.35;
  }
}

@media (max-width: 1500px) {
  .thread-scroll,
  .design-composer {
    padding-right: 18px;
    padding-left: 18px;
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

/* 0820 工作区骨架：平台壳层提供功能侧栏与顶部栏，页面内部只承载任务栏和设计区。 */
main.design-page {
  --design-sidebar-width: 276px;

  position: relative;
  grid-template-columns: var(--design-sidebar-width) minmax(0, 1fr);
  width: 100%;
  height: var(--vben-content-height, calc(100dvh - 106px));
  min-height: 0;
  background: #fff;
  transition: grid-template-columns 180ms ease;
}

.design-page .conversation-sidebar {
  width: var(--design-sidebar-width);
  padding: 14px 12px 12px;
  overflow: hidden;
  background: #f7f7f8;
  border-color: #e6e6e8;
  transition:
    opacity 140ms ease,
    transform 180ms ease;
}

.design-page.sidebar-collapsed {
  grid-template-columns: 0 minmax(0, 1fr);
}

.design-page.sidebar-collapsed .conversation-sidebar {
  pointer-events: none;
  opacity: 0;
  transform: translateX(-100%);
}

.conversation-sidebar-toggle {
  position: absolute;
  top: 50%;
  left: calc(var(--design-sidebar-width) - 13px);
  z-index: 1010;
  display: grid;
  place-items: center;
  width: 28px;
  height: 48px;
  color: #9da2aa;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 0 8px 8px 0;
  opacity: 0.62;
  transform: translateY(-50%);
  transition:
    left 180ms ease,
    opacity 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.conversation-sidebar-toggle:hover {
  color: #646a73;
  background: rgb(17 24 39 / 5%);
  opacity: 1;
}

.conversation-sidebar-toggle:focus-visible {
  color: #646a73;
  outline: 2px solid rgb(194 24 54 / 45%);
  outline-offset: -2px;
  background: rgb(17 24 39 / 5%);
  opacity: 1;
}

.conversation-sidebar-toggle svg {
  width: 14px;
  height: 14px;
}

.design-page.sidebar-collapsed .conversation-sidebar-toggle {
  left: 0;
}

.conversation-sidebar__heading {
  display: grid;
  gap: 3px;
  padding: 4px 4px 13px;
}

.conversation-sidebar__heading span {
  font-size: 15px;
  font-weight: 750;
  color: #2c3338;
}

.conversation-sidebar__heading small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--design-muted);
  white-space: nowrap;
}

.project-select {
  width: 100%;
  margin-bottom: 9px;
}

.conversation-search {
  margin-top: 10px;
}

.conversation-search :deep(.ant-input-affix-wrapper) {
  background: #fff;
  border-color: transparent;
  border-radius: 10px;
  box-shadow: none;
}

.design-page .conversation-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 7px 7px;
}

.conversation-list-heading small {
  font-size: 11px;
  font-weight: 500;
}

.design-page .conversation-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding-right: 2px;
}

.design-page .conversation-item {
  min-height: 52px;
  padding: 7px;
  border-radius: 12px;
}

.design-page .conversation-item:hover,
.design-page .conversation-item.active {
  background: #fff;
}

.design-page .conversation-item.active {
  box-shadow:
    inset 3px 0 var(--rail-red),
    0 3px 12px rgb(25 31 35 / 5%);
}

.design-page .conversation-item__icon {
  width: 28px;
  height: 28px;
  background: #fff7f8;
  border: 0;
}

.design-page .conversation-item__body strong {
  font-size: 13px;
  font-weight: 650;
}

.conversation-empty {
  padding: 24px 10px;
  font-size: 12px;
  color: var(--design-muted);
  text-align: center;
}

.conversation-sidebar__footer {
  display: grid;
  gap: 8px;
  padding-top: 10px;
  margin-top: auto;
  border-top: 1px solid #e6e6e8;
}

.sidebar-user {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 30px;
  gap: 9px;
  align-items: center;
  padding: 8px;
  background: #fff;
  border-radius: 11px;
}

.sidebar-user__avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: var(--rail-red);
  border-radius: 50%;
}

.sidebar-user__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.sidebar-user__avatar b {
  font: inherit;
}

.sidebar-user > div {
  display: grid;
  min-width: 0;
}

.sidebar-user strong,
.sidebar-user small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-user strong {
  font-size: 12px;
}

.sidebar-user small {
  font-size: var(--rail-font-caption);
  color: var(--design-muted);
}

.sidebar-user button,
.thread-header__actions > button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: var(--design-muted);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 8px;
}

.design-page .design-thread {
  grid-template-rows: minmax(0, 1fr) auto;
  height: 100%;
  background: #fff;
}

.design-page .thread-scroll {
  min-width: 0;
  min-height: 0;
  padding: 26px clamp(20px, 6vw, 88px) 18px;
  background: #fff;
}

.thread-scroll > :deep(.ant-spin-nested-loading),
.thread-scroll > :deep(.ant-spin-nested-loading > .ant-spin-container) {
  min-height: 100%;
}

.design-page .thread-timeline {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--design-content-width);
}

.design-page .thread-welcome {
  box-sizing: border-box;
  width: 100%;
  max-width: 720px;
  min-height: 100%;
  padding: 48px 20px;
}

.design-page .thread-welcome p {
  max-width: 620px;
}

.welcome-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 22px;
}

.welcome-suggestions button {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 8px 12px;
  font-size: 12px;
  color: #536069;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--design-border);
  border-radius: 999px;
}

.welcome-suggestions button:hover {
  color: var(--rail-red);
  border-color: #d9a1aa;
}

.design-page .design-composer {
  position: relative;
  z-index: 4;
  min-width: 0;
  padding: 10px 18px 18px;
  background: linear-gradient(rgb(255 255 255 / 10%), #fff 20%);
}

.design-mode-switcher {
  display: grid;
  grid-template-columns: repeat(4, minmax(138px, 1fr));
  gap: 8px;
  width: 100%;
  max-width: var(--design-content-width);
  padding: 8px 0 0;
  margin: 0 auto;
  overflow-x: auto;
  scrollbar-width: none;
}

.design-mode-switcher::-webkit-scrollbar {
  display: none;
}

.design-mode-switcher button {
  position: relative;
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-width: 138px;
  min-height: 48px;
  padding: 8px 11px;
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  text-align: left;
  cursor: pointer;
  background-color: #111c23;
  background-repeat: no-repeat;
  background-position: center;
  background-size: cover;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 11px;
  box-shadow: 0 4px 12px rgb(15 23 42 / 14%);
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.design-mode-switcher button:hover {
  color: #fff;
  border-color: rgb(255 255 255 / 42%);
  box-shadow: 0 7px 16px rgb(15 23 42 / 20%);
  transform: translateY(-1px);
}

.design-mode-switcher button.active {
  color: #fff;
  border-color: #d4203c;
  box-shadow:
    0 0 0 2px rgb(212 32 60 / 18%),
    0 7px 16px rgb(15 23 42 / 20%);
}

.design-mode-switcher button.unavailable {
  color: rgb(255 255 255 / 70%);
  cursor: not-allowed;
  opacity: 0.62;
  filter: grayscale(0.85);
}

.design-mode-switcher__label {
  position: relative;
  z-index: 1;
  display: inline-flex;
  gap: 2px;
  align-items: center;
  min-width: 0;
  white-space: nowrap;
  text-shadow: 0 1px 4px rgb(0 0 0 / 50%);
}

.design-mode-switcher__label svg {
  width: 14px;
  height: 14px;
}

.design-mode-switcher small {
  position: relative;
  z-index: 1;
  padding: 2px 5px;
  font-size: var(--rail-font-caption);
  font-weight: 500;
  color: rgb(255 255 255 / 80%);
  white-space: nowrap;
  background: rgb(0 0 0 / 24%);
  border-radius: 999px;
}

.design-page .composer-box {
  box-sizing: border-box;
  max-width: var(--design-content-width);
  padding: 10px 12px 9px;
  border-color: #df8e9d;
  border-radius: 22px;
  box-shadow: 0 10px 30px rgb(185 28 50 / 10%);
}

.composer-box:focus-within {
  border-color: #c51f3a;
  box-shadow:
    0 0 0 3px rgb(185 28 50 / 8%),
    0 14px 36px rgb(185 28 50 / 12%);
}

.design-page .composer-box :deep(textarea.ant-input) {
  min-height: 50px;
  max-height: 220px !important;
  padding: 5px 2px 8px;
  overflow-y: auto !important;
  font-size: 17px;
  font-weight: 500;
  scrollbar-color: #c8cdd1 transparent;
  scrollbar-width: thin;
}

.design-page .composer-box :deep(textarea.ant-input::-webkit-scrollbar) {
  width: 6px;
}

.design-page .composer-box :deep(textarea.ant-input::-webkit-scrollbar-thumb) {
  background: #c8cdd1;
  border-radius: 999px;
}

.design-page .composer-no-prompt {
  padding: 10px 2px 14px;
}

.composer-bottom {
  gap: 10px;
  min-height: 34px;
}

.composer-toolbar {
  flex: 1;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.composer-application-shortcuts button:hover,
.parameter-chips button:hover {
  color: #bd1934;
  background: #fff1f3;
}

.composer-application-shortcuts {
  flex: 1;
  scrollbar-width: none;
}

.composer-application-shortcuts::-webkit-scrollbar,
.parameter-chips::-webkit-scrollbar {
  display: none;
}

.composer-application-shortcuts--business > button,
.composer-application-shortcuts--business > :deep(button) {
  gap: 3px;
  padding-right: 4px;
  padding-left: 4px;
  font-size: 14px;
  font-weight: 650;
}

.composer-application-shortcuts--business > button svg,
.composer-application-shortcuts--business > :deep(button svg) {
  width: 14px;
  height: 14px;
}

.primary-tool-scroll,
.primary-tool-fixed {
  display: flex;
  gap: 2px;
  align-items: center;
}

.primary-tool-scroll {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.primary-tool-scroll::-webkit-scrollbar {
  display: none;
}

.primary-tool-fixed {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  background: #fff;
  box-shadow: -10px 0 10px #fff;
}

.selected-application-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  color: #bd1934;
  background: #fff1f3;
  border: 1px solid #df8e9d;
  border-radius: 6px;
}

.selected-application-chip > span,
.selected-application-chip button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  min-height: 28px;
  padding: 4px 3px 4px 8px;
  font-size: 15px;
  font-weight: 600;
  color: inherit;
}

.selected-application-chip button:last-child {
  width: 24px;
  padding: 0 5px 0 1px;
}

.design-page .parameter-chips {
  flex: 1;
  gap: 4px;
  padding: 0;
  overflow: hidden;
}

.parameter-chips__scroll {
  display: flex;
  flex: 1 1 auto;
  gap: 2px;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.parameter-chips__scroll::-webkit-scrollbar {
  display: none;
}

.composer-more-button {
  flex: 0 0 auto;
  color: #bd1934 !important;
  background: #fff1f3 !important;
}

.design-page .parameter-chips button {
  padding: 4px 7px;
  background: transparent;
  border-color: transparent;
}

.composer-submit.ant-btn {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 42px;
  min-width: 42px;
  height: 42px;
  padding: 0;
  color: #fff;
  background: #c51f3a;
  border-color: #c51f3a;
  box-shadow: none;
}

.composer-submit.ant-btn :deep(svg) {
  width: 22px;
  height: 22px;
  stroke-width: 3;
}

.composer-submit.ant-btn:not(:disabled):hover {
  background: #a9142d;
  border-color: #a9142d;
}

.composer-submit--stop.ant-btn,
.composer-submit--stop.ant-btn:not(:disabled):hover {
  color: #1f2428;
  background: #f2f3f4;
  border-color: #e5e7e9;
}

.composer-stop-mark {
  display: block;
  width: 11px;
  height: 11px;
  background: currentcolor;
  border-radius: 2px;
}

.composer-submit.ant-btn:disabled {
  color: #fff;
  background: #e6a2ad;
  border-color: #e6a2ad;
}

.composer-media-tray {
  display: grid;
  padding: 2px 0 10px;
}

.composer-input-assets {
  display: flex;
  gap: 9px;
  min-height: 82px;
  padding: 1px 0 3px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.composer-input-asset {
  position: relative;
  flex: 0 0 78px;
  width: 78px;
  height: 78px;
}

.composer-input-asset__preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  padding: 0;
  overflow: hidden;
  color: #bd1934;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e5d8da;
  border-radius: 11px;
}

.composer-input-asset__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.composer-input-asset__move-actions {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  display: flex;
  gap: 2px;
  opacity: 0;
  transform: translate(-50%, -50%);
  transition: opacity 150ms ease;
}

.composer-input-asset:hover .composer-input-asset__move-actions,
.composer-input-asset:focus-within .composer-input-asset__move-actions {
  opacity: 1;
}

.composer-input-asset__move-actions button,
.composer-input-asset__remove {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  color: #fff;
  cursor: pointer;
  background: rgb(18 25 30 / 76%);
  border: 0;
  border-radius: 7px;
}

.composer-input-asset__move-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.composer-input-asset__remove {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 3;
  width: 21px;
  height: 21px;
  background: #343a3f;
  border: 2px solid #fff;
  border-radius: 50%;
}

.composer-input-asset__remove:hover {
  color: #fff;
  background: #bd1934;
}

.composer-input-asset__add {
  display: grid;
  flex: 0 0 78px;
  gap: 4px;
  place-items: center;
  align-content: center;
  width: 78px;
  height: 78px;
  padding: 0;
  font-size: 22px;
  color: #6c777e;
  cursor: pointer;
  background: #f3f4f5;
  border: 1px dashed #cfd5d8;
  border-radius: 11px;
}

.composer-input-asset__add span {
  font-size: var(--rail-font-caption);
  font-weight: 650;
}

.composer-input-asset__add:hover {
  color: #bd1934;
  background: #fff5f6;
  border-color: #cf6476;
}

.composer-input-asset__add:disabled {
  cursor: wait;
  opacity: 0.7;
}

:global(.composer-media-source-menu) {
  display: grid;
  gap: 6px;
  width: 250px;
}

:global(.composer-media-source-menu > button) {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  padding: 9px;
  color: #20272c;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 9px;
}

:global(.composer-media-source-menu > button:hover) {
  color: #bd1934;
  background: #fff1f3;
}

:global(.composer-media-source-menu > button > svg) {
  width: 21px;
  height: 21px;
  margin: auto;
}

:global(.composer-media-source-menu span),
:global(.composer-media-source-menu strong),
:global(.composer-media-source-menu small) {
  display: block;
}

:global(.composer-media-source-menu strong) {
  font-size: 13px;
}

:global(.composer-media-source-menu small) {
  margin-top: 2px;
  font-size: 11px;
  color: #758087;
}

.composer-media-summary strong {
  color: #bd1934;
}

.media-picker-description {
  margin: 0 0 16px;
  font-size: 14px;
  color: #66727a;
}

.markdown-asset-entry {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 11px 12px;
  margin-bottom: 16px;
  text-align: left;
  cursor: pointer;
  background: #fff7f8;
  border: 1px solid #efd2d7;
  border-radius: 12px;
}

.markdown-asset-entry > svg {
  width: 38px;
  height: 38px;
  padding: 9px;
  color: #bd1934;
  background: #fff;
  border-radius: 10px;
}

.markdown-asset-entry span {
  display: grid;
  gap: 2px;
}

.markdown-asset-entry strong {
  font-size: 14px;
}

.markdown-asset-entry small,
.markdown-asset-entry em {
  font-size: 12px;
  font-style: normal;
  color: var(--design-muted);
}

.markdown-asset-entry:hover {
  border-color: #d98291;
}

.media-picker-fields {
  display: grid;
  gap: 14px;
  max-height: 66vh;
  overflow-y: auto;
}

.media-picker-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.media-picker-footer :deep(.ant-btn-primary) {
  background: #c51f3a;
}

:global(.more-applications-grid) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 220px));
  gap: 4px;
  width: min(460px, 80vw);
  max-height: 360px;
  overflow-y: auto;
}

:global(.more-applications-grid > button) {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 9px;
  color: #20262b;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 8px;
}

:global(.more-applications-grid > button:hover) {
  background: #fff1f3;
}

:global(.more-applications-grid > button > svg) {
  flex: 0 0 auto;
  font-size: 18px;
  color: #bd1934;
}

:global(.more-applications-grid > button > span) {
  display: grid;
  min-width: 0;
}

:global(.more-applications-grid strong),
:global(.more-applications-grid small) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.more-applications-grid strong) {
  font-size: 13px;
}

:global(.more-applications-grid small) {
  font-size: 11px;
  color: #73808a;
}

@media (max-width: 900px) {
  main.design-page {
    --design-sidebar-width: 224px;
  }

  .conversation-brand strong {
    font-size: 12px;
  }

  .thread-status {
    display: none;
  }
}
</style>
