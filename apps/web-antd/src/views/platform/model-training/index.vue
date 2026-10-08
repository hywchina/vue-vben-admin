<script lang="ts" setup>
import type { LoraField } from '#/modules/platform/lora-training';
import type { PlatformAsset, PlatformJob } from '#/modules/platform/types';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Drawer,
  Empty,
  Input,
  message,
  Modal,
  Progress,
  Spin,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import {
  createLoraTrainingApi,
  getAssetPreviewApi,
  getLoraStatusApi,
  getLoraTrainingLogsApi,
  getLoraTrainingMetricsApi,
  requestLoraCheckpointApi,
} from '#/api';
import PageHeading from '#/components/platform/page-heading.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { assetTypeIcons } from '#/modules/platform/asset-types';
import {
  createLoraParameters,
  LORA_FIELDS,
  LORA_GROUPS,
  loraFieldValue,
  updateLoraParameter,
  validLoraParameters,
} from '#/modules/platform/lora-training';
import { platformUiIcons } from '#/modules/platform/ui-icons';
import { usePlatformStore } from '#/store';

import LoraParameterField from './lora-parameter-field.vue';

const platformStore = usePlatformStore();
const router = useRouter();
const adapterStatus = ref<Awaited<ReturnType<typeof getLoraStatusApi>>>();
const statusLoading = ref(true);
const submitting = ref(false);
const uploading = ref(false);
const uploadInput = ref<HTMLInputElement>();
const assetSearch = ref('');
const selectedAssetIds = ref<string[]>([]);
const captions = reactive<Record<string, string>>({});
const previewUrls = reactive(new Map<string, string>());
const detailOpen = ref(false);
const professionalOpen = ref(false);
const professionalSection =
  ref<(typeof LORA_GROUPS)[number]['key']>('training');
const detailJob = ref<PlatformJob>();
const detailLoading = ref(false);
const trainingLog = ref('');
const logOffset = ref(0);
const metricPoints = ref<Array<{ step: number; value: number }>>([]);
const parameters = reactive(createLoraParameters());
const mainFields = LORA_FIELDS.filter((field) => field.main);
const professionalFields = computed(() =>
  LORA_FIELDS.filter(
    (field) => !field.main && field.group === professionalSection.value,
  ),
);
function changeParameter(field: LoraField, value: unknown) {
  if (field.binding) updateLoraParameter(parameters, field.binding, value);
}
let pollingTimer: ReturnType<typeof setInterval> | undefined;

const currentProjectName = computed(
  () => platformStore.currentProject?.name ?? '尚未选择项目',
);
const imageAssets = computed(() =>
  platformStore.currentAssets.filter(
    (asset) =>
      asset.type === 'image' &&
      (asset.status === undefined || asset.status === 'available'),
  ),
);
const selectedAssets = computed(() =>
  selectedAssetIds.value
    .map((id) => imageAssets.value.find((asset) => asset.id === id))
    .filter((asset): asset is PlatformAsset => Boolean(asset)),
);
const filteredImageAssets = computed(() => {
  const keyword = assetSearch.value.trim().toLowerCase();
  if (!keyword) return imageAssets.value;
  return imageAssets.value.filter((asset) =>
    `${asset.name} ${asset.publicId}`.toLowerCase().includes(keyword),
  );
});
const trainingJobs = computed(() =>
  platformStore.currentJobs
    .filter((job) => job.appKey === 'lora-training')
    .toSorted(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    ),
);
const totalSteps = computed(() => parameters.steps);
const baseModelOptions = computed(() =>
  (adapterStatus.value?.models ?? []).map((model) => ({
    label: model.label,
    value: model.key,
  })),
);
const selectedBaseModel = computed(() =>
  adapterStatus.value?.models?.find(
    (model) => model.key === parameters.baseModel,
  ),
);
const captionsComplete = computed(() =>
  selectedAssetIds.value.every((assetId) => captions[assetId]?.trim()),
);
const captionedAssetCount = computed(
  () =>
    selectedAssetIds.value.filter((assetId) => captions[assetId]?.trim())
      .length,
);
const captionProgress = computed(() =>
  selectedAssetIds.value.length > 0
    ? Math.round(
        (captionedAssetCount.value / selectedAssetIds.value.length) * 100,
      )
    : 0,
);
const canSubmit = computed(
  () =>
    Boolean(platformStore.currentProjectId) &&
    adapterStatus.value?.reachable === true &&
    selectedAssetIds.value.length > 0 &&
    captionsComplete.value &&
    validLoraParameters(parameters) &&
    Boolean(parameters.name.trim()) &&
    baseModelOptions.value.some(
      (model) => model.value === parameters.baseModel,
    ) &&
    !submitting.value,
);
const statusTone = computed(() => {
  if (statusLoading.value) return 'checking';
  if (!adapterStatus.value?.configured) return 'missing';
  return adapterStatus.value.reachable ? 'ready' : 'offline';
});
const lossPolyline = computed(() => {
  if (metricPoints.value.length < 2) return '';
  const points = metricPoints.value;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * 100;
      const y = 38 - ((point.value - min) / range) * 34;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
});

