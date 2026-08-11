<script lang="ts" setup>
import type {
  CapabilityField,
  PlatformJob,
  PlatformJobOutput,
} from '#/modules/platform/types';

import { computed, onMounted, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Progress, Tag } from 'ant-design-vue';

import { getAssetDownloadApi, getAssetPreviewApi } from '#/api';
import { assetTypeLabels } from '#/modules/platform/asset-types';

import ComfyMaskIcon from './comfy-mask-icon.vue';
import ImageComparisonSlider from './image-comparison-slider.vue';
import StatusPill from './status-pill.vue';

const props = defineProps<{
  accent: string;
  fields: CapabilityField[];
  flowLabel?: string;
  job: PlatformJob;
  round: number;
  supportsImageComparison: boolean;
}>();

const emit = defineEmits<{
  download: [output: PlatformJobOutput];
  flow: [output: PlatformJobOutput];
  mask: [output: PlatformJobOutput, previewUrl: string];
  rerun: [job: PlatformJob];
  save: [output: PlatformJobOutput];
}>();

const activeOutputAssetId = ref('');
const comparisonMode = ref(true);
const previewUrls = reactive<Record<string, string>>({});
const textContents = reactive<Record<string, string>>({});

const activeOutput = computed(
  () =>
    props.job.outputs.find(
      (output) => output.assetId === activeOutputAssetId.value,
    ) ?? props.job.outputs[0],
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
  () => firstImageInputField.value?.type === 'mask',
);
const comparisonSourceAssetId = computed(() => {
  const input = firstImageInput.value;
  if (!input) return undefined;
  if (comparesMaskedInput.value) return input.derivedFromAssetId;
  return input.derivedFromAssetId ?? input.assetId;
});
const missingMaskComparisonSource = computed(
  () =>
    props.supportsImageComparison &&
    activeOutput.value?.kind === 'image' &&
    comparesMaskedInput.value &&
    !firstImageInput.value?.derivedFromAssetId,
);
const comparisonAvailable = computed(
  () =>
    props.supportsImageComparison &&
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
    label: preferred.label,
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

function inputFieldLabel(position: number) {
  return (
    props.fields.find((field) => field.assetIndex === position)?.label ??
    `输入 ${position + 1}`
  );
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
    [...props.job.inputs, ...props.job.outputs, ...comparisonSource].map(
      (asset) => loadAssetContent(asset.assetId, asset.kind),
    ),
  );
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
      <small v-if="job.workflowVersion">
        工作流 V{{ job.workflowVersion }}
      </small>
    </header>

    <section class="round-input">
      <div class="round-input__message">
        <div
          v-if="job.inputs.length"
          class="round-input__visible-assets"
          data-testid="round-visible-input-assets"
        >
          <article
            v-for="input in job.inputs"
            :key="input.assetId"
            :class="{
              'is-image': input.kind === 'image' && previewUrls[input.assetId],
            }"
            :title="`${inputFieldLabel(input.position)}：${input.name || input.assetId}`"
          >
            <img
              v-if="previewUrls[input.assetId]"
              :alt="input.name"
              :src="previewUrls[input.assetId]"
            />
            <template v-else>
              <span>
                <IconifyIcon icon="lucide:file-input" />
                {{ assetTypeLabels[input.kind] }}
              </span>
              <small>{{ inputFieldLabel(input.position) }}</small>
              <strong>{{ input.name || input.assetId }}</strong>
            </template>
          </article>
        </div>
        <div class="round-input__bubble">
          <strong>{{ promptEntry?.label ?? '本轮输入' }}</strong>
          <p>
            {{ promptEntry?.value ?? '使用当前参数和输入素材执行工作流。' }}
          </p>
        </div>
      </div>
      <details class="round-input-details">
        <summary>
          <IconifyIcon icon="lucide:scan-search" />
          查看本轮完整输入
          <small>
            {{ parameterEntries.length }} 项参数 ·
            {{ job.inputs.length }} 个资产
          </small>
        </summary>
        <div class="round-input-details__body">
          <div v-if="job.inputs.length" class="round-input-assets">
            <div v-for="input in job.inputs" :key="input.assetId">
              <img
                v-if="previewUrls[input.assetId]"
                :alt="input.name"
                :src="previewUrls[input.assetId]"
              />
              <IconifyIcon v-else icon="lucide:file-input" />
              <span>输入 {{ input.position + 1 }}</span>
              <strong>{{ input.name || input.assetId }}</strong>
            </div>
          </div>
          <dl v-if="parameterEntries.length" class="round-parameters">
            <div v-for="entry in parameterEntries" :key="entry.key">
              <dt>{{ entry.label }}</dt>
              <dd>{{ entry.value }}</dd>
            </div>
          </dl>
        </div>
      </details>
    </section>

    <section class="round-response">
      <div v-if="isActive" class="round-running">
        <div class="round-running__icon">
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </div>
        <div>
          <strong>{{ job.stage }}</strong>
          <Progress
            :percent="job.progress"
            :show-info="false"
            :stroke-color="accent"
          />
          <small v-if="job.externalReference">
            Prompt ID · {{ job.externalReference }}
          </small>
        </div>
      </div>

      <div v-else-if="job.status === 'failed'" class="round-error">
        <IconifyIcon icon="lucide:circle-alert" />
        <div>
          <strong>本轮执行失败</strong>
          <p>{{ job.error?.message ?? job.stage }}</p>
          <code>{{ job.error?.code ?? 'JOB_FAILED' }}</code>
        </div>
        <Button @click="emit('rerun', job)">复用本轮输入</Button>
      </div>

      <div v-else-if="activeOutput" class="round-output">
        <div class="round-output__toolbar">
          <div v-if="job.outputs.length > 1" class="round-output-selector">
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
            :after-label="comparesMaskedInput ? '遮罩生成结果' : '生成结果'"
            :after-src="previewUrls[activeOutput.assetId]!"
            :before-label="comparesMaskedInput ? '遮罩前原图' : '原始输入'"
            :before-src="previewUrls[comparisonSourceAssetId]!"
          />
          <button
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
        <div
          v-else
          class="round-output-visual"
          :class="`output-${activeOutput.kind}`"
        >
          <img
            v-if="previewUrls[activeOutput.assetId]"
            :alt="activeOutput.name"
            :src="previewUrls[activeOutput.assetId]"
          />
          <pre v-else-if="textContents[activeOutput.assetId]">{{
            textContents[activeOutput.assetId]
          }}</pre>
          <div v-else class="round-output-icon">
            <IconifyIcon
              :icon="
                activeOutput.kind === 'model3d' ? 'lucide:box' : 'lucide:file'
              "
            />
            <span>{{ assetTypeLabels[activeOutput.kind] }}</span>
          </div>
          <button
            v-if="previewUrls[activeOutput.assetId]"
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
          <div>
            <Tag :color="activeOutput.saved ? 'green' : 'orange'">
              {{ activeOutput.saved ? '已保存到资产' : '任务暂存结果' }}
            </Tag>
            <strong>{{ activeOutput.name }}</strong>
          </div>
          <div class="round-output-actions">
            <Button @click="emit('download', activeOutput)">下载/查看</Button>
            <Button
              :disabled="activeOutput.saved"
              @click="emit('save', activeOutput)"
            >
              {{ activeOutput.saved ? '已加入资产' : '加入资产' }}
            </Button>
            <Button @click="emit('flow', activeOutput)">
              <IconifyIcon icon="lucide:send" />
              {{ flowLabel ?? '流转到工作流' }}
            </Button>
            <Button type="primary" @click="emit('rerun', job)">
              复用本轮再运行
            </Button>
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

