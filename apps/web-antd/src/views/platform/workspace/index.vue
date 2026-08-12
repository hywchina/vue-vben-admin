<script lang="ts" setup>
import type {
  CapabilityField,
  PlatformCapability,
  PlatformJob,
  PlatformJobInput,
  PlatformJobOutput,
  WorkflowWorkspaceInstance,
} from '#/modules/platform/types';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useTabs } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { useTabbarStore } from '@vben/stores';

import {
  Button,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Switch,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  createWorkflowInputTransferApi,
  createWorkflowWorkspaceInstanceApi,
  dismissWorkflowInputTransferApi,
  getAssetDownloadApi,
  getAssetPreviewApi,
  getCapabilityApi,
  getPendingWorkflowInputTransfersApi,
  getWorkflowWorkspaceDraftApi,
  getWorkflowWorkspaceInstancesApi,
  saveWorkflowWorkspaceDraftApi,
} from '#/api';
import ComfyMaskEditor from '#/components/platform/comfy-mask-editor.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import WorkflowRunCard from '#/components/platform/workflow-run-card.vue';
import { assetTypeLabels } from '#/modules/platform/asset-types';
import { usePlatformStore } from '#/store';
import { selectWorkspaceJobs } from '#/store/platform/helpers';

import CameraAngleControl from './camera-angle-control.vue';
import CapabilityMediaField from './capability-media-field.vue';
import { createRegionInputAnnotations } from './region-annotation';

const mediaTypes = new Set(['asset', 'capture', 'mask', 'region']);
const route = useRoute();
const router = useRouter();
const { closeTabByKey, setTabTitle } = useTabs();
const tabbarStore = useTabbarStore();
const platformStore = usePlatformStore();
const selectedAssets = reactive<Record<number, string>>({});
const selectedTransfers = reactive<Record<number, string>>({});
const submitting = ref(false);
const uploadingField = ref('');
const capabilityLoading = ref(false);
const capability = ref<null | PlatformCapability>(null);
const workspaceInstance = ref<null | WorkflowWorkspaceInstance>(null);
const parameterValues = reactive<Record<string, unknown>>({});
const genericPrompt = ref(
  '以现代、克制的设计语言优化客室空间，保持结构关系清晰。',
);
const outputMaskEditorOpen = ref(false);
const outputMaskSource = ref('');
const outputMaskTitle = ref('');
const maskEditDerivedFromAssetId = ref('');
const maskEditSourceAssetId = ref('');
const flowModalOpen = ref(false);
const flowDestination = ref('');
const flowSubmitting = ref(false);
const flowTargetAssetIndex = ref<number>();
const flowTargetInstanceId = ref('new');
const flowTargetInstanceOptions = ref<Array<{ label: string; value: string }>>(
  [],
);
const flowTargetLoading = ref(false);
const flowTargetOptions = ref<
  Array<{ disabled: boolean; label: string; value: number }>
>([]);
const actionOutput = ref<PlatformJobOutput>();
const loadedWorkspaceKey = ref('');
let pollTimer: ReturnType<typeof setInterval> | undefined;
let draftSaveTimer: ReturnType<typeof setTimeout> | undefined;
let capabilityLoadGeneration = 0;
let draftHydrating = false;

const application = computed(() =>
  platformStore.applications.find((item) => item.key === route.params.appKey),
);
const workspaceInstanceId = computed(() =>
  typeof route.query.instanceId === 'string' ? route.query.instanceId : '',
);
const conversationJobs = computed(() =>
  selectWorkspaceJobs(
    platformStore.currentJobs,
    workspaceInstanceId.value,
    platformStore.currentProjectId,
  ),
);
const applicationJobs = computed(() => conversationJobs.value.toReversed());
const activeJob = computed(() =>
  applicationJobs.value.find((job) =>
    ['cancelling', 'queued', 'running'].includes(job.status),
  ),
);
const mediaFields = computed(
  () =>
    capability.value?.fields
      .filter((field) => mediaTypes.has(field.type))
      .toSorted((a, b) => (a.assetIndex ?? 0) - (b.assetIndex ?? 0)) ?? [],
);
const basicFields = computed(
  () =>
    capability.value?.fields.filter(
      (field) =>
        !field.advanced &&
        !mediaTypes.has(field.type) &&
        field.uiControl === 'default',
    ) ?? [],
);
const advancedFields = computed(
  () =>
    capability.value?.fields.filter(
      (field) =>
        field.advanced &&
        !mediaTypes.has(field.type) &&
        field.uiControl === 'default',
    ) ?? [],
);
const cameraFields = computed(
  () =>
    capability.value?.fields.filter((field) =>
      field.uiControl.startsWith('camera-'),
    ) ?? [],
);
const selectedAssetIds = computed(() =>
  mediaFields.value.flatMap((field) => {
    if (field.assetIndex === undefined) return [];
    const id = selectedAssets[field.assetIndex];
    return id ? [id] : [];
  }),
);
const resultKind = computed(
  () =>
    actionOutput.value?.kind ??
    applicationJobs.value[0]?.outputs[0]?.kind ??
    capability.value?.outputTypes[0] ??
    'image',
);
const compatibleDestinations = computed(() =>
  platformStore.applications
    .filter(
      (item) =>
        item.key !== application.value?.key &&
        item.visible &&
        item.capabilityCode &&
        item.acceptedAssetTypes.includes(resultKind.value),
    )
    .map((item) => ({ label: item.name, value: item.key })),
);
const routeLineLabel = computed(() => {
  const inputCount = mediaFields.value.length;
  if (inputCount === 0) return '业务参数';
  if (inputCount === 1) return '单项目资产';
  return `${inputCount} 个输入位`;
});

function fieldNumberValue(field: CapabilityField) {
  const value = parameterValues[field.key];
  return typeof value === 'number' ? value : undefined;
}

function fieldTextValue(field: CapabilityField) {
  const value = parameterValues[field.key];
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
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
  scheduleWorkspaceDraftSave();
}

function setFieldNumberValue(
  field: CapabilityField,
  value: null | number | string,
) {
  const normalized = typeof value === 'string' ? Number(value) : value;
  parameterValues[field.key] = normalized ?? field.defaultValue;
  scheduleWorkspaceDraftSave();
}

function workspaceDraftPayload(
  appKey?: string,
  projectId?: string,
  instanceId?: string,
) {
  if (
    !appKey ||
    !projectId ||
    !instanceId ||
    !capability.value ||
    loadedWorkspaceKey.value !== `${projectId}:${appKey}:${instanceId}`
  ) {
    return;
  }
  return {
    appKey,
    inputAssetIds: Object.fromEntries(
      Object.entries(selectedAssets).filter(([, assetId]) => Boolean(assetId)),
    ),
    parameterValues: taskParameters(),
    projectId,
    workspaceInstanceId: instanceId,
  };
}

