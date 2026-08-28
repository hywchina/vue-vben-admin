<script lang="ts" setup>
import type { DesignImageResultActionKey } from '#/modules/platform/design-result-actions';
import type {
  CapabilityField,
  PlatformJob,
  PlatformJobInput,
  PlatformJobOutput,
} from '#/modules/platform/types';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, message, Modal, Textarea, Tooltip } from 'ant-design-vue';

import { getAssetDownloadApi, getAssetPreviewApi } from '#/api';
import { assetTypeLabels } from '#/modules/platform/asset-types';
import {
  designImageResultActions,
  designResultActionApplicationKeys,
} from '#/modules/platform/design-result-actions';
import { copyTextToClipboard } from '#/utils/copy-text';

import ComfyMaskIcon from './comfy-mask-icon.vue';
import ImageComparisonSlider from './image-comparison-slider.vue';
import ImageLightbox from './image-lightbox.vue';
import Model3dViewer from './model3d-viewer.vue';
import PlatformMarkdown from './platform-markdown.vue';
import StatusPill from './status-pill.vue';

const props = defineProps<{
  accent: string;
  availableApplicationKeys?: string[];
  fields: CapabilityField[];
  flowLabel?: string;
  job: PlatformJob;
  round: number;
  supportsImageComparison: boolean;
}>();

const emit = defineEmits<{
  businessAction: [
    action:
      | 'environment'
      | 'mark'
      | 'multi-angle'
      | 'multi-image'
      | 'three-d'
      | 'understand'
      | 'upscale',
    output: PlatformJobOutput,
    mode: 'cabin' | 'cmf' | 'component',
  ];
  download: [output: PlatformJobOutput];
  editInput: [input: PlatformJobInput, previewUrl: string];
  editRerun: [job: PlatformJob, parameterKey: string, value: string];
  flow: [output: PlatformJobOutput];
  mask: [output: PlatformJobOutput, previewUrl: string];
  rerun: [job: PlatformJob];
  save: [output: PlatformJobOutput];
}>();

const activeOutputAssetId = ref('');
const comparisonMode = ref(true);
const inputDetailsOpen = ref(false);
const editingPrompt = ref(false);
const editedPrompt = ref('');
const annotationLightboxOpen = ref(false);
const annotationLightboxTitle = ref('');
const annotationLightboxUrl = ref('');
const outputLightboxOpen = ref(false);
const previewUrls = reactive<Record<string, string>>({});
const modelUrls = reactive<Record<string, string>>({});
const textContents = reactive<Record<string, string>>({});

const activeOutput = computed(
  () =>
    props.job.outputs.find(
      (output) => output.assetId === activeOutputAssetId.value,
    ) ?? props.job.outputs[0],
);
const imageOutputs = computed(() =>
  props.job.outputs.filter(
    (output) => output.kind === 'image' && previewUrls[output.assetId],
  ),
);
const visibleImageOutputs = computed(() => imageOutputs.value.slice(0, 3));
const activeImageOutputIndex = computed(() =>
  imageOutputs.value.findIndex(
    (output) => output.assetId === activeOutput.value?.assetId,
  ),
);
const firstImageInput = computed(() =>
  props.job.inputs.find((input) => input.kind === 'image'),
);
const firstImageInputField = computed(() =>
  props.fields.find(
    (field) => field.assetIndex === firstImageInput.value?.position,
  ),
);
const comparesMaskedInput = computed(
  () =>
    firstImageInputField.value?.type === 'mask' ||
    (!firstImageInputField.value &&
      Boolean(firstImageInput.value?.derivedFromAssetId)),
);
const comparesRegionInput = computed(
  () =>
    firstImageInputField.value?.type === 'region' ||
    Boolean(firstImageInput.value?.annotationAssetId),
);
const requestsImageComparison = computed(
  () => props.supportsImageComparison || comparesRegionInput.value,
);
const comparisonSourceAssetId = computed(() => {
  const input = firstImageInput.value;
  if (!input) return undefined;
  if (comparesMaskedInput.value) return input.derivedFromAssetId;
  return input.assetId;
});
const missingMaskComparisonSource = computed(
  () =>
    requestsImageComparison.value &&
    activeOutput.value?.kind === 'image' &&
    comparesMaskedInput.value &&
    !firstImageInput.value?.derivedFromAssetId,
);
const comparisonAvailable = computed(
  () =>
    requestsImageComparison.value &&
    activeOutput.value?.kind === 'image' &&
    Boolean(
      comparisonSourceAssetId.value &&
      previewUrls[comparisonSourceAssetId.value] &&
      previewUrls[activeOutput.value.assetId],
    ),
);
const promptEntry = computed(() => {
  const preferred = props.fields.find(
    (field) =>
      (field.key === 'prompt' || field.type === 'textarea') &&
      String(props.job.parameters[field.key] ?? '').trim(),
  );
  if (!preferred) return undefined;
  return {
    key: preferred.key,
    value: String(props.job.parameters[preferred.key]),
  };
});
const parameterEntries = computed(() => {
  const labels = new Map(props.fields.map((field) => [field.key, field.label]));
  return Object.entries(props.job.parameters)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      label: labels.get(key) ?? key,
      value: formatValue(value),
    }));
});
const isActive = computed(() =>
  ['cancelling', 'queued', 'running'].includes(props.job.status),
);
const businessResultMode = computed(() => {
  const mode = props.job.designMode;
  return mode === 'cabin' || mode === 'cmf' || mode === 'component'
    ? mode
    : undefined;
});
const isBusinessImageResult = computed(() =>
  Boolean(businessResultMode.value && activeOutput.value?.kind === 'image'),
);
const resultActions = computed(() => {
  const mode = businessResultMode.value;
  return mode ? designImageResultActions(mode) : [];
});