watch(
  () => platformStore.currentProjectId,
  async () => {
    selectedAssetIds.value = [];
    parameters.name = platformStore.currentProject
      ? `${platformStore.currentProject.name} · LoRA 训练`
      : '';
    await refreshJobs();
    await loadPreviews();
  },
);

onMounted(async () => {
  parameters.name = platformStore.currentProject
    ? `${platformStore.currentProject.name} · LoRA 训练`
    : '';
  await Promise.all([loadAdapterStatus(), refreshJobs(), loadPreviews()]);
  pollingTimer = setInterval(async () => {
    await refreshJobs();
    if (detailOpen.value && detailJob.value && isActive(detailJob.value)) {
      await refreshDetails(false);
    }
  }, 5000);
});

onBeforeUnmount(() => {
  if (pollingTimer) clearInterval(pollingTimer);
});

async function loadAdapterStatus() {
  statusLoading.value = true;
  try {
    adapterStatus.value = await getLoraStatusApi();
    if (
      adapterStatus.value.models?.length &&
      !adapterStatus.value.models.some(
        (model) => model.key === parameters.baseModel,
      )
    ) {
      parameters.baseModel = adapterStatus.value.model;
    }
  } finally {
    statusLoading.value = false;
  }
}

async function refreshJobs() {
  if (!platformStore.currentProjectId) return;
  await platformStore.refreshCurrentProjectJobs().catch(() => undefined);
  if (detailJob.value) {
    detailJob.value = trainingJobs.value.find(
      (job) => job.id === detailJob.value?.id,
    );
  }
}

async function loadPreviews() {
  await Promise.all(
    imageAssets.value.map(async (asset) => {
      if (previewUrls.has(asset.id)) return;
      try {
        const preview = await getAssetPreviewApi(asset.id);
        if (preview.mode === 'url') previewUrls.set(asset.id, preview.url);
      } catch {
        // 单个缩略图失败不阻断训练资产选择。
      }
    }),
  );
}

function toggleAsset(assetId: string) {
  if (selectedAssetIds.value.includes(assetId)) {
    selectedAssetIds.value = selectedAssetIds.value.filter(
      (id) => id !== assetId,
    );
    return;
  }
  selectedAssetIds.value.push(assetId);
  captions[assetId] ??= '';
}

async function uploadFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length === 0) return;
  uploading.value = true;
  try {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        message.warning(`${file.name} 不是受支持的图片文件，已跳过`);
        continue;
      }
      const asset = await platformStore.uploadAsset({
        description: 'LoRA 训练数据集图片',
        file,
        name: file.name.replace(/\.[^.]+$/, ''),
        tags: ['lora-dataset'],
        type: 'image',
      });
      selectedAssetIds.value.push(asset.id);
      captions[asset.id] = '';
    }
    await loadPreviews();
    message.success('图片已上传为项目资产，请补充逐图 caption');
  } finally {
    uploading.value = false;
  }
}

async function submitTraining() {
  if (!canSubmit.value) return;
  submitting.value = true;
  try {
    await createLoraTrainingApi({
      items: selectedAssetIds.value.map((assetId) => ({
        assetId,
        caption: captions[assetId]?.trim() ?? '',
      })),
      name: parameters.name.trim(),
      parameters: {
        baseModel: parameters.baseModel,
        disableSampling: parameters.disableSampling,
        learningRate: parameters.learningRate,
        previewPrompt: parameters.previewPrompt.trim(),
        rank: parameters.rank,
        repeats: parameters.repeats,
        resolution: parameters.resolution,
        steps: parameters.steps,
        triggerWord: parameters.triggerWord.trim(),
      },
      projectId: platformStore.currentProjectId,
    });
    selectedAssetIds.value = [];
    await refreshJobs();
    message.success('LoRA 训练已进入持久化队列，关闭页面后仍会继续');
  } finally {
    submitting.value = false;
  }
}

function isActive(job: PlatformJob) {
  return ['cancelling', 'queued', 'running'].includes(job.status);
}

async function cancelTraining(job: PlatformJob) {
  await platformStore.cancelJob(job.id);
  await refreshJobs();
  message.success('已提交安全停止请求');
}

async function requestCheckpoint(job: PlatformJob) {
  await requestLoraCheckpointApi(job.id);
  message.success('已请求训练进程在后续步骤保存 checkpoint');
}