.round-heading small {
  margin-left: auto;
}

.round-input {
  flex-direction: column;
  align-items: flex-end;
}

.round-input__message {
  display: grid;
  gap: 8px;
  justify-items: end;
  max-width: min(82%, 760px);
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
  object-fit: cover;
  border-radius: 9px;
}

.round-input__visible-assets article.is-image img {
  width: 176px;
  height: 176px;
  border: 1px solid #eadde0;
  border-radius: 16px;
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

.round-input__bubble strong {
  font-size: 12px;
  color: var(--round-accent);
}

.round-input__bubble p {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.round-input-details {
  width: min(88%, 760px);
  margin-top: 7px;
  border: 1px solid #e0e5e7;
  border-radius: 10px;
}

.round-input-details summary {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 8px 10px;
  font-size: 12px;
  color: #65737b;
  cursor: pointer;
  list-style: none;
}

.round-input-details summary small {
  margin-left: auto;
}

.round-input-details__body {
  display: grid;
  gap: 10px;
  padding: 11px;
  border-top: 1px solid #e5e9eb;
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
  object-fit: cover;
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

.round-running__icon {
  display: flex;
  gap: 4px;
  align-items: center;
  height: 34px;
}

.round-running__icon i {
  width: 5px;
  height: 28px;
  background: var(--round-accent);
  border-radius: 9px;
  animation: round-pulse 0.9s ease-in-out infinite alternate;
}

.round-running__icon i:nth-child(2) {
  animation-delay: 0.12s;
}

.round-running__icon i:nth-child(3) {
  animation-delay: 0.24s;
}

.round-running__icon i:nth-child(4) {
  animation-delay: 0.36s;
}

.round-running > div:last-child {
  flex: 1;
}

.round-running strong,
.round-error strong {
  font-size: 14px;
}

.round-running small,
.round-error p,
.round-error code {
  display: block;
  margin: 4px 0 0;
  font-size: 12px;
  color: #727f86;
}

.round-error > svg {
  font-size: 26px;
  color: #b91c32;
}

.round-error > div {
  flex: 1;
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

.round-output-visual img {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: min(68vh, 720px);
  object-fit: contain;
}

.round-output-visual pre {
  max-height: 520px;
  padding: 22px;
  margin: 0;
  overflow: auto;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-wrap;
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
  justify-content: space-between;
}

.round-output__footer > div:first-child {
  display: flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
}

.round-output__footer strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  white-space: nowrap;
}

.round-output-actions {
  flex-wrap: wrap;
  gap: 6px;
}

.round-empty-output {
  justify-content: center;
  font-size: 12px;
  color: #758188;
}

@keyframes round-pulse {
  to {
    height: 10px;
    opacity: 0.4;
  }
}

@media (max-width: 900px) {
  .round-input__bubble,
  .round-input-details {
    width: 100%;
    max-width: 100%;
  }

  .round-parameters {
    grid-template-columns: 1fr;
  }
}
</style>