function resultActionDisabled(action: DesignImageResultActionKey) {
  if (action === 'save') return Boolean(activeOutput.value?.saved);
  if (action === 'mask') {
    return !activeOutput.value || !previewUrls[activeOutput.value.assetId];
  }
  const applicationKey = designResultActionApplicationKeys[action];
  return Boolean(
    applicationKey &&
    props.availableApplicationKeys &&
    !props.availableApplicationKeys.includes(applicationKey),
  );
}

function triggerResultAction(action: DesignImageResultActionKey) {
  const output = activeOutput.value;
  if (!output || resultActionDisabled(action)) return;
  if (action === 'download') return emit('download', output);
  if (action === 'save') return emit('save', output);
  if (action === 'rerun') return emit('rerun', props.job);
  if (action === 'mask') {
    const previewUrl = previewUrls[output.assetId];
    if (previewUrl) emit('mask', output, previewUrl);
    return;
  }
  const mode = businessResultMode.value;
  if (mode) emit('businessAction', action, output, mode);
}

function formatValue(value: unknown) {
  if (typeof value === 'boolean') return value ? '开启' : '关闭';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value));
}

function modelFormat(output: PlatformJobOutput) {
  const extension = output.name.toLowerCase().match(/\.([a-z\d]+)$/)?.[1];
  if (extension) return extension;
  const mimeFormats: Record<string, string> = {
    'application/sla': 'stl',
    'model/gltf+json': 'gltf',
    'model/gltf-binary': 'glb',
    'model/obj': 'obj',
    'model/stl': 'stl',
  };
  return mimeFormats[output.mimeType.toLowerCase()] ?? '';
}

function inputFieldLabel(position: number) {
  return (
    props.fields.find((field) => field.assetIndex === position)?.label ??
    `输入 ${position + 1}`
  );
}

function startEditingPrompt() {
  if (!promptEntry.value) return;
  editedPrompt.value = promptEntry.value.value;
  editingPrompt.value = true;
}

function submitEditedPrompt() {
  const value = editedPrompt.value.trim();
  const parameterKey = promptEntry.value?.key;
  if (!parameterKey || !value) return;
  editingPrompt.value = false;
  emit('editRerun', props.job, parameterKey, value);
}

async function copyText(content: string, successMessage: string) {
  const copied = await copyTextToClipboard(content);
  if (copied) {
    message.success(successMessage);
    return;
  }
  message.error('复制失败，请检查浏览器剪贴板权限后重试');
}

async function copyInput() {
  const content =
    promptEntry.value?.value ?? JSON.stringify(props.job.parameters, null, 2);
  await copyText(content, '本轮输入已复制');
}

async function copyOutput(output: PlatformJobOutput) {
  const content = textContents[output.assetId];
  if (!content) return;
  await copyText(content, 'Markdown 已复制');
}

async function loadAssetContent(assetId: string, kind: string) {
  try {
    if (kind === 'image') {
      const preview = await getAssetPreviewApi(assetId);
      if (preview.mode === 'url') previewUrls[assetId] = preview.url;
      return;
    }
    if (kind === 'text') {
      const result = await getAssetDownloadApi(assetId);
      if (result.mode === 'inline') {
        textContents[assetId] = result.content;
        return;
      }
      const response = await fetch(result.url);
      textContents[assetId] = await response.text();
      return;
    }
    if (kind === 'model3d') {
      const preview = await getAssetPreviewApi(assetId);
      if (preview.mode === 'url') modelUrls[assetId] = preview.url;
    }
  } catch {
    // 资产可能已被软删除；仍保留任务快照名称与血缘信息。
  }
}

async function loadPreviews() {
  const comparisonSource = comparisonSourceAssetId.value
    ? [{ assetId: comparisonSourceAssetId.value, kind: 'image' }]
    : [];
  await Promise.all(
    [
      ...props.job.inputs,
      ...props.job.inputs.flatMap((input) =>
        input.annotationAssetId
          ? [{ assetId: input.annotationAssetId, kind: 'image' }]
          : [],
      ),
      ...props.job.outputs,
      ...comparisonSource,
    ].map((asset) => loadAssetContent(asset.assetId, asset.kind)),
  );
}