async function openDetails(job: PlatformJob) {
  detailJob.value = job;
  detailOpen.value = true;
  trainingLog.value = '';
  logOffset.value = 0;
  metricPoints.value = [];
  await refreshDetails(true);
}

async function refreshDetails(reset: boolean) {
  if (!detailJob.value) return;
  detailLoading.value = true;
  try {
    const [logs, metrics] = await Promise.all([
      getLoraTrainingLogsApi(detailJob.value.id, reset ? 0 : logOffset.value),
      getLoraTrainingMetricsApi(detailJob.value.id),
    ]);
    trainingLog.value =
      logs.reset || reset ? logs.log : `${trainingLog.value}${logs.log}`;
    logOffset.value = logs.offset;
    metricPoints.value = metrics.points.map((point) => ({
      step: point.step,
      value: point.value,
    }));
  } catch {
    if (reset) message.warning('训练尚未提交到 AI Toolkit，暂无日志和指标');
  } finally {
    detailLoading.value = false;
  }
}
</script>

<template>
  <main class="platform-page training-page">
    <PageHeading
      :description="`当前项目：${currentProjectName}。项目图片在平台后端组装为受控数据集，训练产物自动登记为模型资产。`"
      eyebrow="Project model training"
      title="LoRA 模型训练"
    />

    <div class="platform-content training-content">
      <section
        class="adapter-status"
        :class="[`adapter-status--${statusTone}`]"
      >
        <Spin v-if="statusLoading" size="small" />
        <IconifyIcon
          v-else
          :icon="
            adapterStatus?.reachable
              ? platformUiIcons.circleCheck
              : platformUiIcons.circleAlert
          "
        />
        <div>
          <strong>
            {{
              statusLoading
                ? '正在检查训练服务'
                : adapterStatus?.reachable
                  ? 'AI Toolkit 训练服务已连接'
                  : adapterStatus?.configured
                    ? '训练服务暂时不可达'
                    : 'LoRA 训练适配器尚未配置'
            }}
          </strong>
          <span>
            {{
              adapterStatus?.reason ||
              `模型 ${selectedBaseModel?.label ?? adapterStatus?.model} · GPU 队列 ${adapterStatus?.gpuIds}`
            }}
          </span>
        </div>
        <Button size="small" @click="loadAdapterStatus">重新检查</Button>
      </section>

      <div class="training-builder" data-testid="training-layout">
        <section class="platform-panel parameter-panel">
          <header class="section-heading">
            <b>1</b>
            <div>
              <strong>参数设置</strong>
              <span>基础参数直接调整，更多受控选项进入专业设置</span>
            </div>
            <Button size="small" @click="professionalOpen = true">
              专业设置
              <IconifyIcon :icon="platformUiIcons.maximize2" />
            </Button>
          </header>
          <div class="wide-field">
            <span>
              任务名称
              <Tooltip
                title="平台业务任务的显示名称，不属于训练超参数。建议使用项目或场景名称，最多 200 字符；不作为服务器目录路径。"
              >
                <button type="button" aria-label="任务名称说明">
                  <IconifyIcon :icon="platformUiIcons.circleHelp" />
                </button>
              </Tooltip>
            </span>
            <Input
              v-model:value="parameters.name"
              :maxlength="200"
              aria-label="任务名称"
            />
          </div>
          <LoraParameterField
            v-for="field in mainFields"
            :key="field.path"
            :field="field"
            :value="loraFieldValue(field, parameters)"
            :options="baseModelOptions"
            :loading="statusLoading"
            @change="changeParameter(field, $event)"
          />
          <Button
            :loading="statusLoading"
            size="small"
            @click="loadAdapterStatus"
          >
            <IconifyIcon :icon="platformUiIcons.refreshCw" />
            刷新基础模型列表
          </Button>
          <p class="parameter-note">
            {{
              parameters.disableSampling
                ? '按 demo 默认禁用训练样图；可在专业设置中开启采样。'
                : '已启用训练样图，每 250 步采样一次。'
            }}
            Repeat 不改变总步数。
          </p>
        </section>

        <section class="platform-panel dataset-panel">
          <header class="section-heading">
            <b>2</b>
            <div>
              <strong>项目训练集</strong>
              <span>选择已入库图片，并为每张图片填写真实 caption</span>
            </div>
            <Tag color="blue">已选 {{ selectedAssetIds.length }} 张</Tag>
          </header>
          <div class="dataset-actions">
            <Button :loading="uploading" @click="uploadInput?.click()">
              <IconifyIcon :icon="platformUiIcons.upload" />
              上传并加入项目资产
            </Button>
            <input
              ref="uploadInput"
              accept="image/*"
              hidden
              multiple
              type="file"
              @change="uploadFiles"
            />
            <span>
              上传图片会先按平台文件规则持久化，再由 Worker 发送到训练服务器。
            </span>
          </div>
          <section class="dataset-library">
            <header class="dataset-subheading">
              <div>
                <strong>选择训练图片</strong>
                <span>项目内共 {{ imageAssets.length }} 张可用图片</span>
              </div>
              <Input
                v-model:value="assetSearch"
                allow-clear
                class="asset-search"
                placeholder="搜索图片名称或编号"
              >
                <template #prefix>
                  <IconifyIcon :icon="platformUiIcons.search" />
                </template>
              </Input>
            </header>
            <div v-if="filteredImageAssets.length" class="asset-grid">
              <button
                v-for="asset in filteredImageAssets"
                :key="asset.id"
                :aria-pressed="selectedAssetIds.includes(asset.id)"
                class="asset-card"
                :class="[
                  {
                    'asset-card--selected': selectedAssetIds.includes(asset.id),
                  },
                ]"
                type="button"
                @click="toggleAsset(asset.id)"
              >
                <img
                  v-if="previewUrls.get(asset.id)"
                  :alt="asset.name"
                  :src="previewUrls.get(asset.id)"
                />
                <IconifyIcon v-else :icon="assetTypeIcons.image" />
                <span>
                  <strong :title="asset.name">{{ asset.name }}</strong>
                  <small>{{ asset.publicId }}</small>
                </span>
                <IconifyIcon
                  v-if="selectedAssetIds.includes(asset.id)"
                  class="selected-mark"
                  :icon="platformUiIcons.circleCheck"
                />
              </button>
            </div>
            <Empty
              v-else
              :description="
                imageAssets.length
                  ? '没有匹配的图片'
                  : '当前项目没有可用图片资产'
              "
            />
          </section>

          <section class="annotation-workspace">
            <header class="annotation-heading">
              <div>
                <strong>逐图标注</strong>
                <span v-if="selectedAssets.length">
                  已完成 {{ captionedAssetCount }}/{{ selectedAssets.length }}
                </span>
                <span v-else>选择图片后，在这里逐张填写训练描述</span>
              </div>
              <div v-if="selectedAssets.length" class="annotation-progress">
                <Progress
                  :percent="captionProgress"
                  :show-info="false"
                  size="small"
                  stroke-color="#c91d3c"
                />
                <b>{{ captionProgress }}%</b>
              </div>
            </header>

            <div v-if="selectedAssets.length" class="caption-list">
              <article
                v-for="(asset, index) in selectedAssets"
                :key="asset.id"
                class="caption-card"
                :class="{
                  'caption-card--complete': captions[asset.id]?.trim(),
                }"
              >
                <div class="caption-card__preview">
                  <img
                    v-if="previewUrls.get(asset.id)"
                    :alt="asset.name"
                    :src="previewUrls.get(asset.id)"
                  />
                  <IconifyIcon v-else :icon="assetTypeIcons.image" />
                  <span>{{ index + 1 }}</span>
                </div>
                <div class="caption-card__body">
                  <div class="caption-card__identity">
                    <span>
                      <strong :title="asset.name">{{ asset.name }}</strong>
                      <small>{{ asset.publicId }}</small>
                    </span>
                    <Tag
                      :color="captions[asset.id]?.trim() ? 'green' : 'orange'"
                    >
                      {{ captions[asset.id]?.trim() ? '已填写' : '待填写' }}
                    </Tag>
                  </div>
                  <Textarea
                    v-model:value="captions[asset.id]"
                    :auto-size="{ minRows: 1, maxRows: 3 }"
                    :maxlength="1000"
                    placeholder="描述客室风格、材质、色彩、构图和主体特征（必填）"
                  />
                  <small>
                    建议描述图片中真实可见的内容，避免使用空泛词语。
                  </small>
                </div>
                <Tooltip title="从本次训练集中移除">
                  <Button
                    :aria-label="`移除 ${asset.name}`"
                    danger
                    shape="circle"
                    size="small"
                    type="text"
                    @click="toggleAsset(asset.id)"
                  >
                    <IconifyIcon :icon="platformUiIcons.close" />
                  </Button>
                </Tooltip>
              </article>
            </div>
            <div v-else class="annotation-empty">
              <IconifyIcon :icon="platformUiIcons.captions" />
              <div>
                <strong>尚未选择训练图片</strong>
                <span>从上方素材库选择图片后，将在这里集中完成标注。</span>
              </div>
            </div>
          </section>
        </section>
      </div>

      <section class="platform-panel submit-panel">
        <div>
          <strong>提交前检查</strong>
          <span>
            {{ selectedAssetIds.length }} 张图片 · {{ totalSteps }} 步
          </span>
          <small v-if="selectedAssetIds.length && !captionsComplete">
            每张训练图片都必须填写 caption。
          </small>
          <small v-else-if="!validLoraParameters(parameters)">
            请检查参数范围：总步数须为 20–10000 的整数，Repeat 须为 1–100
            的整数；触发词、学习率等须符合问号中的说明。
          </small>
        </div>
        <Button
          :disabled="!canSubmit"
          :loading="submitting"
          size="large"
          type="primary"
          @click="submitTraining"
        >
          开始训练
        </Button>
      </section>

      <section class="platform-panel history-panel">
        <header class="section-heading">
          <b>3</b>
          <div>
            <strong>训练任务</strong>
            <span>状态由平台 Worker 每 5 秒同步，离开页面不会中断</span>
          </div>
          <Button size="small" @click="refreshJobs">刷新</Button>
        </header>
        <div v-if="trainingJobs.length" class="job-list">
          <article v-for="job in trainingJobs" :key="job.id" class="job-row">
            <div class="job-row__identity">
              <strong>{{ job.name }}</strong>
              <span>
                {{ job.publicId }} ·
                {{ new Date(job.createdAt).toLocaleString('zh-CN') }}
              </span>
            </div>
            <div class="job-row__progress">
              <Progress
                :percent="job.progress"
                :show-info="false"
                size="small"
              />
              <span>{{ job.stage }}</span>
            </div>
            <StatusPill :status="job.status" />
            <div class="job-row__actions">
              <Button size="small" @click="openDetails(job)">
                日志 / Loss
              </Button>
              <Tooltip title="请求训练进程在后续步骤保存，不代表立即完成">
                <Button
                  v-if="job.status === 'running'"
                  size="small"
                  @click="requestCheckpoint(job)"
                >
                  保存节点
                </Button>
              </Tooltip>
              <Button
                v-if="isActive(job) && job.status !== 'cancelling'"
                danger
                size="small"
                @click="cancelTraining(job)"
              >
                停止
              </Button>
              <Button
                v-if="job.status === 'succeeded'"
                size="small"
                type="primary"
                @click="
                  router.push({ path: '/assets', query: { type: 'model' } })
                "
              >
                查看模型
              </Button>
            </div>
          </article>
        </div>
        <Empty v-else description="当前项目还没有 LoRA 训练任务" />
      </section>
    </div>

    <Modal
      v-model:open="professionalOpen"
      class="professional-modal"
      :footer="null"
      title="专业设置"
      width="min(820px, 94vw)"
    >
      <p class="parameter-note">
        仅展示普通 demo YAML
        中的参数。固定项保持已验证配置，自动项由平台管理；悬停、聚焦或点击问号可查看说明。
      </p>
      <div class="professional-settings">
        <nav aria-label="LoRA 专业设置分类">
          <button
            v-for="group in LORA_GROUPS"
            :key="group.key"
            :class="{ active: professionalSection === group.key }"
            :aria-pressed="professionalSection === group.key"
            type="button"
            @click="professionalSection = group.key"
          >
            {{ group.label }}
          </button>
        </nav>
        <section
          :aria-label="
            LORA_GROUPS.find((group) => group.key === professionalSection)
              ?.label
          "
        >
          <header>
            <h3>
              {{
                LORA_GROUPS.find((group) => group.key === professionalSection)
                  ?.label
              }}
            </h3>
            <span>{{ professionalFields.length }} 项</span>
          </header>
          <LoraParameterField
            v-for="field in professionalFields"
            :key="field.path"
            :field="field"
            :value="loraFieldValue(field, parameters)"
            @change="changeParameter(field, $event)"
          />
        </section>
      </div>
    </Modal>

    <Drawer
      v-model:open="detailOpen"
      :title="`训练详情 · ${detailJob?.publicId ?? ''}`"
      width="min(760px, 94vw)"
    >
      <div class="detail-toolbar">
        <StatusPill v-if="detailJob" :status="detailJob.status" />
        <span>{{ detailJob?.stage }}</span>
        <Button
          :loading="detailLoading"
          size="small"
          @click="refreshDetails(false)"
        >
          刷新
        </Button>
      </div>
      <section class="metric-panel">
        <header>
          <strong>Loss</strong>
          <span>{{ metricPoints.length }} 个数据点</span>
        </header>
        <svg
          v-if="lossPolyline"
          aria-label="训练 loss 曲线"
          preserveAspectRatio="none"
          viewBox="0 0 100 40"
        >
          <polyline :points="lossPolyline" />
        </svg>
        <Empty
          v-else
          :image="Empty.PRESENTED_IMAGE_SIMPLE"
          description="暂无 loss 数据"
        />
      </section>
      <section class="log-panel">
        <header>
          <strong>训练日志</strong>
          <span>增量读取，不写入浏览器业务数据</span>
        </header>
        <pre>{{ trainingLog || '暂无日志' }}</pre>
      </section>
    </Drawer>
  </main>
