<script lang="ts" setup>
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
  InputNumber,
  message,
  Modal,
  Progress,
  Select,
  Slider,
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
import { usePlatformStore } from '#/store';

const platformStore = usePlatformStore();
const router = useRouter();
const adapterStatus = ref<Awaited<ReturnType<typeof getLoraStatusApi>>>();
const statusLoading = ref(true);
const submitting = ref(false);
const uploading = ref(false);
const uploadInput = ref<HTMLInputElement>();
const selectedAssetIds = ref<string[]>([]);
const captions = reactive<Record<string, string>>({});
const previewUrls = reactive(new Map<string, string>());
const detailOpen = ref(false);
const professionalOpen = ref(false);
const professionalSection = ref<
  'advanced' | 'caption' | 'network' | 'optimizer' | 'sample' | 'training'
>('training');
const detailJob = ref<PlatformJob>();
const detailLoading = ref(false);
const trainingLog = ref('');
const logOffset = ref(0);
const metricPoints = ref<Array<{ step: number; value: number }>>([]);
const parameters = reactive({
  baseModel: 'flux2-klein-9b',
  epochs: 5,
  learningRate: 0.0001,
  name: '',
  previewPrompt: '[trigger], modern style rail cabin interior design',
  rank: 16,
  repeats: 20,
  resolution: 512 as 512 | 768 | 1024,
  triggerWord: 'interiorstyle',
});
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
const trainingJobs = computed(() =>
  platformStore.currentJobs
    .filter((job) => job.appKey === 'lora-training')
    .toSorted(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    ),
);
const totalSteps = computed(
  () => selectedAssetIds.value.length * parameters.repeats * parameters.epochs,
);
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
const canSubmit = computed(
  () =>
    Boolean(platformStore.currentProjectId) &&
    adapterStatus.value?.reachable === true &&
    selectedAssetIds.value.length > 0 &&
    captionsComplete.value &&
    totalSteps.value >= 20 &&
    totalSteps.value <= 10_000 &&
    /^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(parameters.triggerWord.trim()) &&
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
  if (selectedAssetIds.value.length >= 100) {
    message.warning('单个训练任务最多选择 100 张图片');
    return;
  }
  selectedAssetIds.value.push(assetId);
  captions[assetId] ??= '';
}