function openAnnotation(input: PlatformJobInput) {
  if (!input.annotationAssetId) return;
  const url = previewUrls[input.annotationAssetId];
  if (!url) return;
  annotationLightboxTitle.value = input.annotationName || '分区标记图';
  annotationLightboxUrl.value = url;
  annotationLightboxOpen.value = true;
}

function openInputImage(input: PlatformJobInput) {
  const url = previewUrls[input.assetId];
  if (!url) return;
  annotationLightboxTitle.value = input.name || '本轮输入图片';
  annotationLightboxUrl.value = url;
  annotationLightboxOpen.value = true;
}

function openOutputImage(output: PlatformJobOutput) {
  activeOutputAssetId.value = output.assetId;
  outputLightboxOpen.value = true;
}

function moveOutputImage(offset: number) {
  const nextIndex = activeImageOutputIndex.value + offset;
  const nextOutput = imageOutputs.value[nextIndex];
  if (nextOutput) activeOutputAssetId.value = nextOutput.assetId;
}

watch(
  () => props.job.outputs.map((output) => output.assetId).join('|'),
  () => {
    if (
      !props.job.outputs.some(
        (output) => output.assetId === activeOutputAssetId.value,
      )
    ) {
      activeOutputAssetId.value = props.job.outputs[0]?.assetId ?? '';
    }
    void loadPreviews();
  },
  { immediate: true },
);
onMounted(() => void loadPreviews());
</script>