</template>

<style scoped>
.training-page {
  min-height: 100%;
}

.training-content {
  display: grid;
  gap: 18px;
}

.adapter-status {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #d8dee3);
  border-radius: 12px;
}

.adapter-status svg {
  width: 20px;
  height: 20px;
}

.adapter-status div {
  display: grid;
  gap: 2px;
}

.adapter-status span {
  font-size: 12px;
  color: var(--rail-theme-secondary, #66717a);
}

.adapter-status--ready {
  color: #276749;
  background: var(--rail-theme-surface, #f3fbf6);
  border-color: var(--rail-theme-border, #b9dec8);
}

.adapter-status--offline,
.adapter-status--missing {
  color: #8a3f4c;
  background: var(--rail-red-soft);
  border-color: var(--rail-theme-border, #e9bdc5);
}

.training-builder {
  display: grid;
  grid-template-columns: minmax(330px, 0.78fr) minmax(520px, 1.22fr);
  gap: 18px;
  align-items: stretch;
}

.parameter-panel,
.dataset-panel,
.history-panel {
  display: grid;
  gap: 16px;
  padding: 20px;
}

.parameter-panel {
  align-content: start;
}

.dataset-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.section-heading {
  display: flex;
  gap: 10px;
  align-items: center;
}

.section-heading > b {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  font-size: 12px;
  color: #fff;
  background: var(--rail-theme-solid-accent, var(--rail-red));
  border-radius: 50%;
}

.section-heading > div {
  display: grid;
  flex: 1;
  gap: 1px;
}

.section-heading span {
  font-size: 11px;
  color: var(--rail-theme-secondary, #7a848c);
}

.wide-field,
.parameter-grid label {
  display: grid;
  gap: 7px;
}

.wide-field > span,
.parameter-grid label > span {
  font-size: 12px;
  font-weight: 650;
  color: var(--rail-theme-text, #4f5961);
}

.wide-field small {
  color: var(--rail-theme-secondary, #7a848c);
}

.base-model-field > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.base-model-field :deep(.ant-select) {
  width: 100%;
}

.basic-slider-list {
  display: grid;
  gap: 14px;
}

.slider-field {
  display: grid;
  gap: 6px;
}

.slider-field > span,
.preview-field > span {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  font-weight: 650;
  color: var(--rail-theme-text, #4f5961);
}

.slider-field > span small,
.preview-field > span small {
  font-weight: 400;
  color: var(--rail-theme-secondary, #8a949c);
}

.slider-field > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px;
  gap: 12px;
  align-items: center;
}

.slider-field :deep(.ant-slider) {
  margin: 6px;
}

.slider-field :deep(.ant-input-number) {
  width: 64px;
}

.total-step-field :deep(.ant-input) {
  color: var(--rail-theme-secondary, #7b858d);
  background: var(--rail-theme-surface, #f2f4f7);
}

.parameter-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 2px;
}

.parameter-summary span {
  padding: 4px 8px;
  font-size: var(--rail-font-caption);
  color: var(--rail-theme-secondary, #66717a);
  background: var(--rail-theme-surface, #f2f4f6);
  border-radius: 999px;
}

.parameter-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.parameter-grid :deep(.ant-input-number),
.parameter-grid :deep(.ant-select) {
  width: 100%;
}

.professional-settings {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  min-height: 470px;
  overflow: hidden;
  border: 1px solid var(--rail-theme-border, #e5e8eb);
  border-radius: 12px;
}

.professional-settings > nav {
  display: grid;
  gap: 5px;
  align-content: start;
  padding: 16px 10px;
  background: var(--rail-theme-surface, #f7f8fa);
  border-right: 1px solid var(--rail-theme-border, #e8ebee);
}

.professional-settings > nav button {
  padding: 10px 13px;
  color: var(--rail-theme-secondary, #7a848c);
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 9px;
}

.professional-settings > nav button:hover,
.professional-settings > nav button.active {
  color: var(--rail-red);
  background: var(--rail-theme-surface, #fff);
  box-shadow: 0 2px 9px rgb(30 41 49 / 6%);
}

.professional-settings > section {
  display: grid;
  gap: 18px;
  align-content: start;
  max-height: 65vh;
  padding: 22px 28px;
  overflow-y: auto;
}

.professional-settings > section > header {
  display: flex;
  gap: 12px;
  align-items: baseline;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rail-theme-border, #edf0f2);
}

.professional-settings h3 {
  margin: 0;
  font-size: 17px;
}

.professional-settings header span {
  font-size: 11px;
  color: var(--rail-theme-secondary, #8a949c);
}

.professional-slider,
.professional-field,
.fixed-setting {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 20px;
  align-items: center;
}

.professional-slider > span,
.fixed-setting > span {
  display: grid;
  color: var(--rail-theme-text, #333d45);
}

.professional-slider > span small,
.fixed-setting > span small {
  font-size: var(--rail-font-caption);
  color: var(--rail-theme-muted, #969fa6);
}

.professional-slider > div {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 64px;
  gap: 12px;
  align-items: center;
}

.professional-slider :deep(.ant-input-number),
.professional-field :deep(.ant-input-number),
.professional-field :deep(.ant-select) {
  width: 100%;
}

.professional-field {
  align-items: start;
}

.professional-field > span {
  padding-top: 6px;
}

.fixed-setting strong {
  padding: 8px 12px;
  font-weight: 500;
  color: var(--rail-theme-secondary, #5e6870);
  background: var(--rail-theme-surface, #f1f3f6);
  border-radius: 8px;
}

.dataset-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: var(--rail-mist);
  border-radius: 10px;
}

.dataset-actions > span {
  font-size: 11px;
  color: var(--rail-theme-secondary, #737e86);
}

.dataset-library,
.annotation-workspace {
  display: grid;
  gap: 9px;
  min-height: 0;
  padding: 10px;
  background: var(--rail-theme-surface, #fafbfc);
  border: 1px solid var(--rail-theme-border, #e3e7ea);
  border-radius: 12px;
}

.dataset-subheading,
.annotation-heading {
  display: flex;
  gap: 14px;
  align-items: center;
  justify-content: space-between;
}

.dataset-subheading > div,
.annotation-heading > div:first-child {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.dataset-subheading span,
.annotation-heading span,
.annotation-empty span {
  font-size: 11px;
  color: var(--rail-theme-secondary, #758089);
}

.asset-search {
  width: min(230px, 44%);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: 130px;
  gap: 10px;
  min-height: 0;
  max-height: 270px;
  padding: 2px 5px 3px 2px;
  overflow: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.asset-card {
  position: relative;
  display: grid;
  grid-template-rows: 78px auto;
  gap: 6px;
  min-width: 0;
  padding: 7px;
  text-align: left;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #dce1e5);
  border-radius: 10px;
  transition: 0.16s ease;
}

.asset-card:hover {
  border-color: var(--rail-theme-border, #b98992);
  transform: translateY(-1px);
}

.asset-card--selected {
  border-color: var(--rail-red);
  box-shadow: 0 0 0 2px rgb(185 28 50 / 10%);
}

.asset-card > img {
  width: 100%;
  height: 78px;
  object-fit: contain;
  background: var(--rail-theme-surface, #fff);
  border-radius: 7px;
}

.asset-card > svg:not(.selected-mark) {
  width: 100%;
  height: 78px;
  padding: 24px;
  color: var(--rail-theme-secondary, #8a949b);
  background: var(--rail-theme-surface, #eef1f3);
  border-radius: 7px;
}

.asset-card > span {
  display: grid;
  min-width: 0;
}

.asset-card strong,
.asset-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card small {
  font-size: var(--rail-font-caption);
  color: var(--rail-theme-secondary, #8a949b);
}

.selected-mark {
  position: absolute;
  top: 11px;
  right: 11px;
  color: var(--rail-red);
  background: var(--rail-theme-surface, #fff);
  border-radius: 50%;
}

.caption-list {
  display: grid;
  gap: 10px;
  max-height: 330px;
  padding-right: 5px;
  overflow: auto;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.annotation-progress {
  display: grid;
  grid-template-columns: 120px 36px;
  gap: 8px;
  align-items: center;
}

.annotation-progress :deep(.ant-progress) {
  line-height: 1;
}

.annotation-progress b {
  font-size: 11px;
  color: var(--rail-theme-secondary, #66717a);
  text-align: right;
}

.caption-card {
  position: relative;
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: start;
  padding: 10px;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #e1e5e8);
  border-radius: 10px;
  transition: border-color 0.16s ease;
}

.caption-card--complete {
  border-color: var(--rail-theme-border, #bcd9c8);
}

.caption-card__preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  overflow: hidden;
  color: var(--rail-theme-secondary, #8a949b);
  background: var(--rail-theme-surface, #eef1f3);
  border-radius: 8px;
}

.caption-card__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--rail-theme-surface, #fff);
}

.caption-card__preview > span {
  position: absolute;
  right: 5px;
  bottom: 5px;
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: rgb(28 36 42 / 78%);
  border-radius: 999px;
}

.caption-card__body {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.caption-card__body > small {
  font-size: 10px;
  color: var(--rail-theme-muted, #9099a0);
}

.caption-card__identity {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.caption-card__identity > span {
  display: grid;
  min-width: 0;
}

.caption-card__identity strong,
.caption-card__identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.caption-card__identity small {
  font-size: var(--rail-font-caption);
  color: var(--rail-theme-secondary, #8a949b);
}

.caption-card__identity :deep(.ant-tag) {
  flex: 0 0 auto;
  margin-inline-end: 0;
}

.annotation-empty {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  min-height: 104px;
  padding: 18px;
  color: var(--rail-theme-secondary, #7d878e);
  text-align: left;
  border: 1px dashed var(--rail-theme-border, #d8dde1);
  border-radius: 10px;
}

.annotation-empty > svg {
  width: 30px;
  height: 30px;
}

.annotation-empty > div {
  display: grid;
  gap: 3px;
}

.submit-panel {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 17px 20px;
}

.submit-panel > div {
  display: grid;
  gap: 3px;
}

.submit-panel span,
.submit-panel small {
  color: var(--rail-theme-secondary, #6e7880);
}

.submit-panel small {
  color: var(--rail-theme-accent, #a23d4e);
}

.job-list {
  display: grid;
  gap: 10px;
}

.job-row {
  display: grid;
  grid-template-columns: minmax(190px, 0.8fr) minmax(240px, 1.2fr) auto auto;
  gap: 16px;
  align-items: center;
  padding: 13px 14px;
  border: 1px solid var(--rail-theme-border, #e2e6e9);
  border-radius: 10px;
}

.job-row__identity,
.job-row__progress {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.job-row__identity span,
.job-row__progress span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--rail-theme-secondary, #758089);
  white-space: nowrap;
}

.job-row__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.detail-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 18px;
}

.detail-toolbar > span:nth-child(2) {
  flex: 1;
  color: var(--rail-theme-secondary, #67727a);
}

.metric-panel,
.log-panel {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.metric-panel header,
.log-panel header {
  display: flex;
  justify-content: space-between;
}

.metric-panel header span,
.log-panel header span {
  font-size: 11px;
  color: var(--rail-theme-secondary, #7c878e);
}

.metric-panel svg {
  width: 100%;
  height: 180px;
  padding: 8px;
  overflow: visible;
  background: var(--rail-theme-surface, #f7f9fa);
  border: 1px solid var(--rail-theme-border, #e4e8eb);
  border-radius: 10px;
}

.metric-panel polyline {
  fill: none;
  stroke: var(--rail-red);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
}

.log-panel pre {
  min-height: 260px;
  max-height: 520px;
  padding: 14px;
  overflow: auto;
  font-size: 11px;
  line-height: 1.65;
  color: #dce6eb;
  white-space: pre-wrap;
  background: var(--rail-theme-surface, #20272c);
  border-radius: 10px;
}

@media (max-width: 900px) {
  .training-builder {
    grid-template-columns: 1fr;
  }

  .dataset-panel {
    display: grid;
  }

  .asset-grid {
    max-height: 390px;
  }

  .job-row {
    grid-template-columns: 1fr auto;
  }

  .job-row__progress {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .dataset-subheading,
  .annotation-heading {
    flex-direction: column;
    align-items: stretch;
  }

  .asset-search {
    width: 100%;
  }

  .asset-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .annotation-progress {
    grid-template-columns: minmax(0, 1fr) 36px;
  }

  .parameter-grid {
    grid-template-columns: 1fr;
  }

  .professional-settings {
    grid-template-columns: 1fr;
  }

  .professional-settings > nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-right: 0;
    border-bottom: 1px solid var(--rail-theme-border, #e8ebee);
  }

  .professional-settings > nav button {
    padding: 8px;
    text-align: center;
  }

  .professional-settings > section {
    padding: 18px;
  }

  .professional-slider,
  .professional-field,
  .fixed-setting {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .caption-card {
    grid-template-columns: 58px minmax(0, 1fr);
  }

  .caption-card__preview {
    width: 58px;
    height: 58px;
  }

  .caption-card > :deep(.ant-btn) {
    position: absolute;
    top: 8px;
    right: 8px;
  }

  .caption-card__body {
    padding-right: 28px;
  }

  .submit-panel,
  .dataset-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .adapter-status {
    grid-template-columns: auto 1fr;
  }

  .adapter-status > button {
    grid-column: 1 / -1;
  }
}

.parameter-note {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--rail-theme-secondary, #758089);
}

.wide-field > span button {
  display: inline-flex;
  padding: 3px;
  margin-left: 4px;
  color: var(--rail-theme-secondary, #758089);
  cursor: help;
  background: transparent;
  border: 0;
}

@media (max-width: 640px) {
  .professional-settings {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
  }

  .professional-settings > nav {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    border-right: 0;
    border-bottom: 1px solid var(--rail-theme-border, #e8ebee);
  }

  .professional-settings > nav button {
    padding: 7px 9px;
    font-size: 12px;
  }

  .professional-settings > section {
    max-height: 55vh;
    padding: 14px;
  }
}
</style>