async function uploadFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const allFiles = [...(input.files ?? [])];
  input.value = '';
  if (allFiles.length === 0) return;
  const remaining = Math.max(0, 100 - selectedAssetIds.value.length);
  const files = allFiles.slice(0, remaining);
  if (files.length < allFiles.length) {
    message.warning('单个训练任务最多选择 100 张图片，多余文件未上传');
  }
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
        epochs: parameters.epochs,
        learningRate: parameters.learningRate,
        previewPrompt: parameters.previewPrompt.trim(),
        rank: parameters.rank,
        repeats: parameters.repeats,
        resolution: parameters.resolution,
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
              ? 'lucide:circle-check'
              : 'lucide:circle-alert'
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
              <IconifyIcon icon="lucide:expand" />
            </Button>
          </header>
          <label class="wide-field base-model-field">
            <span>使用底模</span>
            <div>
              <Select
                v-model:value="parameters.baseModel"
                :loading="statusLoading"
                :options="baseModelOptions"
                placeholder="请选择训练基础模型"
              />
              <Button
                :loading="statusLoading"
                aria-label="刷新基础模型列表"
                @click="loadAdapterStatus"
              >
                <IconifyIcon icon="lucide:refresh-cw" />
              </Button>
            </div>
            <small>
              模型列表由平台后端白名单提供，不向浏览器暴露权重路径。
            </small>
          </label>
          <label class="wide-field">
            <span>任务名称</span>
            <Input v-model:value="parameters.name" :maxlength="200" />
          </label>
          <div class="basic-slider-list">
            <label class="slider-field">
              <span>
                单张训练次数
                <small>Repeat</small>
              </span>
              <div>
                <Slider
                  v-model:value="parameters.repeats"
                  :min="1"
                  :max="100"
                />
                <InputNumber
                  v-model:value="parameters.repeats"
                  :min="1"
                  :max="100"
                />
              </div>
            </label>
            <label class="slider-field">
              <span>
                训练轮次
                <small>Epoch</small>
              </span>
              <div>
                <Slider v-model:value="parameters.epochs" :min="1" :max="100" />
                <InputNumber
                  v-model:value="parameters.epochs"
                  :min="1"
                  :max="100"
                />
              </div>
            </label>
          </div>
          <label class="wide-field total-step-field">
            <span>预计总步数</span>
            <Input
              :status="
                totalSteps > 10000 || (totalSteps > 0 && totalSteps < 20)
                  ? 'error'
                  : undefined
              "
              :value="
                selectedAssetIds.length
                  ? `${totalSteps} 步`
                  : '选择训练图片后自动计算'
              "
              disabled
            />
          </label>
          <label class="wide-field">
            <span>触发词</span>
            <Input
              v-model:value="parameters.triggerWord"
              placeholder="例如 interiorstyle"
            />
            <small>
              英文开头，可包含数字、下划线和连字符；平台会写入每张 caption。
            </small>
          </label>
          <label class="wide-field preview-field">
            <span>
              模型效果预览提示词
              <small>训练中用于生成实时样图</small>
            </span>
            <Textarea
              v-model:value="parameters.previewPrompt"
              :rows="6"
              :maxlength="1000"
            />
          </label>
          <div class="parameter-summary">
            <span>LoRA Rank {{ parameters.rank }}</span>
            <span>
              {{ parameters.resolution }} × {{ parameters.resolution }}
            </span>
            <span>LR {{ parameters.learningRate }}</span>
          </div>
        </section>

        <section class="platform-panel dataset-panel">
          <header class="section-heading">
            <b>2</b>
            <div>
              <strong>项目训练集</strong>
              <span>选择已入库图片，并为每张图片填写真实 caption</span>
            </div>
            <Tag color="blue">已选 {{ selectedAssetIds.length }}/100</Tag>
          </header>
          <div class="dataset-actions">
            <Button :loading="uploading" @click="uploadInput?.click()">
              <IconifyIcon icon="lucide:upload" />
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
          <div v-if="imageAssets.length" class="asset-grid">
            <button
              v-for="asset in imageAssets"
              :key="asset.id"
              class="asset-card"
              :class="[
                { 'asset-card--selected': selectedAssetIds.includes(asset.id) },
              ]"
              type="button"
              @click="toggleAsset(asset.id)"
            >
              <img
                v-if="previewUrls.get(asset.id)"
                :alt="asset.name"
                :src="previewUrls.get(asset.id)"
              />
              <IconifyIcon v-else icon="lucide:image" />
              <span>
                <strong>{{ asset.name }}</strong>
                <small>{{ asset.publicId }}</small>
              </span>
              <IconifyIcon
                v-if="selectedAssetIds.includes(asset.id)"
                class="selected-mark"
                icon="lucide:circle-check-big"
              />
            </button>
          </div>
          <Empty v-else description="当前项目没有可用图片资产" />
          <div v-if="selectedAssets.length" class="caption-list">
            <div
              v-for="asset in selectedAssets"
              :key="asset.id"
              class="caption-row"
            >
              <span>
                <strong>{{ asset.name }}</strong>
                <small>{{ asset.publicId }}</small>
              </span>
              <Input
                v-model:value="captions[asset.id]"
                :maxlength="1000"
                placeholder="描述该图片的客室风格、材质、色彩和构图（必填）"
              />
              <Button
                danger
                size="small"
                type="text"
                @click="toggleAsset(asset.id)"
              >
                移除
              </Button>
            </div>
          </div>
        </section>
      </div>

      <section class="platform-panel submit-panel">
        <div>
          <strong>提交前检查</strong>
          <span>
            {{ selectedAssetIds.length }} 张图片 · {{ totalSteps }} 步 · rank
            {{ parameters.rank }} · {{ parameters.resolution }}px
          </span>
          <small v-if="selectedAssetIds.length && !captionsComplete">
            每张训练图片都必须填写 caption。
          </small>
          <small
            v-else-if="
              totalSteps > 10000 || (totalSteps > 0 && totalSteps < 20)
            "
          >
            总步数必须在 20 到 10000 之间。
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
      <div class="professional-settings">
        <nav aria-label="LoRA 专业设置分类">
          <button
            :class="{ active: professionalSection === 'training' }"
            type="button"
            @click="professionalSection = 'training'"
          >
            训练参数
          </button>
          <button
            :class="{ active: professionalSection === 'sample' }"
            type="button"
            @click="professionalSection = 'sample'"
          >
            样图设置
          </button>
          <button
            :class="{ active: professionalSection === 'optimizer' }"
            type="button"
            @click="professionalSection = 'optimizer'"
          >
            学习率与优化器
          </button>
          <button
            :class="{ active: professionalSection === 'network' }"
            type="button"
            @click="professionalSection = 'network'"
          >
            网络
          </button>
          <button
            :class="{ active: professionalSection === 'caption' }"
            type="button"
            @click="professionalSection = 'caption'"
          >
            打标设置
          </button>
          <button
            :class="{ active: professionalSection === 'advanced' }"
            type="button"
            @click="professionalSection = 'advanced'"
          >
            高级设置
          </button>
        </nav>

        <section v-if="professionalSection === 'training'">
          <header>
            <h3>训练参数</h3>
            <span>与基础面板实时同步</span>
          </header>
          <label class="professional-slider">
            <span>
              <small>Repeat</small>
              单张训练次数
            </span>
            <div>
              <Slider v-model:value="parameters.repeats" :min="1" :max="100" />
              <InputNumber
                v-model:value="parameters.repeats"
                :min="1"
                :max="100"
              />
            </div>
          </label>
          <label class="professional-slider">
            <span>
              <small>Epoch</small>
              训练轮次
            </span>
            <div>
              <Slider v-model:value="parameters.epochs" :min="1" :max="100" />
              <InputNumber
                v-model:value="parameters.epochs"
                :min="1"
                :max="100"
              />
            </div>
          </label>
          <div class="fixed-setting">
            <span>
              <small>Batch size</small>
              批量大小
            </span>
            <strong>1</strong>
          </div>
          <div class="fixed-setting">
            <span>
              <small>Mixed precision</small>
              训练混合精度
            </span>
            <strong>BF16</strong>
          </div>
        </section>

        <section v-else-if="professionalSection === 'sample'">
          <header>
            <h3>样图设置</h3>
            <span>训练过程中按 checkpoint 生成预览</span>
          </header>
          <label class="professional-field">
            <span>样图分辨率</span>
            <Select
              v-model:value="parameters.resolution"
              :options="
                [512, 768, 1024].map((value) => ({
                  label: `${value} × ${value}`,
                  value,
                }))
              "
            />
          </label>
          <label class="professional-field">
            <span>模型效果预览提示词</span>
            <Textarea
              v-model:value="parameters.previewPrompt"
              :rows="5"
              :maxlength="1000"
            />
          </label>
        </section>

        <section v-else-if="professionalSection === 'optimizer'">
          <header>
            <h3>学习率与优化器</h3>
            <span>保持已验证模板的稳定优化策略</span>
          </header>
          <label class="professional-field">
            <span>学习率</span>
            <InputNumber
              v-model:value="parameters.learningRate"
              :min="0.000001"
              :max="0.01"
              :step="0.00001"
            />
          </label>
          <div class="fixed-setting">
            <span>
              <small>Optimizer</small>
              优化器
            </span>
            <strong>AdamW8Bit</strong>
          </div>
          <div class="fixed-setting">
            <span>
              <small>Noise scheduler</small>
              噪声调度器
            </span>
            <strong>FlowMatch</strong>
          </div>
        </section>

        <section v-else-if="professionalSection === 'network'">
          <header>
            <h3>网络</h3>
            <span>LoRA 线性秩和 Alpha 保持一致</span>
          </header>
          <label class="professional-field">
            <span>LoRA Rank / Alpha</span>
            <Select
              v-model:value="parameters.rank"
              :options="
                [4, 8, 16, 32, 64].map((value) => ({
                  label: `${value} / ${value}`,
                  value,
                }))
              "
            />
          </label>
          <div class="fixed-setting">
            <span>
              <small>Network type</small>
              网络类型
            </span>
            <strong>LoRA</strong>
          </div>
        </section>

        <section v-else-if="professionalSection === 'caption'">
          <header>
            <h3>打标设置</h3>
            <span>图片和同名 TXT caption 一一对应</span>
          </header>
          <label class="professional-field">
            <span>触发词</span>
            <Input v-model:value="parameters.triggerWord" />
          </label>
          <div class="fixed-setting">
            <span>
              <small>Caption extension</small>
              描述文件扩展名
            </span>
            <strong>TXT</strong>
          </div>
          <div class="fixed-setting">
            <span>
              <small>Caption dropout</small>
              描述丢弃率
            </span>
            <strong>0</strong>
          </div>
        </section>

        <section v-else>
          <header>
            <h3>高级设置</h3>
            <span>只读展示已验证模板中的平台固定项</span>
          </header>
          <div class="fixed-setting">
            <span>Transformer 量化</span>
            <strong>QFloat8</strong>
          </div>
          <div class="fixed-setting">
            <span>文本编码器量化</span>
            <strong>QFloat8</strong>
          </div>
          <div class="fixed-setting">
            <span>低显存模式</span>
            <strong>开启</strong>
          </div>
          <div class="fixed-setting">
            <span>Latent / 文本嵌入缓存</span>
            <strong>磁盘缓存</strong>
          </div>
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
  padding: 22px 28px;
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