<template>
  <article
    class="workflow-round"
    :class="{ 'workflow-round--active': isActive }"
    :data-job-id="job.id"
    :style="{ '--round-accent': accent }"
  >
    <header class="round-heading">
      <span>第 {{ round }} 轮</span>
      <time :datetime="job.createdAt">{{ formatDate(job.createdAt) }}</time>
      <StatusPill :status="job.status" />
    </header>

    <section class="round-input">
      <div class="round-input__cluster">
        <div class="round-input__message">
          <div
            v-if="job.inputs.length"
            class="round-input__visible-assets"
            data-testid="round-visible-input-assets"
          >
            <template v-for="input in job.inputs" :key="input.assetId">
              <article
                :class="{
                  'is-image':
                    input.kind === 'image' && previewUrls[input.assetId],
                }"
                :title="`${inputFieldLabel(input.position)}：${input.name || input.assetId}`"
              >
                <button
                  v-if="previewUrls[input.assetId]"
                  :aria-label="`放大查看输入图片：${input.name || inputFieldLabel(input.position)}`"
                  class="round-input-image"
                  type="button"
                  @click="openInputImage(input)"
                >
                  <img :alt="input.name" :src="previewUrls[input.assetId]" />
                  <span
                    v-if="input.annotationAssetId"
                    class="input-image-label"
                  >
                    标记前原图
                  </span>
                </button>
                <Tooltip title="编辑图片遮罩">
                  <button
                    :aria-label="`编辑输入图片遮罩：${input.name || inputFieldLabel(input.position)}`"
                    class="round-input-mask-trigger"
                    type="button"
                    @click.stop="
                      emit('editInput', input, previewUrls[input.assetId]!)
                    "
                  >
                    <ComfyMaskIcon :size="16" />
                  </button>
                </Tooltip>
                <template v-if="!previewUrls[input.assetId]">
                  <span>
                    <IconifyIcon icon="lucide:file-input" />
                    {{ assetTypeLabels[input.kind] }}
                  </span>
                  <small>{{ inputFieldLabel(input.position) }}</small>
                  <strong>{{ input.name || input.assetId }}</strong>
                </template>
              </article>
              <article
                v-if="
                  input.annotationAssetId &&
                  previewUrls[input.annotationAssetId]
                "
                :key="`${input.assetId}:annotation`"
                class="is-image"
                :title="input.annotationName || '分区标记图'"
              >
                <button
                  :aria-label="`查看分区标记图：${input.annotationName || input.name}`"
                  class="round-input-image"
                  type="button"
                  @click="openAnnotation(input)"
                >
                  <img
                    :alt="input.annotationName || '分区标记图'"
                    :src="previewUrls[input.annotationAssetId]"
                  />
                  <span class="input-image-label">分区标记图</span>
                  <IconifyIcon icon="lucide:maximize-2" />
                </button>
              </article>
            </template>
          </div>
          <div v-if="!editingPrompt" class="round-input__bubble">
            <p>
              {{ promptEntry?.value ?? '使用当前参数和输入素材执行工作流。' }}
            </p>
          </div>
          <div v-else class="round-input__editor">
            <Textarea
              v-model:value="editedPrompt"
              :auto-size="{ minRows: 3, maxRows: 8 }"
              :maxlength="6000"
              @press-enter="
                !$event.shiftKey &&
                (submitEditedPrompt(), $event.preventDefault())
              "
            />
            <div>
              <Button @click="editingPrompt = false">取消</Button>
              <Button
                :disabled="!editedPrompt.trim()"
                type="primary"
                @click="submitEditedPrompt"
              >
                发送
              </Button>
            </div>
          </div>
        </div>
        <div class="round-input-actions" data-testid="round-input-actions">
          <Tooltip title="复制本轮输入">
            <button aria-label="复制本轮输入" type="button" @click="copyInput">
              <IconifyIcon icon="lucide:copy" />
            </button>
          </Tooltip>
          <Tooltip v-if="promptEntry" title="修改并重新发送本轮输入">
            <button
              aria-label="修改并重新发送本轮输入"
              type="button"
              @click="startEditingPrompt"
            >
              <IconifyIcon icon="lucide:pencil" />
            </button>
          </Tooltip>
          <Tooltip title="查看本轮参数">
            <button
              aria-label="查看本轮参数"
              type="button"
              @click="inputDetailsOpen = true"
            >
              <IconifyIcon icon="lucide:ellipsis" />
            </button>
          </Tooltip>
        </div>
      </div>
      <Modal
        v-model:open="inputDetailsOpen"
        :footer="null"
        title="本轮完整输入"
        width="720px"
      >
        <div class="round-input-details__body">
          <div v-if="job.inputs.length" class="round-input-assets">
            <template v-for="input in job.inputs" :key="input.assetId">
              <div>
                <img
                  v-if="previewUrls[input.assetId]"
                  :alt="input.name"
                  :src="previewUrls[input.assetId]"
                />
                <IconifyIcon v-else icon="lucide:file-input" />
                <span>
                  {{
                    input.annotationAssetId
                      ? '标记前原图'
                      : `输入 ${input.position + 1}`
                  }}
                </span>
                <strong>{{ input.name || input.assetId }}</strong>
              </div>
              <div
                v-if="input.annotationAssetId"
                :key="`${input.assetId}:annotation`"
              >
                <img
                  v-if="previewUrls[input.annotationAssetId]"
                  :alt="input.annotationName || '分区标记图'"
                  :src="previewUrls[input.annotationAssetId]"
                />
                <IconifyIcon v-else icon="lucide:file-input" />
                <span>分区标记图</span>
                <strong>
                  {{ input.annotationName || input.annotationAssetId }}
                </strong>
              </div>
            </template>
          </div>
          <dl v-if="parameterEntries.length" class="round-parameters">
            <div v-for="entry in parameterEntries" :key="entry.key">
              <dt>{{ entry.label }}</dt>
              <dd>{{ entry.value }}</dd>
            </div>
          </dl>
        </div>
      </Modal>
    </section>

    <section class="round-response">
      <div
        v-if="isActive"
        :aria-label="job.status === 'cancelling' ? '正在停止' : '正在生成'"
        class="round-running"
        role="status"
      >
        <div aria-hidden="true" class="round-running__icon">
          <i></i>
          <i></i>
          <i></i>
        </div>
        <span v-if="job.status === 'cancelling'">正在停止</span>
      </div>

      <div v-else-if="job.status === 'failed'" class="round-error">
        <IconifyIcon icon="lucide:circle-alert" />
        <div>
          <strong>本轮执行失败</strong>
          <p>{{ job.error?.message ?? job.stage }}</p>
          <code>{{ job.error?.code ?? 'JOB_FAILED' }}</code>
        </div>
        <Tooltip title="复用本轮输入">
          <button
            aria-label="复用本轮输入"
            class="round-action-button"
            type="button"
            @click="emit('rerun', job)"
          >
            <IconifyIcon icon="lucide:refresh-cw" />
          </button>
        </Tooltip>
      </div>

      <div v-else-if="activeOutput" class="round-output">
        <div class="round-output__toolbar">
          <div
            v-if="job.outputs.length > 1 && imageOutputs.length <= 1"
            class="round-output-selector"
          >
            <button
              v-for="(output, index) in job.outputs"
              :key="output.assetId"
              :class="{ active: output.assetId === activeOutput.assetId }"
              type="button"
              @click="activeOutputAssetId = output.assetId"
            >
              结果 {{ index + 1 }}
            </button>
          </div>
          <div v-if="comparisonAvailable" class="round-view-switch">
            <button
              :class="{ active: comparisonMode }"
              type="button"
              @click="comparisonMode = true"
            >
              <IconifyIcon icon="lucide:columns-2" />
              对比
            </button>
            <button
              :class="{ active: !comparisonMode }"
              type="button"
              @click="comparisonMode = false"
            >
              <IconifyIcon icon="lucide:image" />
              结果
            </button>
          </div>
          <span
            v-else-if="missingMaskComparisonSource"
            class="round-comparison-unavailable"
          >
            历史任务未记录遮罩前原图，无法准确对比
          </span>
        </div>

        <div
          v-if="
            comparisonAvailable &&
            comparisonMode &&
            comparisonSourceAssetId &&
            previewUrls[activeOutput.assetId]
          "
          class="round-comparison-shell"
        >
          <ImageComparisonSlider
            :after-label="
              comparesMaskedInput
                ? '遮罩生成结果'
                : comparesRegionInput
                  ? '分区生成结果'
                  : '生成结果'
            "
            :after-src="previewUrls[activeOutput.assetId]!"
            :before-label="
              comparesMaskedInput
                ? '遮罩前原图'
                : comparesRegionInput
                  ? '标记前原图'
                  : '原始输入'
            "
            :before-src="previewUrls[comparisonSourceAssetId]!"
          />
        </div>
        <div
          v-else-if="imageOutputs.length > 1"
          :data-count="Math.min(imageOutputs.length, 3)"
          class="round-output-gallery"
        >
          <button
            v-for="(output, index) in visibleImageOutputs"
            :key="output.assetId"
            :aria-label="`全屏查看${output.name || `结果 ${index + 1}`}`"
            :class="{ active: output.assetId === activeOutput.assetId }"
            type="button"
            @click="openOutputImage(output)"
          >
            <img :alt="output.name" :src="previewUrls[output.assetId]" />
            <span
              v-if="index === 2 && imageOutputs.length > 3"
              class="round-output-gallery__more"
            >
              +{{ imageOutputs.length - 2 }}
            </span>
          </button>
        </div>
        <div
          v-else
          class="round-output-visual"
          :class="`output-${activeOutput.kind}`"
        >
          <Model3dViewer
            v-if="
              activeOutput.kind === 'model3d' && modelUrls[activeOutput.assetId]
            "
            :format="modelFormat(activeOutput)"
            :name="activeOutput.name"
            :url="modelUrls[activeOutput.assetId]!"
          />
          <button
            v-else-if="previewUrls[activeOutput.assetId]"
            :aria-label="`全屏查看${activeOutput.name}`"
            class="round-output-image-open"
            type="button"
            @click="openOutputImage(activeOutput)"
          >
            <img
              :alt="activeOutput.name"
              :src="previewUrls[activeOutput.assetId]"
            />
          </button>
          <PlatformMarkdown
            v-else-if="textContents[activeOutput.assetId]"
            :content="textContents[activeOutput.assetId]!"
          />
          <div v-else class="round-output-icon">
            <IconifyIcon
              :icon="
                activeOutput.kind === 'model3d' ? 'lucide:box' : 'lucide:file'
              "
            />
            <span>{{ assetTypeLabels[activeOutput.kind] }}</span>
          </div>
          <button
            v-if="
              !isBusinessImageResult &&
              activeOutput.kind === 'image' &&
              previewUrls[activeOutput.assetId]
            "
            aria-label="打开遮罩编辑器"
            class="round-mask-trigger"
            title="打开遮罩编辑器"
            type="button"
            @click.stop="
              emit('mask', activeOutput, previewUrls[activeOutput.assetId]!)
            "
          >
            <ComfyMaskIcon :size="17" />
          </button>
        </div>

        <footer class="round-output__footer">
          <div
            v-if="isBusinessImageResult"
            class="round-output-actions round-output-actions--business"
            :data-testid="`${businessResultMode}-result-actions`"
          >
            <button
              v-for="action in resultActions"
              :key="action.key"
              :aria-label="
                action.key === 'save' && activeOutput.saved
                  ? '已添加至资产中心'
                  : action.label
              "
              class="round-action-button"
              :disabled="resultActionDisabled(action.key)"
              :title="
                resultActionDisabled(action.key) && action.key !== 'save'
                  ? `${action.label}能力未配置或不可用`
                  : action.label
              "
              type="button"
              @click="triggerResultAction(action.key)"
            >
              <ComfyMaskIcon v-if="action.key === 'mask'" :size="16" />
              <IconifyIcon
                v-else
                :icon="
                  action.key === 'save' && activeOutput.saved
                    ? 'lucide:check'
                    : action.icon
                "
              />
              <span>{{ action.label }}</span>
            </button>
          </div>
          <div v-else class="round-output-actions">
            <Tooltip
              v-if="
                activeOutput.kind === 'image' &&
                previewUrls[activeOutput.assetId]
              "
              title="局部重绘"
            >
              <button
                aria-label="局部重绘"
                class="round-action-button"
                type="button"
                @click="
                  emit('mask', activeOutput, previewUrls[activeOutput.assetId]!)
                "
              >
                <ComfyMaskIcon :size="16" />
              </button>
            </Tooltip>
            <Tooltip v-if="activeOutput.kind === 'text'" title="复制 Markdown">
              <button
                aria-label="复制 Markdown"
                class="round-action-button"
                :disabled="!textContents[activeOutput.assetId]"
                type="button"
                @click="copyOutput(activeOutput)"
              >
                <IconifyIcon icon="lucide:copy" />
              </button>
            </Tooltip>
            <Tooltip title="下载或查看结果">
              <button
                aria-label="下载或查看结果"
                class="round-action-button"
                type="button"
                @click="emit('download', activeOutput)"
              >
                <IconifyIcon icon="lucide:download" />
              </button>
            </Tooltip>
            <Tooltip :title="activeOutput.saved ? '已加入资产' : '加入资产'">
              <button
                :aria-label="activeOutput.saved ? '已加入资产' : '加入资产'"
                class="round-action-button"
                :disabled="activeOutput.saved"
                type="button"
                @click="emit('save', activeOutput)"
              >
                <IconifyIcon
                  :icon="
                    activeOutput.saved ? 'lucide:check' : 'lucide:folder-plus'
                  "
                />
              </button>
            </Tooltip>
            <Tooltip :title="flowLabel ?? '流转到工作流'">
              <button
                :aria-label="flowLabel ?? '流转到工作流'"
                class="round-action-button"
                type="button"
                @click="emit('flow', activeOutput)"
              >
                <IconifyIcon icon="lucide:send" />
              </button>
            </Tooltip>
            <Tooltip title="复用本轮再运行">
              <button
                aria-label="复用本轮再运行"
                class="round-action-button round-action-button--accent"
                type="button"
                @click="emit('rerun', job)"
              >
                <IconifyIcon icon="lucide:refresh-cw" />
              </button>
            </Tooltip>
          </div>
        </footer>
      </div>

      <div v-else class="round-empty-output">
        <IconifyIcon icon="lucide:ban" />
        <span>
          {{ job.status === 'cancelled' ? '本轮任务已取消' : job.stage }}
        </span>
      </div>
    </section>
    <ImageLightbox
      v-model:open="annotationLightboxOpen"
      :title="annotationLightboxTitle"
      :url="annotationLightboxUrl"
    />
    <ImageLightbox
      v-model:open="outputLightboxOpen"
      :has-next="activeImageOutputIndex < imageOutputs.length - 1"
      :has-previous="activeImageOutputIndex > 0"
      :title="activeOutput?.name ?? '生成结果'"
      :url="
        activeOutput?.kind === 'image'
          ? previewUrls[activeOutput.assetId]
          : undefined
      "
      @next="moveOutputImage(1)"
      @previous="moveOutputImage(-1)"
    />
  </article>