async function saveWorkspaceDraftNow() {
  if (draftHydrating) return;
  const payload = workspaceDraftPayload(
    application.value?.key,
    platformStore.currentProjectId,
    workspaceInstanceId.value,
  );
  if (!payload) return;
  try {
    await saveWorkflowWorkspaceDraftApi(payload);
  } catch {
    // 通用请求层已经提示失败；保留当前页面输入，后续修改会再次尝试保存。
  }
}

function scheduleWorkspaceDraftSave() {
  if (draftHydrating) return;
  const payload = workspaceDraftPayload(
    application.value?.key,
    platformStore.currentProjectId,
    workspaceInstanceId.value,
  );
  if (!payload) return;
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = undefined;
    void saveWorkflowWorkspaceDraftApi(payload).catch(() => undefined);
  }, 500);
}

function resetWorkspace() {
  for (const key of Object.keys(parameterValues)) {
    Reflect.deleteProperty(parameterValues, key);
  }
  for (const key of Object.keys(selectedAssets)) {
    Reflect.deleteProperty(selectedAssets, key);
  }
  for (const key of Object.keys(selectedTransfers)) {
    Reflect.deleteProperty(selectedTransfers, key);
  }
  for (const field of capability.value?.fields ?? []) {
    if (!mediaTypes.has(field.type) || field.type === 'region') {
      parameterValues[field.key] = field.defaultValue;
    }
  }
}

async function loadCapability() {
  const generation = ++capabilityLoadGeneration;
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = undefined;
  loadedWorkspaceKey.value = '';
  capability.value = null;
  workspaceInstance.value = null;
  actionOutput.value = undefined;
  outputMaskEditorOpen.value = false;
  flowModalOpen.value = false;
  const appKey = application.value?.key;
  const capabilityCode = application.value?.capabilityCode;
  const projectId = platformStore.currentProjectId;
  if (!appKey || !capabilityCode || !projectId) return;
  const instanceId = workspaceInstanceId.value;
  capabilityLoading.value = true;
  try {
    if (!instanceId) {
      const created = await createWorkflowWorkspaceInstanceApi({
        appKey,
        projectId,
      });
      if (
        generation === capabilityLoadGeneration &&
        application.value?.key === appKey &&
        platformStore.currentProjectId === projectId
      ) {
        await router.replace({
          query: { ...route.query, instanceId: created.id },
        });
      }
      return;
    }
    const [nextCapability, draft, instances] = await Promise.all([
      getCapabilityApi(capabilityCode),
      getWorkflowWorkspaceDraftApi(projectId, appKey, instanceId),
      getWorkflowWorkspaceInstancesApi(projectId, appKey),
    ]);
    if (
      generation !== capabilityLoadGeneration ||
      application.value?.key !== appKey ||
      platformStore.currentProjectId !== projectId
    ) {
      return;
    }
    const nextInstance = instances.find((item) => item.id === instanceId);
    if (!nextInstance) {
      const created = await createWorkflowWorkspaceInstanceApi({
        appKey,
        projectId,
      });
      await router.replace({
        query: { ...route.query, instanceId: created.id },
      });
      return;
    }
    capability.value = nextCapability;
    workspaceInstance.value = nextInstance;
    loadedWorkspaceKey.value = `${projectId}:${appKey}:${instanceId}`;
    draftHydrating = true;
    resetWorkspace();
    const parameterKeys = new Set(
      nextCapability.fields
        .filter(
          (field) => !mediaTypes.has(field.type) || field.type === 'region',
        )
        .map((field) => field.key),
    );
    for (const [key, value] of Object.entries(draft.parameterValues)) {
      if (parameterKeys.has(key)) parameterValues[key] = value;
    }
    for (const [index, assetId] of Object.entries(draft.inputAssetIds)) {
      selectedAssets[Number(index)] = assetId;
    }
    await applyTransferredInputs();
  } finally {
    if (generation === capabilityLoadGeneration) {
      draftHydrating = false;
      capabilityLoading.value = false;
      scheduleWorkspaceDraftSave();
    }
  }
}

async function applyTransferredInputs() {
  if (
    !application.value ||
    !platformStore.currentProjectId ||
    !workspaceInstanceId.value
  ) {
    return;
  }
  const transfers = await getPendingWorkflowInputTransfersApi(
    platformStore.currentProjectId,
    application.value.key,
    workspaceInstanceId.value,
  );
  for (const transfer of transfers) {
    const target = mediaFields.value.find(
      (field) =>
        field.assetIndex === transfer.targetAssetIndex &&
        field.acceptedKinds.includes(transfer.assetKind),
    );
    if (target) await selectAsset(target, transfer.assetId, transfer.id);
  }
  const routedTransferId =
    typeof route.query.transferId === 'string'
      ? route.query.transferId
      : undefined;
  const routedTransfer = transfers.find(
    (transfer) => transfer.id === routedTransferId,
  );
  if (routedTransfer) {
    message.success(`已接收“${routedTransfer.assetName}”并填入空输入位`);
    await router.replace({
      query: { ...route.query, transferId: undefined },
    });
  }
}

async function selectAsset(
  field: CapabilityField,
  assetId: string,
  transferId?: string,
) {
  if (field.assetIndex === undefined) return;
  const occupied = Object.entries(selectedAssets).find(
    ([index, id]) => Number(index) !== field.assetIndex && id === assetId,
  );
  if (occupied) {
    message.warning('该资产已用于另一个输入位');
    return;
  }
  const previousTransferId = selectedTransfers[field.assetIndex];
  const previousAssetId = selectedAssets[field.assetIndex];
  if (
    !transferId &&
    previousTransferId &&
    selectedAssets[field.assetIndex] !== assetId
  ) {
    Reflect.deleteProperty(selectedTransfers, field.assetIndex);
    try {
      await dismissWorkflowInputTransferApi(previousTransferId);
    } catch {
      selectedTransfers[field.assetIndex] = previousTransferId;
      message.error('暂时无法取消原流转输入，请稍后重试');
      return;
    }
  }
  selectedAssets[field.assetIndex] = assetId;
  if (
    field.type === 'region' &&
    previousAssetId &&
    previousAssetId !== assetId
  ) {
    parameterValues[field.key] = '';
  }
  if (transferId) selectedTransfers[field.assetIndex] = transferId;
  await saveWorkspaceDraftNow();
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
  uploadingField.value = field.key;
  try {
    const asset = await platformStore.uploadAsset({
      description: `${capability.value?.name ?? application.value?.name} 工作区输入`,
      derivedFromAssetId: options.derivedFromAssetId,
      file,
      name: file.name.replace(/\.[^.]+$/, ''),
      tags: options.tags ?? ['工作流输入'],
      type: 'image',
    });
    await selectAsset(field, asset.id);
    if (!options.silent) message.success('图像已登记为当前项目资产');
    return asset;
  } finally {
    uploadingField.value = '';
  }
}

