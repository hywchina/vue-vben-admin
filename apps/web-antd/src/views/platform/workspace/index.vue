<script lang="ts" setup>
import type {
  CapabilityField,
  PlatformCapability,
} from '#/modules/platform/types';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Input,
  InputNumber,
  message,
  Progress,
  Select,
  Switch,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  getAssetDownloadApi,
  getAssetPreviewApi,
  getCapabilityApi,
} from '#/api';
import StatusPill from '#/components/platform/status-pill.vue';
import { assetTypeLabels } from '#/modules/platform/asset-types';
import { usePlatformStore } from '#/store';

import CapabilityMediaField from './capability-media-field.vue';

const mediaTypes = new Set(['asset', 'capture', 'mask', 'region']);
const route = useRoute();
const router = useRouter();
const platformStore = usePlatformStore();
const selectedAssets = reactive<Record<number, string>>({});
const submitting = ref(false);
const uploadingField = ref('');
const capabilityLoading = ref(false);
const capability = ref<null | PlatformCapability>(null);
const parameterValues = reactive<Record<string, unknown>>({});
const genericPrompt = ref(
  '以现代、克制的设计语言优化客室空间，保持结构关系清晰。',
);
const outputPreviewUrl = ref('');
const outputText = ref('');
let pollTimer: ReturnType<typeof setInterval> | undefined;

const application = computed(() =>
  platformStore.applications.find((item) => item.key === route.params.appKey),
);
const applicationJobs = computed(() =>
  platformStore.currentJobs.filter(
    (job) => job.appKey === application.value?.key,
  ),
);
const activeJob = computed(() =>
  applicationJobs.value.find((job) =>
    ['cancelling', 'queued', 'running'].includes(job.status),
  ),
);
const latestJob = computed(() => applicationJobs.value[0]);
const latestOutput = computed(() =>
  platformStore.currentAssets.find(
    (asset) => asset.sourceAppKey === application.value?.key,
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
      (field) => !field.advanced && !mediaTypes.has(field.type),
    ) ?? [],
);
const advancedFields = computed(
  () =>
    capability.value?.fields.filter(
      (field) => field.advanced && !mediaTypes.has(field.type),
    ) ?? [],
);
const selectedAssetIds = computed(() =>
  mediaFields.value.flatMap((field) => {
    if (field.assetIndex === undefined) return [];
    const id = selectedAssets[field.assetIndex];
    return id ? [id] : [];
  }),
);
const resultKind = computed(() => capability.value?.outputTypes[0] ?? 'image');
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

function setFieldValue(field: CapabilityField, value: unknown) {
  parameterValues[field.key] = value;
}

function setFieldNumberValue(
  field: CapabilityField,
  value: null | number | string,
) {
  const normalized = typeof value === 'string' ? Number(value) : value;
  parameterValues[field.key] = normalized ?? field.defaultValue;
}

function resetWorkspace() {
  for (const key of Object.keys(parameterValues)) {
    Reflect.deleteProperty(parameterValues, key);
  }
  for (const key of Object.keys(selectedAssets)) {
    Reflect.deleteProperty(selectedAssets, key);
  }
  for (const field of capability.value?.fields ?? []) {
    if (!mediaTypes.has(field.type) || field.type === 'region') {
      parameterValues[field.key] = field.defaultValue;
    }
  }
}

async function loadCapability() {
  capability.value = null;
  if (!application.value?.capabilityCode) return;
  capabilityLoading.value = true;
  try {
    capability.value = await getCapabilityApi(application.value.capabilityCode);
    resetWorkspace();
  } finally {
    capabilityLoading.value = false;
  }
}

function selectAsset(field: CapabilityField, assetId: string) {
  if (field.assetIndex === undefined) return;
  const occupied = Object.entries(selectedAssets).find(
    ([index, id]) => Number(index) !== field.assetIndex && id === assetId,
  );
  if (occupied) {
    message.warning('该资产已用于另一个输入位');
    return;
  }
  selectedAssets[field.assetIndex] = assetId;
}

async function uploadMedia(field: CapabilityField, file: File) {
  uploadingField.value = field.key;
  try {
    const asset = await platformStore.uploadAsset({
      description: `${capability.value?.name ?? application.value?.name} 工作区输入`,
      file,
      name: file.name.replace(/\.[^.]+$/, ''),
      tags: ['工作流输入'],
      type: 'image',
    });
    selectAsset(field, asset.id);
    message.success('图像已登记为当前项目资产');
  } finally {
    uploadingField.value = '';
  }
}