</template>

<style scoped>
.workflow-round {
  display: grid;
  gap: 15px;
  padding: 18px;
  background: rgb(255 255 255 / 94%);
  border: 1px solid #d9e0e3;
  border-radius: 15px;
  box-shadow: 0 8px 26px rgb(33 46 54 / 5%);
}

.workflow-round--active {
  border-color: color-mix(in srgb, var(--round-accent) 46%, #d9e0e3);
  box-shadow: 0 10px 28px
    color-mix(in srgb, var(--round-accent) 9%, transparent);
}

.round-heading,
.round-input,
.round-output__toolbar,
.round-output__footer,
.round-output-actions,
.round-view-switch,
.round-output-selector {
  display: flex;
  align-items: center;
}

.round-heading {
  gap: 9px;
  font-size: 12px;
  color: #748087;
}

.round-heading > span {
  font-weight: 800;
  color: var(--round-accent);
}

.round-input {
  flex-direction: column;
  align-items: flex-end;
}

.round-input__cluster {
  display: grid;
  gap: 5px;
  justify-items: end;
  max-width: min(82%, 760px);
}

.round-input__message {
  display: grid;
  gap: 8px;
  justify-items: end;
  max-width: 100%;
}

.round-input__visible-assets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.round-input__visible-assets article {
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: 72px minmax(110px, 170px);
  gap: 3px 9px;
  align-items: center;
  min-width: 210px;
  padding: 7px;
  background: #f7f4f4;
  border: 1px solid #eadde0;
  border-radius: 13px;
}

.round-input__visible-assets article.is-image {
  position: relative;
  display: block;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
}

.round-input__visible-assets img,
.round-input__visible-assets article > span {
  grid-row: 1 / 3;
  width: 72px;
  height: 72px;
  object-fit: contain;
  border-radius: 9px;
}

.round-input-image {
  position: relative;
  display: block;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 16px;
}

.input-image-label {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 1;
  padding: 3px 7px;
  font-size: 11px;
  line-height: 1.35;
  color: #fff;
  pointer-events: none;
  background: rgb(13 20 24 / 76%);
  border-radius: 999px;
}

.round-input__visible-assets article.is-image img {
  display: block;
  width: 176px;
  height: 176px;
  border: 1px solid #eadde0;
  border-radius: 16px;
}

.round-input-image > svg {
  position: absolute;
  right: 9px;
  bottom: 9px;
  width: 28px;
  height: 28px;
  padding: 6px;
  color: #fff;
  background: rgb(13 20 24 / 78%);
  border-radius: 50%;
  opacity: 0;
  transition: opacity 150ms ease;
}

.round-input-image:hover > svg,
.round-input-image:focus-visible > svg {
  opacity: 1;
}

.round-input-mask-trigger {
  position: absolute;
  right: 9px;
  bottom: 9px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  color: #fff;
  cursor: pointer;
  background: rgb(13 20 24 / 78%);
  border: 1px solid rgb(255 255 255 / 48%);
  border-radius: 50%;
  opacity: 0;
  transition:
    background 150ms ease,
    opacity 150ms ease,
    transform 150ms ease;
}

.round-input__visible-assets article.is-image:hover .round-input-mask-trigger,
.round-input__visible-assets
  article.is-image:focus-within
  .round-input-mask-trigger {
  opacity: 1;
}

.round-input-mask-trigger:hover,
.round-input-mask-trigger:focus-visible {
  background: var(--round-accent);
  transform: translateY(-1px);
}

.round-input__visible-assets article > span {
  display: grid;
  gap: 3px;
  place-items: center;
  font-size: 11px;
  color: #7a858c;
  background: #fff;
}

.round-input__visible-assets small,
.round-input__visible-assets strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.round-input__visible-assets small {
  font-size: 12px;
  color: #8a6269;
}

.round-input__visible-assets strong {
  font-size: 14px;
}

.round-input__bubble {
  max-width: 680px;
  padding: 12px 15px;
  background: #f0f2f3;
  border-radius: 15px 15px 4px;
}

.round-input__bubble p {
  margin: 0;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.round-input__editor {
  display: grid;
  gap: 10px;
  width: min(680px, 72vw);
  padding: 12px;
  background: #f0f2f3;
  border: 1px solid color-mix(in srgb, var(--round-accent) 32%, #d9e0e3);
  border-radius: 15px 15px 4px;
}

.round-input__editor > div {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.round-input-actions {
  display: flex;
  gap: 2px;
  align-items: center;
  min-height: 28px;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-3px);
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}

.round-input__cluster:hover .round-input-actions,
.round-input__cluster:focus-within .round-input-actions {
  pointer-events: auto;
  opacity: 1;
  transform: translateY(0);
}

.round-input-actions button,
.round-action-button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  padding: 0;
  font-size: 16px;
  color: #6f7a80;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 8px;
  transition:
    color 150ms ease,
    background 150ms ease;
}

.round-input-actions button:hover,
.round-input-actions button:focus-visible,
.round-action-button:hover,
.round-action-button:focus-visible {
  color: var(--round-accent);
  outline: none;
  background: color-mix(in srgb, var(--round-accent) 9%, #fff);
}

.round-action-button:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.round-action-button--accent {
  color: var(--round-accent);
  background: color-mix(in srgb, var(--round-accent) 8%, #fff);
}

.round-input-details__body {
  display: grid;
  gap: 10px;
  max-height: min(66vh, 660px);
  padding-top: 4px;
  overflow: auto;
}

.round-input-assets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
}

.round-input-assets > div {
  position: relative;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: 44px 1fr;
  gap: 2px 8px;
  align-items: center;
  min-width: 0;
  padding: 7px;
  background: #f6f8f8;
  border-radius: 9px;
}

.round-input-assets img,
.round-input-assets > div > svg {
  grid-row: 1 / 3;
  width: 44px;
  height: 44px;
  object-fit: contain;
  border-radius: 7px;
}

.round-input-assets > div > svg {
  padding: 11px;
  color: #7b878e;
  background: #e8edef;
}

.round-input-assets span {
  font-size: 12px;
  color: #7a868d;
}

.round-input-assets strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.round-parameters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  overflow: hidden;
  background: #e1e6e8;
  border: 1px solid #e1e6e8;
  border-radius: 8px;
}

.round-parameters div {
  min-width: 0;
  padding: 7px 9px;
  background: #fff;
}

.round-parameters dt {
  font-size: 12px;
  color: #7b878e;
}

.round-parameters dd {
  max-height: 4.8em;
  margin: 3px 0 0;
  overflow: auto;
  font-size: 13px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.round-response {
  min-width: 0;
}

.round-running,
.round-error,
.round-empty-output {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 16px;
  background: #f6f8f8;
  border: 1px solid #e0e5e7;
  border-radius: 12px;
}

.round-running {
  justify-content: center;
  min-height: 54px;
  padding: 10px;
  color: #707980;
  background: transparent;
  border: 0;
}

.round-running__icon {
  display: flex;
  gap: 5px;
  align-items: center;
  height: 18px;
}

.round-running__icon i {
  width: 6px;
  height: 6px;
  background: var(--round-accent);
  border-radius: 50%;
  animation: round-pulse 1s ease-in-out infinite;
}

.round-running__icon i:nth-child(2) {
  animation-delay: 0.12s;
}

.round-running__icon i:nth-child(3) {
  animation-delay: 0.24s;
}

.round-running span,
.round-error strong {
  font-size: 14px;
}

.round-error p,
.round-error code {
  display: block;
  max-height: 8em;
  margin: 4px 0 0;
  overflow: auto;
  font-size: 12px;
  color: #727f86;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.round-error > svg {
  font-size: 26px;
  color: #b91c32;
}

.round-error > div {
  flex: 1;
  min-width: 0;
}

.round-error code {
  color: #b91c32;
}

.round-output {
  display: grid;
  gap: 12px;
}

.round-output__toolbar {
  justify-content: space-between;
  min-height: 29px;
}

.round-output-selector,
.round-view-switch {
  gap: 5px;
}

.round-output-selector button,
.round-view-switch button {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 5px 9px;
  font-size: 12px;
  color: #68757d;
  background: #fff;
  border: 1px solid #d8dfe2;
  border-radius: 999px;
}

.round-output-selector button.active,
.round-view-switch button.active {
  color: var(--round-accent);
  border-color: var(--round-accent);
}

.round-view-switch {
  margin-left: auto;
}

.round-comparison-unavailable {
  margin-left: auto;
  font-size: 12px;
  color: #8a7478;
}

.round-output-gallery {
  display: grid;
  grid-template-rows: minmax(0, 2fr) minmax(0, 1fr);
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: min(100%, 920px);
  min-height: 300px;
  aspect-ratio: 16 / 9;
  margin: 0 auto;
}

.round-output-gallery button:first-child {
  grid-column: 1 / -1;
}

.round-output-gallery button,
.round-output-image-open {
  position: relative;
  min-width: 0;
  padding: 0;
  overflow: hidden;
  cursor: zoom-in;
  background: #fff;
  border: 2px solid transparent;
  border-radius: 12px;
}

.round-output-gallery button {
  min-height: 0;
}

.round-output-gallery button:hover,
.round-output-gallery button.active {
  border-color: var(--round-accent);
}

.round-output-gallery img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 180ms ease;
}

.round-output-gallery button:hover img {
  transform: scale(1.02);
}

.round-output-gallery__more {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 34px;
  font-weight: 750;
  color: #fff;
  background: rgb(18 25 29 / 72%);
  backdrop-filter: blur(6px);
}

.round-output-visual {
  position: relative;
  display: grid;
  place-items: center;
  width: fit-content;
  max-width: 100%;
  min-height: 250px;
  margin: 0 auto;
  overflow: hidden;
  color: #fff;
  background: #1d272d;
  border-radius: 14px;
  box-shadow: 0 10px 34px rgb(24 34 40 / 14%);
}

.round-output-visual.output-text {
  display: block;
  width: 100%;
  min-height: 0;
  padding: 0;
  color: #20282d;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.round-comparison-shell {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
}

.round-output-visual.output-image {
  min-height: 0;
  background: transparent;
}

.round-output-visual.output-model3d {
  display: block;
  width: 100%;
  min-height: 520px;
  padding: 0;
  overflow: visible;
  background: transparent;
}

.round-output-visual img {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: min(68vh, 720px);
  object-fit: contain;
}

.round-output-image-open {
  display: block;
  border: 0;
}

.round-output-image-open:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--round-accent) 48%, transparent);
  outline-offset: -3px;
}