async function saveInputMask(field: CapabilityField, file: File) {
  const assetIndex = field.assetIndex;
  const selectedAsset =
    assetIndex === undefined
      ? undefined
      : platformStore.currentAssets.find(
          (asset) => asset.id === selectedAssets[assetIndex],
        );
  await uploadMedia(field, file, {
    derivedFromAssetId: selectedAsset?.derivedFromAssetId ?? selectedAsset?.id,
    tags: ['工作流输入', '遮罩'],
  });
}

function randomizeSeed() {
  const field = capability.value?.fields.find((item) => item.key === 'seed');
  if (!field) return;
  parameterValues.seed = Math.floor(
    Math.random() * Math.min(field.max ?? Number.MAX_SAFE_INTEGER, 2 ** 48),
  );
  scheduleWorkspaceDraftSave();
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
        tags: ['工作流输入', '分区标记'],
        type: 'image',
      });
    },
    selectedAssets,
  });
}

async function submitCapability(options: { silent?: boolean } = {}) {
  if (
    !application.value ||
    !platformStore.currentProjectId ||
    !workspaceInstanceId.value
  ) {
    return;
  }
  const missingAsset = mediaFields.value.find(
    (field) =>
      field.required &&
      (field.assetIndex === undefined || !selectedAssets[field.assetIndex]),
  );
  if (missingAsset) {
    message.warning(`请先完成“${missingAsset.label}”`);
    return;
  }
  const missingRegion = mediaFields.value.find(
    (field) =>
      field.type === 'region' &&
      field.required &&
      !String(parameterValues[field.key] ?? '').trim(),
  );
  if (missingRegion) {
    message.warning(`请在“${missingRegion.label}”上绘制至少一个区域`);
    return;
  }
  submitting.value = true;
  try {
    const inputAnnotations = await prepareRegionAnnotations();
    const job = await platformStore.runApplication(
      application.value.key,
      { workspaceInstanceId: workspaceInstanceId.value },
      selectedAssetIds.value,
      capability.value ? taskParameters() : { prompt: genericPrompt.value },
      Object.values(selectedTransfers),
      inputAnnotations,
    );
    if (job) {
      for (const key of Object.keys(selectedTransfers)) {
        Reflect.deleteProperty(selectedTransfers, key);
      }
    }
    if (job?.status === 'failed') {
      if (!options.silent) {
        message.warning(job.error?.message ?? '能力服务尚未配置');
      }
    } else if (!options.silent) {
      message.success('任务已进入持久化队列，关闭页面后仍会继续');
    }
    return job;
  } catch {
    await platformStore.refreshCurrentProjectData();
  } finally {
    submitting.value = false;
  }
}

async function runCapability() {
  await submitCapability();
}

async function rerunJob(job: PlatformJob) {
  if (activeJob.value) {
    message.warning('当前应用会话已有任务正在执行，请等待完成或先取消任务');
    return;
  }
  draftHydrating = true;
  try {
    for (const key of Object.keys(parameterValues)) {
      Reflect.deleteProperty(parameterValues, key);
    }
    for (const [key, value] of Object.entries(job.parameters)) {
      parameterValues[key] = value;
    }
    for (const key of Object.keys(selectedAssets)) {
      Reflect.deleteProperty(selectedAssets, key);
    }
    for (const key of Object.keys(selectedTransfers)) {
      Reflect.deleteProperty(selectedTransfers, key);
    }
    for (const input of job.inputs)
      selectedAssets[input.position] = input.assetId;
  } finally {
    draftHydrating = false;
  }
  await saveWorkspaceDraftNow();
  await submitCapability();
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
    tags: ['工作流输入', '实时捕获'],
  });
  const job = await submitCapability({ silent: true });
  if (!job) return false;
  if (['cancelled', 'failed', 'succeeded'].includes(job.status)) {
    return job.status === 'succeeded';
  }
  return await waitForJob(job.id);
}

async function stopLiveCapture() {
  if (activeJob.value) await platformStore.cancelJob(activeJob.value.id);
}

async function cancelActiveJob() {
  if (!activeJob.value) return;
  await platformStore.cancelJob(activeJob.value.id);
  message.info('取消请求已提交');
}

async function saveOutput(output: PlatformJobOutput) {
  if (output.saved) return;
  await platformStore.saveWorkflowOutput(output.assetId);
  message.success('生成结果已保存到当前项目资产中心');
}

async function saveOutputMask(file: File) {
  if (!maskEditSourceAssetId.value) throw new Error('当前没有可编辑的图片');
  await platformStore.uploadAsset({
    derivedFromAssetId: maskEditDerivedFromAssetId.value || undefined,
    description: `${application.value?.name ?? '工作流'}图片遮罩编辑`,
    file,
    name: file.name.replace(/\.[^.]+$/, ''),
    tags: ['工作流结果编辑', '遮罩'],
    type: 'image',
  });
  message.success('遮罩编辑结果已保存到当前项目资产中心');
}

async function loadFlowTargetOptions() {
  const targetAppKey = flowDestination.value;
  const targetInstanceId = flowTargetInstanceId.value;
  flowTargetAssetIndex.value = undefined;
  flowTargetOptions.value = [];
  if (!targetAppKey || !platformStore.currentProjectId) return;
  const targetApplication = platformStore.applications.find(
    (item) => item.key === targetAppKey,
  );
  if (!targetApplication?.capabilityCode) return;
  flowTargetLoading.value = true;
  try {
    const [targetCapability, targetInstances] = await Promise.all([
      getCapabilityApi(targetApplication.capabilityCode),
      getWorkflowWorkspaceInstancesApi(
        platformStore.currentProjectId,
        targetAppKey,
      ),
    ]);
    if (
      flowDestination.value !== targetAppKey ||
      flowTargetInstanceId.value !== targetInstanceId
    ) {
      return;
    }
    flowTargetInstanceOptions.value = [
      { label: '新建应用会话', value: 'new' },
      ...targetInstances.map((instance) => ({
        label: instance.title,
        value: instance.id,
      })),
    ];
    const pendingTransfers =
      targetInstanceId === 'new'
        ? []
        : await getPendingWorkflowInputTransfersApi(
            platformStore.currentProjectId,
            targetAppKey,
            targetInstanceId,
          );
    if (
      flowDestination.value !== targetAppKey ||
      flowTargetInstanceId.value !== targetInstanceId
    ) {
      return;
    }
    const occupiedIndexes = new Set(
      pendingTransfers.map((transfer) => transfer.targetAssetIndex),
    );
    flowTargetOptions.value = targetCapability.fields.flatMap((field) => {
      if (
        field.assetIndex === undefined ||
        !mediaTypes.has(field.type) ||
        !field.acceptedKinds.includes(resultKind.value)
      ) {
        return [];
      }
      const occupied = occupiedIndexes.has(field.assetIndex);
      return [
        {
          disabled: occupied,
          label: `${field.label}${field.required ? '（必填）' : ''}${
            occupied ? '（该会话输入位已占用）' : ''
          }`,
          value: field.assetIndex,
        },
      ];
    });
  } finally {
    if (flowDestination.value === targetAppKey) {
      flowTargetLoading.value = false;
    }
  }
}