function randomizeSeed() {
  const field = capability.value?.fields.find((item) => item.key === 'seed');
  if (!field) return;
  parameterValues.seed = Math.floor(
    Math.random() * Math.min(field.max ?? Number.MAX_SAFE_INTEGER, 2 ** 48),
  );
}

function taskParameters() {
  return Object.fromEntries(
    (capability.value?.fields ?? [])
      .filter((field) => !mediaTypes.has(field.type) || field.type === 'region')
      .map((field) => [field.key, parameterValues[field.key]]),
  );
}

async function runCapability() {
  if (!application.value || !platformStore.currentProjectId) return;
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
    const job = await platformStore.runApplication(
      application.value.key,
      selectedAssetIds.value,
      capability.value ? taskParameters() : { prompt: genericPrompt.value },
    );
    if (job?.status === 'failed') {
      message.warning(job.error?.message ?? '能力服务尚未配置');
    } else {
      message.success('任务已进入持久化队列，关闭页面后仍会继续');
    }
  } finally {
    submitting.value = false;
  }
}

async function cancelActiveJob() {
  if (!activeJob.value) return;
  await platformStore.cancelJob(activeJob.value.id);
  message.info('取消请求已提交');
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

watch(
  () => [route.params.appKey, application.value?.capabilityCode],
  () => void loadCapability(),
  { immediate: true },
);
watch(
  activeJob,
  (job) => {
    if (job) startPolling();
    else stopPolling();
  },
  { immediate: true },
);
watch(
  () => latestOutput.value?.id,
  async (assetId) => {
    outputPreviewUrl.value = '';
    outputText.value = '';
    if (!assetId || !latestOutput.value) return;
    try {
      if (latestOutput.value.type === 'image') {
        const preview = await getAssetPreviewApi(assetId);
        outputPreviewUrl.value = preview.url;
      } else if (latestOutput.value.type === 'text') {
        const result = await getAssetDownloadApi(assetId);
        if (result.mode === 'inline') {
          outputText.value = result.content;
        } else {
          const response = await fetch(result.url);
          outputText.value = await response.text();
        }
      }
    } catch {
      outputPreviewUrl.value = '';
      outputText.value = '';
    }
  },
  { immediate: true },
);
onBeforeUnmount(stopPolling);
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
          @click="router.push('/applications')"
        >
          <IconifyIcon icon="lucide:arrow-left" />
        </Button>
        <div class="capability-glyph">
          <IconifyIcon :icon="application.icon" />
        </div>
        <div>
          <span class="studio-kicker">RAIL DESIGN CAPABILITY</span>
          <h1>{{ capability?.name ?? application.name }}</h1>
          <p>{{ capability?.description ?? application.description }}</p>
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

      <div class="capability-line" aria-label="能力执行链路">
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
            <h2>设计参数</h2>
          </div>
          <IconifyIcon icon="lucide:sliders-horizontal" />
        </div>

        <div class="deck-scroll">
          <template v-if="capability">
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
              <Textarea
                v-if="field.type === 'textarea'"
                :value="fieldTextValue(field)"
                :maxlength="field.maxLength"
                :placeholder="field.placeholder"
                :rows="6"
                show-count
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

            <div v-if="!basicFields.length" class="parameter-empty">
              <IconifyIcon icon="lucide:mouse-pointer-click" />
              <p>该能力不需要额外文本参数，完成输入编组即可运行。</p>
            </div>

            <details v-if="advancedFields.length" class="advanced-deck">
              <summary>
                <span>高级参数</span>
                <small>{{ advancedFields.length }} 项</small>
              </summary>
              <label
                v-for="field in advancedFields"
                :key="field.key"
                class="studio-field"
              >
                <span>{{ field.label }}</span>
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
                <Switch
                  v-else-if="field.type === 'boolean'"
                  :checked="fieldBooleanValue(field)"
                  @update:checked="setFieldValue(field, $event)"
                />
                <Input
                  v-else
                  :value="fieldTextValue(field)"
                  @update:value="setFieldValue(field, $event)"
                />
              </label>
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

        <div class="stage-viewport">
          <div v-if="activeJob" class="stage-state running-state">
            <div class="rail-pulse">
              <i></i>
              <i></i>
              <i></i>
              <i></i>
            </div>
            <StatusPill :status="activeJob.status" />
            <h2>{{ activeJob.name }}</h2>
            <p>{{ activeJob.stage }}</p>
            <Progress
              :percent="activeJob.progress"
              :show-info="false"
              :stroke-color="application.color"
            />
            <small v-if="activeJob.externalReference">
              Prompt ID · {{ activeJob.externalReference }}
            </small>
          </div>

          <div
            v-else-if="latestJob?.status === 'failed'"
            class="stage-state error-state"
          >
            <IconifyIcon icon="lucide:circle-alert" />
            <StatusPill status="failed" />
            <h2>执行边界已阻止任务</h2>
            <p>{{ latestJob.error?.message ?? latestJob.stage }}</p>
            <code>{{ latestJob.error?.code ?? 'JOB_FAILED' }}</code>
            <Button type="primary" @click="runCapability">重新提交</Button>
          </div>

          <div v-else-if="latestOutput" class="stage-output">
            <div class="output-visual" :class="`output-${latestOutput.type}`">
              <img
                v-if="outputPreviewUrl"
                :alt="latestOutput.name"
                :src="outputPreviewUrl"
              />
              <pre v-else-if="outputText">{{ outputText }}</pre>
              <div v-else class="output-icon">
                <IconifyIcon
                  :icon="
                    latestOutput.type === 'model3d'
                      ? 'lucide:box'
                      : application.icon
                  "
                />
                <span>{{ assetTypeLabels[latestOutput.type] }}</span>
              </div>
            </div>
            <div class="output-caption">
              <StatusPill status="succeeded" />
              <h2>{{ latestOutput.name }}</h2>
              <p>{{ latestOutput.description }}</p>
              <small>用户、项目、任务、应用和工作流版本已完整登记</small>
              <div class="output-actions">
                <Button @click="router.push('/assets')">打开资产中心</Button>
                <Button type="primary" @click="runCapability">再次运行</Button>
              </div>
            </div>
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
              完成参数和输入编组后提交。页面关闭不会中断任务，结果自动回流当前项目。
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
            浏览器只接触业务字段和项目资产；ComfyUI 地址、密钥、节点
            ID、模型名与 API JSON 仅保留在平台后端。
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
            :selected-asset-id="
              field.assetIndex === undefined
                ? undefined
                : selectedAssets[field.assetIndex]
            "
            :value="parameterValues[field.key]"
            @select="selectAsset(field, $event)"
            @update:value="setFieldValue(field, $event)"
            @upload="uploadMedia(field, $event)"
          />

          <div v-if="!mediaFields.length" class="no-input-card">
            <IconifyIcon icon="lucide:braces" />
            <h3>无资产输入</h3>
            <p>该能力仅使用受控业务参数，运行结果仍会登记到项目资产中心。</p>
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
  </main>

  <main v-else class="platform-page">
    <div class="rail-empty">
      <div>
        <h2>应用不存在或已下线</h2>
        <Button type="primary" @click="router.push('/applications')">
          返回应用中心
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
  font-size: 9px;
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
  font-size: 11px;
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
  font-size: 10px;
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
  width: 22%;
  height: 1px;
  background: var(--cap-accent);
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
  font-size: 11px;
  font-weight: 720;
}