.round-output-icon {
  display: grid;
  place-items: center;
  min-width: 320px;
}

.round-output-icon svg {
  font-size: 64px;
}

.round-mask-trigger {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: #fff;
  cursor: pointer;
  background: rgb(13 20 24 / 78%);
  border: 1px solid rgb(255 255 255 / 18%);
  border-radius: 50%;
}

.round-output__footer {
  flex-wrap: wrap;
  gap: 10px;
  justify-content: flex-end;
}

.round-output-actions {
  flex-wrap: wrap;
  gap: 2px;
}

.round-output-actions--business {
  gap: 5px;
  justify-content: flex-end;
}

.round-output-actions--business .round-action-button {
  display: inline-flex;
  gap: 5px;
  width: auto;
  min-width: 0;
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
}

.round-output-actions--business .round-action-button span {
  white-space: nowrap;
}

.round-empty-output {
  justify-content: center;
  font-size: 12px;
  color: #758188;
}

@keyframes round-pulse {
  50% {
    opacity: 0.4;
    transform: translateY(-3px);
  }
}

@media (max-width: 900px) {
  .round-output-gallery {
    min-height: 240px;
  }

  .round-output-gallery button {
    min-height: 130px;
  }

  .round-input__bubble,
  .round-input__cluster {
    width: 100%;
    max-width: 100%;
  }

  .round-input-actions {
    pointer-events: auto;
    opacity: 1;
    transform: none;
  }

  .round-parameters {
    grid-template-columns: 1fr;
  }
}
</style>