function openFlowModal(output: PlatformJobOutput) {
  actionOutput.value = output;
  if (compatibleDestinations.value.length === 0) {
    message.warning('当前没有接收该结果类型的其他可见工作流');
    return;
  }
  flowDestination.value = compatibleDestinations.value[0]?.value ?? '';
  flowTargetInstanceId.value = 'new';
  flowModalOpen.value = true;
  void loadFlowTargetOptions();
}

async function sendLatestOutput() {
  if (
    !actionOutput.value ||
    !flowDestination.value ||
    flowTargetAssetIndex.value === undefined
  ) {
    return;
  }
  flowSubmitting.value = true;
  try {
    if (!actionOutput.value.saved) {
      await platformStore.saveWorkflowOutput(actionOutput.value.assetId);
    }
    const targetInstance =
      flowTargetInstanceId.value === 'new'
        ? await createWorkflowWorkspaceInstanceApi({
            appKey: flowDestination.value,
            projectId: platformStore.currentProjectId,
          })
        : { id: flowTargetInstanceId.value };
    const transfer = await createWorkflowInputTransferApi({
      assetId: actionOutput.value.assetId,
      targetAppKey: flowDestination.value,
      targetAssetIndex: flowTargetAssetIndex.value,
      targetInstanceId: targetInstance.id,
    });
    flowModalOpen.value = false;
    await router.push({
      path: `/workspace/${flowDestination.value}`,
      query: { instanceId: targetInstance.id, transferId: transfer.id },
    });
  } finally {
    flowSubmitting.value = false;
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

function openOutputMask(output: PlatformJobOutput, previewUrl: string) {
  actionOutput.value = output;
  maskEditSourceAssetId.value = output.assetId;
  maskEditDerivedFromAssetId.value = output.saved ? output.assetId : '';
  outputMaskSource.value = previewUrl;
  outputMaskTitle.value = output.name;
  outputMaskEditorOpen.value = true;
}

function openInputMask(input: PlatformJobInput, previewUrl: string) {
  maskEditSourceAssetId.value = input.assetId;
  maskEditDerivedFromAssetId.value = input.assetId;
  outputMaskSource.value = previewUrl;
  outputMaskTitle.value = input.name || '本轮输入图片';
  outputMaskEditorOpen.value = true;
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = undefined;
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    void platformStore.refreshCurrentProjectData();
  }, 2000);
}

async function canonicalizeAndDeduplicateInstanceTab() {
  const instanceId = workspaceInstanceId.value;
  if (!instanceId) return;
  if (
    Object.keys(route.query).some(
      (key) => key !== 'instanceId' && route.query[key] !== undefined,
    )
  ) {
    await router.replace({ query: { instanceId } });
  }
  const currentKey = route.fullPath;
  const duplicateKeys = tabbarStore.getTabs.flatMap((tab) => {
    const key = typeof tab.key === 'string' ? tab.key : '';
    if (!key || key === currentKey || tab.path !== route.path) return [];
    const parsed = new URL(key, window.location.origin);
    const tabInstanceId = parsed.searchParams.get('instanceId');
    return !tabInstanceId || tabInstanceId === instanceId ? [key] : [];
  });
  for (const key of duplicateKeys) await closeTabByKey(key);
}

watch(flowDestination, () => {
  flowTargetInstanceId.value = 'new';
  if (flowModalOpen.value) void loadFlowTargetOptions();
});
watch(flowTargetInstanceId, () => {
  if (flowModalOpen.value) void loadFlowTargetOptions();
});
watch(
  () => workspaceInstance.value?.title,
  (name) => {
    if (name) {
      void setTabTitle(name);
      void canonicalizeAndDeduplicateInstanceTab();
    }
  },
  { immediate: true },
);
watch(
  () => [
    route.params.appKey,
    route.query.instanceId,
    application.value?.capabilityCode,
    platformStore.currentProjectId,
  ],
  () => void loadCapability(),
  { immediate: true },
);
watch(
  activeJob,
  (job) => {
    if (job) {
      startPolling();
    } else stopPolling();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  stopPolling();
  if (draftSaveTimer) clearTimeout(draftSaveTimer);
  draftSaveTimer = undefined;
  void saveWorkspaceDraftNow();
});
</script>