.asset-grid {
  display: grid;
  flex: 1 1 0;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: minmax(132px, 1fr);
  gap: 10px;
  min-height: 0;
  overflow: auto;
}

.asset-card {
  position: relative;
  display: grid;
  grid-template-rows: minmax(100px, 1fr) auto;
  gap: 8px;
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
  height: 100%;
  min-height: 100px;
  object-fit: contain;
  background: var(--rail-theme-surface, #fff);
  border-radius: 7px;
}

.asset-card > svg:not(.selected-mark) {
  width: 100%;
  height: 100%;
  min-height: 100px;
  padding: 30px;
  color: var(--rail-theme-secondary, #8a949b);
  background: var(--rail-theme-surface, #eef1f3);
  border-radius: 7px;
}

.asset-card > span,
.caption-row > span {
  display: grid;
  min-width: 0;
}

.asset-card strong,
.asset-card small,
.caption-row strong,
.caption-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card small,
.caption-row small {
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
  gap: 9px;
  padding-top: 14px;
  border-top: 1px solid var(--rail-theme-border, #edf0f2);
}

.caption-row {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
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
    flex: none;
    grid-auto-rows: auto;
    max-height: 390px;
  }

  .asset-card {
    grid-template-rows: 100px auto;
  }

  .asset-card > img,
  .asset-card > svg:not(.selected-mark) {
    height: 100px;
  }

  .job-row {
    grid-template-columns: 1fr auto;
  }

  .job-row__progress {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .asset-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .caption-row {
    grid-template-columns: 1fr auto;
  }

  .caption-row :deep(.ant-input) {
    grid-row: 2;
    grid-column: 1 / -1;
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
</style>