.studio-field > span i {
  padding: 2px 6px;
  margin-left: 5px;
  font-size: 8px;
  font-style: normal;
  color: var(--cap-accent);
  background: color-mix(in srgb, var(--cap-accent) 9%, white);
  border-radius: 99px;
}

.studio-field > small {
  font-size: 9px;
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
  margin-bottom: 14px;
  font-size: 10px;
  font-weight: 750;
  cursor: pointer;
}

.advanced-deck summary small {
  color: var(--studio-steel);
}

.advanced-deck .studio-field:last-child {
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
  font-size: 10px;
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
  font-size: 9px;
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
  font-size: 9px;
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
  font-size: 11px;
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
  font-size: 10px;
  color: #b91c32;
}

.stage-output {
  display: grid;
  grid-template-rows: minmax(260px, 1fr) auto;
  gap: 18px;
  width: calc(100% - 44px);
  height: calc(100% - 44px);
  margin: 22px;
}

.output-visual {
  display: grid;
  place-items: center;
  min-height: 280px;
  overflow: hidden;
  color: #fff;
  background: #1d272d;
  border-radius: 14px;
}

.output-visual img {
  width: 100%;
  height: 100%;
  max-height: 520px;
  object-fit: contain;
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
  font-size: 10px;
  letter-spacing: 0.12em;
}

.output-caption {
  padding: 0 4px 5px;
}

.output-caption h2 {
  font-size: 19px;
}

.output-actions {
  gap: 8px;
  margin-top: 14px;
}

.security-strip {
  gap: 10px;
  padding: 11px 13px;
  margin-top: 12px;
  font-size: 9px;
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
  font-size: 8px;
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
  font-size: 10px;
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