<template>
  <main
    v-if="application"
    class="capability-studio"
    :style="{ '--cap-accent': application.color }"
  >
    <header class="studio-hero">
      <div class="studio-hero__identity">
        <Button
          class="back-button"
          shape="circle"
          @click="router.push('/design')"
        >
          <IconifyIcon icon="lucide:arrow-left" />
        </Button>
        <div class="capability-glyph">
          <IconifyIcon :icon="application.icon" />
        </div>
        <div>
          <span class="studio-kicker">RAIL DESIGN CAPABILITY</span>
          <h1>{{ capability?.name ?? application.name }}</h1>
          <p>
            <strong>{{ workspaceInstance?.title }}</strong>
            <span>·</span>
            {{ capability?.description ?? application.description }}
          </p>
        </div>
      </div>
      <div class="studio-hero__actions">
        <StatusPill
          :status="application.adapterConfigured ? 'available' : 'planned'"
        />
        <Button @click="router.push('/jobs')">
          <IconifyIcon icon="lucide:list-checks" />
          任务记录
        </Button>
        <Button
          v-if="activeJob"
          danger
          :disabled="activeJob.status === 'cancelling'"
          @click="cancelActiveJob"
        >
          {{ activeJob.status === 'cancelling' ? '正在取消' : '取消任务' }}
        </Button>
        <Button
          v-else
          :disabled="!platformStore.currentProjectId || capabilityLoading"
          :loading="submitting"
          type="primary"
          @click="runCapability"
        >
          <IconifyIcon icon="lucide:sparkles" />
          开始运行
        </Button>
      </div>

      <div
        class="capability-line"
        :class="{ running: Boolean(activeJob) }"
        aria-label="能力执行链路"
      >
        <div>
          <i><IconifyIcon icon="lucide:package-open" /></i>
          <span>{{ routeLineLabel }}</span>
        </div>
        <b><em></em></b>
        <div class="active">
          <i><IconifyIcon :icon="application.icon" /></i>
          <span>{{ capability?.workflow.name ?? '工作流' }}</span>
        </div>
        <b><em></em></b>
        <div>
          <i><IconifyIcon icon="lucide:library" /></i>
          <span>{{ assetTypeLabels[resultKind] ?? '项目资产' }}</span>
        </div>
      </div>
    </header>

    <div class="studio-grid">
      <aside class="control-deck">
        <div class="deck-heading">
          <div>
            <span>CONTROL DECK</span>
            <h2>
              设计参数
              <small v-if="capability">
                {{
                  basicFields.length +
                  advancedFields.length +
                  cameraFields.length
                }}
                项
              </small>
            </h2>
          </div>
          <IconifyIcon icon="lucide:sliders-horizontal" />
        </div>

        <div class="deck-scroll">
          <template v-if="capability">
            <CameraAngleControl
              v-if="cameraFields.length"
              :accent="application.color"
              :fields="cameraFields"
              :values="parameterValues"
              @update="setFieldNumberValue"
            />
            <label
              v-for="field in basicFields"
              :key="field.key"
              class="studio-field"
            >
              <span>
                {{ field.label }}
                <i v-if="field.required">必填</i>
              </span>
              <small v-if="field.help">{{ field.help }}</small>
              <small v-else-if="field.type === 'number'" class="field-range">
                范围 {{ field.min ?? '不限' }}–{{ field.max ?? '不限' }}，默认
                {{ field.defaultValue ?? '空' }}
              </small>
              <Textarea
                v-if="field.type === 'textarea'"
                :value="fieldTextValue(field)"
                :maxlength="field.maxLength"
                :placeholder="field.placeholder"
                :rows="6"
                show-count
                @update:value="setFieldValue(field, $event)"
              />
              <Textarea
                v-else-if="field.type === 'json'"
                :value="fieldJsonValue(field)"
                :rows="5"
                class="json-field"
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
                :value="fieldTextValue(field)"
                :options="field.options"
                @update:value="setFieldValue(field, $event)"
              />
              <Switch
                v-else
                :checked="fieldBooleanValue(field)"
                @update:checked="setFieldValue(field, $event)"
              />
            </label>

            <div
              v-if="!basicFields.length && !cameraFields.length"
              class="parameter-empty"
            >
              <IconifyIcon icon="lucide:mouse-pointer-click" />
              <p>该能力不需要额外文本参数，完成输入编组即可运行。</p>
            </div>

            <details v-if="advancedFields.length" class="advanced-deck">
              <summary>
                <span>高级参数</span>
                <small>{{ advancedFields.length }} 项</small>
              </summary>
              <div class="advanced-fields">
                <label
                  v-for="field in advancedFields"
                  :key="field.key"
                  class="studio-field"
                >
                  <span>{{ field.label }}</span>
                  <small v-if="field.help">{{ field.help }}</small>
                  <small
                    v-else-if="field.type === 'number'"
                    class="field-range"
                  >
                    范围 {{ field.min ?? '不限' }}–{{
                      field.max ?? '不限'
                    }}，默认
                    {{ field.defaultValue ?? '空' }}
                  </small>
                  <div v-if="field.key === 'seed'" class="seed-field">
                    <InputNumber
                      :max="field.max"
                      :min="field.min"
                      :step="field.step"
                      :value="fieldNumberValue(field)"
                      class="w-full"
                      @update:value="setFieldNumberValue(field, $event)"
                    />
                    <Button @click="randomizeSeed">随机</Button>
                  </div>
                  <InputNumber
                    v-else-if="field.type === 'number'"
                    :max="field.max"
                    :min="field.min"
                    :step="field.step"
                    :value="fieldNumberValue(field)"
                    class="w-full"
                    @update:value="setFieldNumberValue(field, $event)"
                  />
                  <Textarea
                    v-else-if="field.type === 'textarea'"
                    :value="fieldTextValue(field)"
                    :rows="4"
                    @update:value="setFieldValue(field, $event)"
                  />
                  <Textarea
                    v-else-if="field.type === 'json'"
                    :value="fieldJsonValue(field)"
                    :rows="5"
                    class="json-field"
                    @update:value="setFieldValue(field, $event)"
                  />
                  <Switch
                    v-else-if="field.type === 'boolean'"
                    :checked="fieldBooleanValue(field)"
                    @update:checked="setFieldValue(field, $event)"
                  />
                  <Select
                    v-else-if="field.type === 'select'"
                    :value="fieldTextValue(field)"
                    :options="field.options"
                    @update:value="setFieldValue(field, $event)"
                  />
                  <Input
                    v-else
                    :value="fieldTextValue(field)"
                    @update:value="setFieldValue(field, $event)"
                  />
                </label>
              </div>
            </details>
          </template>

          <label v-else class="studio-field">
            <span>设计要求</span>
            <Textarea v-model:value="genericPrompt" :rows="7" />
          </label>

          <div class="execution-facts">
            <div>
              <span>结果归属</span>
              <strong>{{ platformStore.currentProject?.name }}</strong>
            </div>
            <div>
              <span>版本快照</span>
              <strong>
                {{ capability ? `V${capability.workflow.version}` : '未绑定' }}
              </strong>
            </div>
            <div>
              <span>后台执行</span>
              <strong>独立 Worker</strong>
            </div>
          </div>
        </div>
      </aside>

      <section class="result-stage">
        <div class="stage-meta">
          <span>
            <i :class="{ online: application.adapterConfigured }"></i>
            {{
              application.adapterConfigured
                ? '外部服务已连接'
                : '等待 ComfyUI 配置'
            }}
          </span>
          <small>{{ platformStore.currentProject?.code }} · 持久化任务</small>
        </div>

        <div class="stage-viewport conversation-viewport">
          <div v-if="conversationJobs.length" class="workflow-conversation">
            <WorkflowRunCard
              v-for="(job, index) in conversationJobs"
              :key="job.id"
              :accent="application.color"
              :fields="capability?.fields ?? []"
              :job="job"
              :round="index + 1"
              :supports-image-comparison="
                capability?.supportsImageComparison ?? false
              "
              @download="downloadOutput"
              @edit-input="openInputMask"
              @flow="openFlowModal"
              @mask="openOutputMask"
              @rerun="rerunJob"
              @save="saveOutput"
            />
          </div>

          <div v-else class="stage-state ready-state">
            <div class="ready-orbit">
              <span></span>
              <IconifyIcon :icon="application.icon" />
              <span></span>
            </div>
            <span class="stage-eyebrow">READY FOR DISPATCH</span>
            <h2>{{ capability?.name ?? application.name }}</h2>
            <p>
              完成参数和输入编组后提交。页面关闭不会中断任务，生成结果由你决定是否加入项目资产。
            </p>
            <Button type="primary" @click="runCapability">
              <IconifyIcon icon="lucide:sparkles" />
              开始运行
            </Button>
          </div>
        </div>

        <div class="security-strip">
          <IconifyIcon icon="lucide:shield-check" />
          <p>
            浏览器只接触业务字段和项目资产；ComfyUI 地址、密钥、节点 ID 与 API
            JSON 仅保留在平台后端。
          </p>
        </div>
      </section>

      <aside class="input-deck">
        <div class="deck-heading">
          <div>
            <span>INPUT CONSIST</span>
            <h2>输入编组</h2>
          </div>
          <Tag>{{ selectedAssetIds.length }}/{{ mediaFields.length }}</Tag>
        </div>

        <div class="input-scroll">
          <CapabilityMediaField
            v-for="field in mediaFields"
            :key="field.key"
            :accent="application.color"
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

          <div v-if="!mediaFields.length" class="no-input-card">
            <IconifyIcon icon="lucide:braces" />
            <h3>无资产输入</h3>
            <p>该能力仅使用受控业务参数，运行结果由你确认后再加入项目资产。</p>
          </div>

          <div class="asset-contract">
            <span>资产契约</span>
            <div>
              <strong>输入</strong>
              <p>
                {{
                  application.acceptedAssetTypes
                    .map((type) => assetTypeLabels[type])
                    .join(' · ') || '业务参数'
                }}
              </p>
            </div>
            <IconifyIcon icon="lucide:arrow-down" />
            <div>
              <strong>输出</strong>
              <p>
                {{
                  application.outputAssetTypes
                    .map((type) => assetTypeLabels[type])
                    .join(' · ')
                }}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <ComfyMaskEditor
      v-if="maskEditSourceAssetId"
      v-model:open="outputMaskEditorOpen"
      :on-save="saveOutputMask"
      :src="outputMaskSource"
      :title="outputMaskTitle"
    />
    <Modal
      v-model:open="flowModalOpen"
      :confirm-loading="flowSubmitting"
      :ok-button-props="{
        disabled:
          !flowDestination ||
          flowTargetAssetIndex === undefined ||
          flowTargetLoading,
      }"
      :ok-text="actionOutput?.saved ? '流转并打开' : '加入资产并流转'"
      title="流转到兼容工作流"
      @ok="sendLatestOutput"
    >
      <p class="flow-description">
        <template v-if="actionOutput?.saved">
          当前项目资产会持久化发送到你指定的目标输入位，不下载、不重复上传。
        </template>
        <template v-else>
          当前结果尚未加入资产。确认后会先将它登记为当前项目资产，再持久化发送到你指定的目标输入位。
        </template>
      </p>
      <Select
        v-model:value="flowDestination"
        :options="compatibleDestinations"
        :virtual="false"
        class="w-full"
        placeholder="第一步：选择目标应用"
      />
      <Select
        v-model:value="flowTargetInstanceId"
        :loading="flowTargetLoading"
        :options="flowTargetInstanceOptions"
        class="mt-3 w-full"
        placeholder="第二步：选择已有会话或新建会话"
      />
      <Select
        v-model:value="flowTargetAssetIndex"
        :loading="flowTargetLoading"
        :options="flowTargetOptions"
        class="mt-3 w-full"
        placeholder="第三步：选择目标会话的具体输入位"
      />
      <p
        v-if="!flowTargetLoading && !flowTargetOptions.length"
        class="flow-hint"
      >
        该应用没有与当前结果类型兼容的输入位。
      </p>
    </Modal>
  </main>

  <main v-else class="platform-page">
    <div class="rail-empty">
      <div>
        <h2>应用不存在或已下线</h2>
        <Button type="primary" @click="router.push('/design')">
          返回开始设计
        </Button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.capability-studio {
  --studio-ink: #172027;
  --studio-steel: #65737d;
  --studio-line: #d9dfe2;
  --studio-font-caption: 12px;
  --studio-font-body: 14px;
  --studio-font-label: 13px;

  min-height: 100%;
  color: var(--studio-ink);
  background:
    radial-gradient(
      circle at 72% 0%,
      color-mix(in srgb, var(--cap-accent) 9%, transparent),
      transparent 31rem
    ),
    #eef1f2;
}

.studio-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20px;
  padding: 22px 28px 19px;
  overflow: hidden;
  background: rgb(255 255 255 / 94%);
  border-bottom: 1px solid var(--studio-line);
}

.studio-hero::after {
  position: absolute;
  top: -68px;
  right: 17%;
  width: 240px;
  height: 150px;
  content: '';
  border: 22px solid color-mix(in srgb, var(--cap-accent) 7%, transparent);
  border-radius: 50%;
  transform: rotate(-12deg);
}

.studio-hero__identity,
.studio-hero__actions,
.capability-line,
.capability-line > div,
.deck-heading,
.stage-meta,
.security-strip,
.output-actions {
  display: flex;
  align-items: center;
}

.studio-hero__identity {
  position: relative;
  z-index: 1;
  gap: 14px;
  min-width: 0;
}

.studio-hero__actions {
  z-index: 1;
  gap: 8px;
  align-self: start;
}

.back-button {
  flex: 0 0 auto;
}

.capability-glyph {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 54px;
  height: 54px;
  font-size: 27px;
  color: #fff;
  background: var(--cap-accent);
  border-radius: 17px 7px;
  box-shadow: 0 12px 24px color-mix(in srgb, var(--cap-accent) 24%, transparent);
}

.studio-kicker,
.deck-heading span,
.stage-eyebrow {
  font-family: 'IBM Plex Mono', SFMono-Regular, monospace;
  font-size: var(--studio-font-caption);
  font-weight: 700;
  color: var(--cap-accent);
  letter-spacing: 0.18em;
}

.studio-hero h1 {
  margin: 2px 0 3px;
  font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
  font-size: clamp(22px, 2.2vw, 31px);
  font-weight: 780;
  letter-spacing: -0.04em;
}

.studio-hero__identity p {
  max-width: 720px;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--studio-font-body);
  color: var(--studio-steel);
  white-space: nowrap;
}

.capability-line {
  z-index: 1;
  grid-column: 1 / -1;
  gap: 10px;
  padding: 11px 14px;
  margin-top: 2px;
  background: #f7f8f8;
  border: 1px solid #e1e5e7;
  border-radius: 14px;
}

.capability-line > div {
  gap: 8px;
  min-width: 130px;
}

.capability-line i {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: #68757e;
  background: #fff;
  border: 1px solid #d9dfe2;
  border-radius: 50%;
}

.capability-line .active i {
  color: #fff;
  background: var(--cap-accent);
  border-color: var(--cap-accent);
}

.capability-line span {
  max-width: 230px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--studio-font-label);
  font-weight: 700;
  white-space: nowrap;
}

.capability-line b {
  position: relative;
  flex: 1;
  min-width: 30px;
  height: 1px;
  overflow: hidden;
  background: #cbd2d6;
}

.capability-line em {
  position: absolute;
  inset: 0;
  background: var(--cap-accent);
  opacity: 0.26;
}

.capability-line.running em {
  right: auto;
  width: 22%;
  height: 1px;
  background: var(--cap-accent);
  opacity: 1;
  animation: route-signal 2.4s linear infinite;
}

.studio-grid {
  display: grid;
  grid-template-columns: 340px minmax(430px, 1fr) 330px;
  gap: 12px;
  min-height: calc(100vh - 240px);
  padding: 12px;
}

.control-deck,
.input-deck,
.result-stage {
  min-width: 0;
  overflow: hidden;
  background: rgb(255 255 255 / 96%);
  border: 1px solid var(--studio-line);
  border-radius: 18px;
  box-shadow: 0 14px 40px rgb(37 49 57 / 5%);
}

.control-deck,
.input-deck {
  display: flex;
  flex-direction: column;
}

.deck-heading {
  justify-content: space-between;
  min-height: 67px;
  padding: 14px 17px;
  border-bottom: 1px solid var(--studio-line);
}

.deck-heading h2 {
  margin: 2px 0 0;
  font-size: 17px;
}

.deck-heading > svg {
  font-size: 21px;
  color: var(--cap-accent);
}

.deck-scroll,
.input-scroll {
  flex: 1;
  padding: 17px;
  overflow: auto;
}

.studio-field {
  display: grid;
  gap: 7px;
  margin-bottom: 18px;
}

.studio-field > span {
  font-size: var(--studio-font-label);
  font-weight: 720;
}

.studio-field > span i {
  padding: 2px 6px;
  margin-left: 5px;
  font-size: var(--studio-font-caption);
  font-style: normal;
  color: var(--cap-accent);
  background: color-mix(in srgb, var(--cap-accent) 9%, white);
  border-radius: 99px;
}

.studio-field > small {
  font-size: var(--studio-font-caption);
  line-height: 1.5;
  color: var(--studio-steel);
}

.studio-field :deep(.ant-input),
.studio-field :deep(.ant-input-number),
.studio-field :deep(.ant-select-selector) {
  border-color: #d5dbde;
  border-radius: 10px;
}

.studio-field :deep(textarea.ant-input) {
  line-height: 1.7;
  resize: vertical;
}

.studio-field :deep(textarea.json-field) {
  font-family: 'IBM Plex Mono', SFMono-Regular, monospace;
  font-size: var(--studio-font-caption);
}

.advanced-deck {
  padding: 12px;
  margin: 8px 0 18px;
  background: #f5f7f7;
  border: 1px solid #dfe4e6;
  border-radius: 13px;
}

.advanced-deck summary {
  display: flex;
  justify-content: space-between;
  font-size: var(--studio-font-label);
  font-weight: 750;
  cursor: pointer;
}

.advanced-deck[open] summary {
  padding-bottom: 10px;
  border-bottom: 1px solid #dfe4e6;
}

.advanced-deck summary small {
  color: var(--studio-steel);
}

.advanced-fields {
  max-height: min(48vh, 520px);
  padding: 12px 8px 0 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: #b8c0c4 transparent;
  scrollbar-width: thin;
}

.advanced-fields .studio-field:last-child {
  margin-bottom: 0;
}

.seed-field {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 7px;
}

.parameter-empty,
.no-input-card {
  padding: 20px;
  margin-bottom: 18px;
  color: var(--studio-steel);
  text-align: center;
  background: #f6f8f8;
  border: 1px dashed #cfd6d9;
  border-radius: 14px;
}

.parameter-empty svg,
.no-input-card svg {
  font-size: 28px;
  color: var(--cap-accent);
}

.parameter-empty p,
.no-input-card p {
  margin: 8px 0 0;
  font-size: var(--studio-font-body);
  line-height: 1.7;
}

.no-input-card h3 {
  margin: 8px 0 0;
  font-size: 14px;
}

.execution-facts {
  overflow: hidden;
  border: 1px solid var(--studio-line);
  border-radius: 12px;
}

.execution-facts > div {
  display: flex;
  justify-content: space-between;
  padding: 10px 11px;
  border-bottom: 1px solid var(--studio-line);
}

.execution-facts > div:last-child {
  border-bottom: 0;
}

.execution-facts span,
.execution-facts strong {
  max-width: 175px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--studio-font-caption);
  white-space: nowrap;
}

.execution-facts span {
  color: var(--studio-steel);
}

.result-stage {
  display: flex;
  flex-direction: column;
  padding: 15px;
  background: #f6f8f8;
}

.stage-meta {
  justify-content: space-between;
  padding: 0 2px 11px;
  font-size: var(--studio-font-caption);
  color: var(--studio-steel);
}

.stage-meta i {
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 6px;
  background: #c08a38;
  border-radius: 50%;
}

.stage-meta i.online {
  background: #39705a;
  box-shadow: 0 0 0 4px rgb(57 112 90 / 10%);
}

.stage-viewport {
  position: relative;
  display: grid;
  flex: 1;
  min-height: 520px;
  overflow: hidden;
  background:
    linear-gradient(rgb(255 255 255 / 88%), rgb(255 255 255 / 96%)),
    repeating-linear-gradient(0deg, #dfe4e6 0 1px, transparent 1px 32px),
    repeating-linear-gradient(90deg, #dfe4e6 0 1px, transparent 1px 32px);
  border: 1px solid #d7dde0;
  border-radius: 16px;
}

.conversation-viewport {
  display: block;
  padding: 28px 22px;
  overflow: auto;
}

.workflow-conversation {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 18px;
  width: min(100%, 1180px);
  margin: 0 auto;
}

.stage-viewport::before,
.stage-viewport::after {
  position: absolute;
  width: 28px;
  height: 28px;
  content: '';
  border-color: var(--cap-accent);
  opacity: 0.38;
}

.stage-viewport::before {
  top: 14px;
  left: 14px;
  border-top: 2px solid;
  border-left: 2px solid;
}

.stage-viewport::after {
  right: 14px;
  bottom: 14px;
  border-right: 2px solid;
  border-bottom: 2px solid;
}

.stage-state {
  place-self: center center;
  width: min(510px, 84%);
  text-align: center;
}

.stage-state h2,
.output-caption h2 {
  margin: 13px 0 8px;
  font-size: clamp(20px, 2vw, 27px);
  letter-spacing: -0.035em;
}

.stage-state p,
.output-caption p {
  font-size: var(--studio-font-body);
  line-height: 1.75;
  color: var(--studio-steel);
}

.ready-orbit {
  position: relative;
  display: grid;
  place-items: center;
  width: 124px;
  height: 124px;
  margin: 0 auto 20px;
  border: 1px solid #d4dade;
  border-radius: 50%;
}

.ready-orbit::before {
  position: absolute;
  inset: 13px;
  content: '';
  border: 1px dashed color-mix(in srgb, var(--cap-accent) 55%, #ccd3d6);
  border-radius: 50%;
  animation: orbit 18s linear infinite;
}

.ready-orbit svg {
  z-index: 1;
  padding: 17px;
  font-size: 62px;
  color: #fff;
  background: var(--cap-accent);
  border-radius: 22px 9px;
}

.ready-orbit span {
  position: absolute;
  top: 50%;
  width: 42px;
  height: 1px;
  background: #bcc6ca;
}

.ready-orbit span:first-child {
  right: 100%;
}

.ready-orbit span:last-child {
  left: 100%;
}

.rail-pulse {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 24px;
}

.rail-pulse i {
  width: 8px;
  height: 42px;
  background: var(--cap-accent);
  border-radius: 999px;
  animation: pulse-bar 1.1s ease-in-out infinite alternate;
}

.rail-pulse i:nth-child(2) {
  animation-delay: 0.15s;
}

.rail-pulse i:nth-child(3) {
  animation-delay: 0.3s;
}

.rail-pulse i:nth-child(4) {
  animation-delay: 0.45s;
}

.error-state > svg {
  display: block;
  margin: 0 auto 14px;
  font-size: 45px;
  color: #b91c32;
}

.error-state code {
  display: block;
  margin: 0 0 18px;
  font-size: var(--studio-font-caption);
  color: #b91c32;
}

.stage-output {
  display: grid;
  grid-template-rows: auto auto auto;
  gap: 18px;
  place-self: center;
  width: calc(100% - 44px);
  height: auto;
  margin: 22px;
}

.output-selector {
  display: flex;
  grid-row: 1;
  gap: 6px;
  overflow-x: auto;
}

.output-selector button {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 6px 10px;
  font-size: var(--studio-font-caption);
  color: #66737b;
  white-space: nowrap;
  background: #fff;
  border: 1px solid #d8dfe2;
  border-radius: 999px;
}

.output-selector button.active {
  color: var(--cap-accent);
  border-color: var(--cap-accent);
}

.output-visual {
  position: relative;
  display: grid;
  grid-row: 2;
  place-items: center;
  min-height: 280px;
  overflow: hidden;
  color: #fff;
  background: #1d272d;
  border-radius: 14px;
}

.output-mask-trigger {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: #fff;
  cursor: pointer;
  background: rgb(13 20 24 / 75%);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 999px;
  backdrop-filter: blur(8px);
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.output-mask-trigger:hover {
  background: rgb(13 20 24 / 94%);
  transform: scale(1.08);
}

.output-visual img {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: min(68vh, 720px);
  object-fit: contain;
}

.output-visual.output-image {
  width: fit-content;
  max-width: 100%;
  min-height: 0;
  margin: 0 auto;
  background: transparent;
  box-shadow: 0 10px 34px rgb(24 34 40 / 14%);
}

.output-visual pre {
  width: 100%;
  height: 100%;
  padding: 24px;
  margin: 0;
  overflow: auto;
  font-family: 'Noto Sans SC', sans-serif;
  font-size: 12px;
  line-height: 1.85;
  color: #e8edef;
  white-space: pre-wrap;
}

.output-icon {
  display: grid;
  place-items: center;
}

.output-icon svg {
  font-size: 78px;
  color: color-mix(in srgb, var(--cap-accent) 75%, white);
}

.output-icon span {
  margin-top: 12px;
  font-size: var(--studio-font-caption);
  letter-spacing: 0.12em;
}

.output-caption {
  grid-row: 3;
  padding: 0 4px 5px;
}

.output-caption h2 {
  font-size: 19px;
}

.output-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.flow-description {
  margin-bottom: 14px;
  color: #6d7981;
}

.flow-hint {
  margin: 10px 0 0;
  font-size: var(--studio-font-label);
  color: #b45309;
}

.security-strip {
  gap: 10px;
  padding: 11px 13px;
  margin-top: 12px;
  font-size: var(--studio-font-caption);
  color: var(--studio-steel);
  background: #fff;
  border: 1px solid #dce2e5;
  border-radius: 12px;
}

.security-strip svg {
  flex: 0 0 auto;
  font-size: 18px;
  color: #39705a;
}

.security-strip p {
  margin: 0;
}

.input-scroll {
  display: grid;
  gap: 13px;
  align-content: start;
  background: #f5f7f7;
}

.asset-contract {
  padding: 14px;
  background: #172027;
  border-radius: 15px;
}

.asset-contract > span {
  font-family: 'IBM Plex Mono', monospace;
  font-size: var(--studio-font-caption);
  color: #9ba7ae;
  letter-spacing: 0.16em;
}

.asset-contract div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  color: #fff;
}

.asset-contract strong,
.asset-contract p {
  margin: 0;
  font-size: var(--studio-font-label);
}

.asset-contract p {
  color: #b7c0c5;
}

.asset-contract > svg {
  display: block;
  margin: 8px auto -2px;
  color: var(--cap-accent);
}

@keyframes route-signal {
  from {
    left: -22%;
  }

  to {
    left: 100%;
  }
}

@keyframes orbit {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse-bar {
  to {
    height: 15px;
    opacity: 0.38;
  }
}

@media (prefers-reduced-motion: reduce) {
  .capability-line em,
  .ready-orbit::before,
  .rail-pulse i {
    animation: none;
  }
}

@media (max-width: 1280px) {
  .studio-grid {
    grid-template-columns: 320px minmax(420px, 1fr);
  }

  .input-deck {
    grid-column: 1 / -1;
  }

  .input-scroll {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .studio-hero {
    grid-template-columns: 1fr;
    padding: 18px;
  }

  .studio-hero__actions {
    flex-wrap: wrap;
  }

  .capability-line {
    overflow-x: auto;
  }

  .capability-line b {
    flex: 0 0 38px;
  }

  .studio-grid {
    display: flex;
    flex-direction: column;
    padding: 8px;
  }

  .result-stage {
    order: -1;
  }

  .input-scroll {
    grid-template-columns: 1fr;
  }

  .stage-viewport {
    min-height: 430px;
  }
}

@media (max-width: 520px) {
  .studio-hero__identity {
    align-items: flex-start;
  }

  .capability-glyph {
    width: 45px;
    height: 45px;
  }

  .studio-hero__identity p {
    white-space: normal;
  }

  .studio-hero__actions .ant-btn {
    flex: 1;
  }

  .stage-output {
    width: calc(100% - 24px);
    height: calc(100% - 24px);
    margin: 12px;
  }
}
</style>
