<script lang="ts" setup>
import type { LoraAdapterStatus } from '#/api';
import type {
  DesignConversation,
  PlatformDashboard,
} from '#/modules/platform/types';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Input,
  message,
  Modal,
  Select,
  Textarea,
} from 'ant-design-vue';

import {
  getAssetPreviewApi,
  getDashboardApi,
  getDesignConversationsApi,
  getLoraStatusApi,
} from '#/api';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();

const dashboard = ref<null | PlatformDashboard>(null);
const createProjectOpen = ref(false);
const historyOpen = ref(false);
const projectName = ref('');
const projectDescription = ref('');
const projectSubmitting = ref(false);
const historyLoading = ref(false);
const historyKeyword = ref('');
const historyProjectId = ref('');
const historyStartDate = ref('');
const historyEndDate = ref('');
const myDesigns = ref<
  Array<
    DesignConversation & {
      projectCode: string;
      projectId: string;
      projectName: string;
    }
  >
>([]);
const previewUrls = reactive(new Map<string, string>());
const previewFailures = reactive(new Set<string>());
const loraStatus = ref<LoraAdapterStatus>();

interface QuickEntry {
  action: string;
  badge?: string;
  cta: string;
  description: string;
  icon: string;
  label: string;
  status?: 'error' | 'loading' | 'ready';
  title?: string;
}

const currentProjectId = computed(
  () => dashboard.value?.currentProject?.id ?? platformStore.currentProjectId,
);

const quickEntries = computed<QuickEntry[]>(() => {
  const trainingStatus = loraStatus.value;
  const trainingModel = trainingStatus?.models.find(
    (model) => model.key === trainingStatus.model,
  );
  let trainingBadge: string | undefined = '检测中';
  let trainingEntryStatus: QuickEntry['status'] = 'loading';
  if (trainingStatus) {
    if (trainingStatus.reachable) trainingBadge = undefined;
    else trainingBadge = trainingStatus.configured ? '服务异常' : '未配置';
    trainingEntryStatus = trainingStatus.reachable ? 'ready' : 'error';
  }
  const trainingEntry: QuickEntry = {
    action: 'training',
    badge: trainingBadge,
    cta: trainingStatus?.reachable ? '开始训练' : '进入训练配置',
    description: trainingStatus?.reachable
      ? `${trainingModel?.label ?? trainingStatus.model} · GPU ${trainingStatus.gpuIds ?? '0'}`
      : (trainingStatus?.reason ?? '正在检测 AI Toolkit 训练服务'),
    icon: platformSemanticIcons.modelTraining,
    label: '开始模型训练',
    status: trainingEntryStatus,
    title: trainingStatus?.reason,
  };
  return [
    {
      action: 'new-design',
      cta: '立即开始',
      description: '新建项目并进入设计会话',
      icon: platformSemanticIcons.newDesign,
      label: '开始新设计',
    },
    {
      action: 'history',
      cta: '继续设计',
      description: '查找并续接个人设计会话',
      icon: platformSemanticIcons.history,
      label: '查看我的设计',
    },
    {
      action: 'assets',
      cta: '进入中心',
      description: '按项目查看和管理设计资产',
      icon: platformSemanticIcons.assets,
      label: '查看资产中心',
    },
    trainingEntry,
    {
      action: 'report',
      cta: '开始生成',
      description: '基于项目成果生成交付报告',
      icon: platformSemanticIcons.report,
      label: '开始报告生成',
    },
    {
      action: 'workspace',
      cta: '进入工作台',
      description: '查看项目、任务与协作信息',
      icon: platformSemanticIcons.workbench,
      label: '设计工作台',
    },
  ];
});

const heroMetrics = computed(() => [
  {
    icon: platformSemanticIcons.projects,
    label: '可访问项目',
    value: dashboard.value?.summary.projectCount,
  },
  {
    icon: platformSemanticIcons.assets,
    label: '项目资产',
    value: dashboard.value?.flow.assetCount,
  },
  {
    icon: platformSemanticIcons.conversations,
    label: '设计会话',
    value: dashboard.value?.flow.conversationCount,
  },
  {
    icon: platformSemanticIcons.applications,
    label: '已发布应用',
    value: dashboard.value?.flow.applicationCount,
  },
]);

const historyProjectOptions = computed(() => [
  { label: '全部项目', value: '' },
  ...platformStore.projects.map((project) => ({
    label: `${project.name}（${project.code}）`,
    value: project.id,
  })),
]);

const filteredMyDesigns = computed(() => {
  const query = historyKeyword.value.trim().toLowerCase();
  const start = historyStartDate.value
    ? new Date(`${historyStartDate.value}T00:00:00`).getTime()
    : Number.NEGATIVE_INFINITY;
  const end = historyEndDate.value
    ? new Date(`${historyEndDate.value}T23:59:59.999`).getTime()
    : Number.POSITIVE_INFINITY;
  return myDesigns.value.filter((conversation) => {
    const updatedAt = new Date(conversation.updatedAt).getTime();
    return (
      (!historyProjectId.value ||
        conversation.projectId === historyProjectId.value) &&
      (!query ||
        `${conversation.title}${conversation.projectName}${conversation.projectCode}`
          .toLowerCase()
          .includes(query)) &&
      updatedAt >= start &&
      updatedAt <= end
    );
  });
});

function formatTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });
}

function previewUrl(assetId?: null | string) {
  return assetId ? previewUrls.get(assetId) : undefined;
}

async function loadPreview(assetId?: null | string) {
  if (!assetId || previewUrls.has(assetId) || previewFailures.has(assetId)) {
    return;
  }
  try {
    const preview = await getAssetPreviewApi(assetId);
    if (preview.mode === 'url') previewUrls.set(assetId, preview.url);
    else previewFailures.add(assetId);
  } catch {
    previewFailures.add(assetId);
  }
}

async function navigateTo(
  path: string,
  projectId?: null | string,
  query?: Record<string, string>,
) {
  if (projectId && projectId !== platformStore.currentProjectId) {
    await platformStore.switchProject(projectId);
  }
  await router.push({ path, query });
}

async function continueConversation(conversation: {
  id: string;
  projectId: string;
}) {
  historyOpen.value = false;
  await navigateTo('/design', conversation.projectId, {
    conversationId: conversation.id,
  });
}

function startNewFromHistory() {
  historyOpen.value = false;
  createProjectOpen.value = true;
}

async function openDesignHistory() {
  historyOpen.value = true;
  historyLoading.value = true;
  try {
    const results = await Promise.all(
      platformStore.projects.map(async (project) => {
        const conversations = await getDesignConversationsApi(project.id);
        return conversations
          .filter((conversation) => !conversation.legacy)
          .map((conversation) => ({
            ...conversation,
            projectCode: project.code,
            projectId: project.id,
            projectName: project.name,
          }));
      }),
    );
    myDesigns.value = results
      .flat()
      .toSorted(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    await Promise.all(
      myDesigns.value.map((conversation) =>
        loadPreview(conversation.previewAssetId),
      ),
    );
  } finally {
    historyLoading.value = false;
  }
}

function clearHistoryFilters() {
  historyKeyword.value = '';
  historyProjectId.value = '';
  historyStartDate.value = '';
  historyEndDate.value = '';
}

function activateQuickEntry(action: string) {
  if (action === 'new-design') {
    createProjectOpen.value = true;
    return;
  }
  if (action === 'history') {
    void openDesignHistory();
    return;
  }
  if (action === 'assets') {
    void navigateTo('/assets', currentProjectId.value);
    return;
  }
  if (action === 'workspace') {
    void navigateTo('/projects', currentProjectId.value);
    return;
  }

  if (action === 'training') {
    void navigateTo('/model-training', currentProjectId.value);
    return;
  }
  if (action === 'report') {
    void navigateTo('/report-generation', currentProjectId.value);
  }
}

async function createProjectAndDesign() {
  const name = projectName.value.trim();
  if (!name) {
    message.warning('请输入项目名称');
    return;
  }
  projectSubmitting.value = true;
  try {
    const project = await platformStore.addProject(
      name,
      projectDescription.value.trim() || '新建轨道客室设计项目。',
    );
    createProjectOpen.value = false;
    projectName.value = '';
    projectDescription.value = '';
    message.success(`项目“${project.name}”已创建`);
    await navigateTo('/design', project.id);
  } finally {
    projectSubmitting.value = false;
  }
}

async function loadDashboard() {
  const [dashboardResult, loraStatusResult] = await Promise.all([
    getDashboardApi(),
    getLoraStatusApi().catch(
      (): LoraAdapterStatus => ({
        configured: false,
        model: 'flux2-klein-9b',
        models: [],
        reachable: false,
        reason: '无法读取 AI Toolkit 训练服务状态',
      }),
    ),
  ]);
  dashboard.value = dashboardResult;
  loraStatus.value = loraStatusResult;
}

onMounted(loadDashboard);
onBeforeUnmount(() => {
  for (const url of previewUrls.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
});
</script>

<template>
  <main class="platform-page home-page">
    <div class="home-shell">
      <section class="home-hero" aria-labelledby="home-welcome-title">
        <div class="home-hero__content">
          <span class="home-hero__eyebrow">
            <i></i>
            RAIL CABIN AI DESIGN
          </span>
          <h1 id="home-welcome-title">
            让客室内装设计
            <em>更聚焦、更高效</em>
          </h1>
          <p>
            从项目、设计会话到任务与资产，使用可追溯的真实数据组织轨道客室智能设计流程。
          </p>

          <div class="home-hero__metrics" aria-label="平台数据概览">
            <div v-for="metric in heroMetrics" :key="metric.label">
              <IconifyIcon :icon="metric.icon" />
              <span>
                <strong>{{ metric.value ?? '—' }}</strong>
                <small>{{ metric.label }}</small>
              </span>
            </div>
          </div>
        </div>

        <div class="home-hero__visual" aria-hidden="true">
          <svg viewBox="0 0 720 370">
            <defs>
              <linearGradient id="cabin-glow" x1="0" x2="1">
                <stop offset="0" stop-color="#fff" stop-opacity="0" />
                <stop offset="1" stop-color="#f8cfd6" stop-opacity=".72" />
              </linearGradient>
            </defs>
            <path
              class="wash"
              d="M80 330C190 210 270 142 405 92 510 53 612 72 720 120v250H0Z"
            />
            <g class="cabin-lines">
              <path d="M43 323 202 177l298-92 188 81" />
              <path d="M119 327 246 211l264-80 178 77" />
              <path d="M192 330 286 244l235-69 167 72" />
              <path d="M201 177v150M246 211v116M286 244v86" />
              <path d="M500 85v245M510 131v199M521 175v155" />
              <path d="m202 177 44 34 40 33 235-69-11-44-10-46" />
              <path
                d="M340 227v103M403 208v122M462 191v139M580 206v124M640 230v100"
              />
              <path d="M43 323h645M79 292h609M112 263h576M150 228h538" />
              <path d="m409 208 33-66 173 16 61 61" />
              <path d="m427 204 27-48 150 15 50 47" />
              <path d="M454 156v129M604 171v142" />
              <path d="M293 330c45-37 95-53 151-53 63 0 107 19 142 53" />
              <path d="M328 330c35-26 73-37 116-37 47 0 83 13 108 37" />
            </g>
          </svg>
        </div>
      </section>

      <nav class="home-entry-grid" aria-label="首页功能导航">
        <button
          v-for="entry in quickEntries"
          :key="entry.action"
          :data-action="entry.action"
          :data-status="entry.status"
          :title="entry.title"
          type="button"
          @click="activateQuickEntry(entry.action)"
        >
          <span class="home-entry-card__icon">
            <IconifyIcon :icon="entry.icon" />
          </span>
          <strong>{{ entry.label }}</strong>
          <small>{{ entry.description }}</small>
          <span class="home-entry-card__action">
            {{ entry.cta }}
            <em v-if="entry.badge">{{ entry.badge }}</em>
            <IconifyIcon v-else icon="lucide:arrow-right" />
          </span>
        </button>
      </nav>

      <footer class="home-data-note">
        <IconifyIcon icon="lucide:shield-check" />
        <span>以上数据按当前账号权限实时汇总</span>
        <i></i>
        <span v-if="dashboard?.currentProject">
          当前项目：{{ dashboard.currentProject.name }}
        </span>
        <span v-else>尚未选择项目</span>
      </footer>
    </div>

    <Modal
      v-model:open="createProjectOpen"
      :confirm-loading="projectSubmitting"
      ok-text="创建并开始设计"
      title="开始新设计"
      @ok="createProjectAndDesign"
    >
      <div class="home-project-form">
        <label>
          <span>项目名称</span>
          <Input
            v-model:value="projectName"
            :maxlength="160"
            placeholder="例如：出口动车组客室内装方案"
            @press-enter="createProjectAndDesign"
          />
        </label>
        <label>
          <span>任务描述</span>
          <Textarea
            v-model:value="projectDescription"
            :maxlength="2000"
            :rows="4"
            placeholder="说明车型、设计范围、交付目标和关键约束"
          />
        </label>
      </div>
    </Modal>

    <Modal
      v-model:open="historyOpen"
      :footer="null"
      title="查看我的设计"
      width="min(920px, 94vw)"
    >
      <div class="home-history-filters" aria-label="设计会话筛选">
        <Select
          v-model:value="historyProjectId"
          :options="historyProjectOptions"
          aria-label="按项目筛选"
        />
        <Input
          v-model:value="historyKeyword"
          allow-clear
          aria-label="按任务名筛选"
          placeholder="搜索任务或设计名称"
        >
          <template #prefix>
            <IconifyIcon icon="lucide:search" />
          </template>
        </Input>
        <label>
          <span>开始时间</span>
          <input v-model="historyStartDate" aria-label="开始时间" type="date" />
        </label>
        <label>
          <span>结束时间</span>
          <input v-model="historyEndDate" aria-label="结束时间" type="date" />
        </label>
        <Button @click="clearHistoryFilters">清空</Button>
      </div>
      <div v-if="historyLoading" class="home-history-empty">
        <IconifyIcon class="home-loading-icon" icon="lucide:loader-circle" />
        <span>正在加载全部设计会话</span>
      </div>
      <div v-else-if="filteredMyDesigns.length" class="home-history-list">
        <button
          v-for="conversation in filteredMyDesigns"
          :key="conversation.id"
          type="button"
          @click="continueConversation(conversation)"
        >
          <span class="home-history-list__preview">
            <img
              v-if="previewUrl(conversation.previewAssetId)"
              :alt="`${conversation.title} 设计资产预览`"
              :src="previewUrl(conversation.previewAssetId)"
            />
            <IconifyIcon v-else icon="lucide:image-off" />
          </span>
          <span>
            <strong>{{ conversation.title }}</strong>
            <small>
              {{ conversation.projectName }} · {{ conversation.roundCount }} 轮
            </small>
          </span>
          <time :datetime="conversation.updatedAt">
            {{ formatTime(conversation.updatedAt) }}
          </time>
          <IconifyIcon icon="lucide:chevron-right" />
        </button>
      </div>
      <div v-else class="home-history-empty">
        <IconifyIcon icon="lucide:message-square-plus" />
        <span>
          {{
            myDesigns.length
              ? '没有符合当前筛选条件的设计会话'
              : '还没有可继续的设计会话'
          }}
        </span>
        <Button v-if="myDesigns.length" @click="clearHistoryFilters">
          清空筛选
        </Button>
        <Button v-else type="primary" @click="startNewFromHistory">
          开始新设计
        </Button>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.home-page {
  --home-accent: #c71938;
  --home-accent-soft: #fff1f3;
  --home-border: var(--rail-theme-border, #e4e7ec);

  min-height: 100%;
  padding: clamp(16px, 2vw, 28px);
  background:
    radial-gradient(circle at 92% 4%, rgb(201 24 56 / 5%), transparent 24%),
    var(--rail-theme-surface, #f5f7f9);
}

.home-shell {
  display: grid;
  gap: 22px;
  width: min(1560px, 100%);
  margin: 0 auto;
}

.home-hero {
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(700px, 1.15fr) minmax(400px, 0.85fr);
  min-height: 310px;
  overflow: hidden;
  background: linear-gradient(
    115deg,
    var(--rail-theme-surface, #fff) 0%,
    var(--rail-theme-surface, #fffafa) 56%,
    var(--rail-theme-surface, #fff3f5) 100%
  );
  border: 1px solid var(--rail-theme-border, #eadfe2);
  border-radius: 22px;
  box-shadow: 0 18px 42px rgb(29 39 49 / 5%);
}

.home-hero::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background-image:
    linear-gradient(rgb(197 31 58 / 4%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(197 31 58 / 4%) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: linear-gradient(90deg, transparent 45%, #000 100%);
}

.home-hero__content {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 40px clamp(34px, 4vw, 64px);
}

.home-hero__eyebrow {
  display: flex;
  gap: 9px;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  color: #8b5962;
  letter-spacing: 0.14em;
}

.home-hero__eyebrow i {
  width: 22px;
  height: 2px;
  background: var(--rail-theme-solid-accent, var(--rail-red));
}

.home-hero h1 {
  max-width: 640px;
  margin: 17px 0 0;
  font-size: clamp(29px, 2.7vw, 42px);
  font-weight: 760;
  line-height: 1.22;
  color: var(--rail-theme-text, #17212b);
  letter-spacing: -0.04em;
}

.home-hero h1 em {
  margin-left: 8px;
  font-style: normal;
  color: var(--rail-red);
}

.home-hero__content > p {
  max-width: 660px;
  margin: 14px 0 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--rail-theme-secondary, #66727d);
}

.home-hero__metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  max-width: 690px;
  margin-top: 30px;
}

.home-hero__metrics > div {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.home-hero__metrics > div > svg {
  width: var(--rail-icon-md);
  height: var(--rail-icon-md);
  color: var(--rail-red);
}

.home-hero__metrics span,
.home-hero__metrics strong,
.home-hero__metrics small {
  display: block;
}

.home-hero__metrics strong {
  font-size: 21px;
  line-height: 1.1;
  color: var(--rail-theme-text, #1d2730);
}

.home-hero__metrics small {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--rail-theme-secondary, #7d8790);
  white-space: nowrap;
}

.home-hero__visual {
  position: relative;
  z-index: 1;
  min-height: 310px;
}

.home-hero__visual > svg {
  position: absolute;
  right: -34px;
  bottom: -10px;
  width: min(720px, 120%);
  height: auto;
}

.home-hero__visual .wash {
  fill: url('#cabin-glow');
}

.cabin-lines {
  opacity: 0.55;
  fill: none;
  stroke: #c97c89;
  stroke-width: 1.1;
}

.home-entry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.home-entry-grid button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  min-height: 216px;
  padding: 24px;
  color: var(--rail-theme-text, #232d36);
  text-align: left;
  cursor: pointer;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--home-border);
  border-radius: 16px;
  box-shadow: 0 8px 22px rgb(24 35 44 / 4%);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.home-entry-grid button:hover,
.home-entry-grid button:focus-visible {
  outline: none;
  border-color: var(--rail-theme-border, #e4b5bf);
  box-shadow: 0 15px 34px rgb(24 35 44 / 9%);
  transform: translateY(-3px);
}

.home-entry-card__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  color: var(--home-accent);
  background: var(--home-accent-soft);
  border-radius: 11px;
}

.home-entry-card__icon svg {
  width: var(--rail-icon-md);
  height: var(--rail-icon-md);
}

.home-entry-grid button > strong {
  margin-top: 14px;
  font-size: var(--rail-font-section-title);
  font-weight: 700;
}

.home-entry-grid button > small {
  min-height: 38px;
  margin-top: 7px;
  font-size: var(--rail-font-label);
  line-height: 1.55;
  color: var(--rail-theme-secondary, #74808a);
}

.home-entry-card__action {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 34px;
  padding: 8px 10px;
  margin-top: auto;
  font-size: var(--rail-font-label);
  font-weight: 650;
  color: var(--home-accent);
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #e4b5bf);
  border-radius: 8px;
}

.home-entry-grid button:hover .home-entry-card__action,
.home-entry-grid button:focus-visible .home-entry-card__action {
  background: var(--home-accent-soft);
}

.home-entry-card__action em {
  padding: 2px 7px;
  font-size: var(--rail-font-caption);
  font-style: normal;
  color: #8a6b47;
  background: var(--rail-theme-surface, #fff7e6);
  border-radius: 999px;
}

.home-entry-grid button[data-status='ready'] .home-entry-card__action em {
  color: #166b42;
  background: var(--rail-theme-surface, #dcfce7);
}

.home-entry-grid button[data-status='error'] .home-entry-card__action em {
  color: var(--rail-theme-accent, #9f2d2d);
  background: var(--rail-theme-surface, #fff0f0);
}

.home-entry-grid button[data-status='loading'] .home-entry-card__action em {
  color: var(--rail-theme-secondary, #5f6b75);
  background: var(--rail-theme-surface, #eef1f4);
}

.home-history-list__preview {
  display: grid;
  place-items: center;
  width: 76px;
  height: 50px;
  overflow: hidden;
  color: var(--rail-red);
  background:
    linear-gradient(135deg, rgb(199 25 56 / 8%), rgb(199 25 56 / 2%)),
    var(--rail-theme-surface, #f5f7f9);
  border-radius: 10px;
}

.home-history-list__preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.home-history-list__preview:has(img) {
  background: var(--rail-theme-surface, #fff);
}

.home-history-list__preview > svg {
  width: 22px;
  height: 22px;
  opacity: 0.58;
}

.home-data-note {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  align-items: center;
  justify-content: flex-end;
  min-height: 30px;
  padding: 0 4px;
  font-size: var(--rail-font-caption);
  color: var(--rail-theme-secondary, #7d8790);
}

.home-data-note > svg {
  color: #33835e;
}

.home-data-note > i {
  width: 1px;
  height: 12px;
  background: var(--rail-theme-surface, #ced4d9);
}

.home-project-form,
.home-project-form label {
  display: grid;
  gap: 8px;
}

.home-project-form {
  gap: 18px;
  padding: 8px 0;
}

.home-project-form label > span {
  font-size: 13px;
  font-weight: 650;
  color: var(--rail-theme-text, #46505a);
}

.home-history-list {
  display: grid;
  gap: 8px;
  max-height: 480px;
  overflow: auto;
}

.home-history-filters {
  display: grid;
  grid-template-columns:
    minmax(180px, 1fr) minmax(220px, 1.25fr)
    auto auto auto;
  gap: 10px;
  align-items: end;
  margin-bottom: 14px;
}

.home-history-filters > label {
  display: grid;
  gap: 4px;
}

.home-history-filters > label > span {
  font-size: 11px;
  color: var(--rail-theme-secondary, #71808c);
}

.home-history-filters input[type='date'] {
  min-height: 32px;
  padding: 4px 9px;
  color: var(--rail-theme-text, #46505a);
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #d9d9d9);
  border-radius: 6px;
}

.home-history-list button {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  color: var(--rail-theme-text, #1c252d);
  text-align: left;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #dde3e7);
  border-radius: 10px;
}

.home-history-list button:hover {
  border-color: var(--rail-theme-accent, #c51f3a);
}

.home-history-list button > span,
.home-history-list strong,
.home-history-list small {
  display: block;
  min-width: 0;
}

.home-history-list strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-history-list small,
.home-history-list time {
  margin-top: 5px;
  font-size: 12px;
  color: var(--rail-theme-secondary, #71808c);
}

.home-history-empty {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: var(--rail-theme-secondary, #71808c);
}

.home-history-empty > svg {
  width: 34px;
  height: 34px;
  color: var(--rail-theme-accent, #c51f3a);
}

.home-loading-icon {
  animation: home-spin 1s linear infinite;
}

@keyframes home-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1280px) {
  .home-hero {
    grid-template-columns: minmax(500px, 1.15fr) minmax(360px, 0.85fr);
  }

  .home-history-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 980px) {
  .home-entry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .home-entry-grid button {
    min-height: 200px;
    padding: 20px;
  }

  .home-hero {
    grid-template-columns: 1fr;
  }

  .home-hero__visual {
    display: none;
  }

  .home-hero__content {
    min-height: 300px;
  }
}

@media (max-width: 720px) {
  .home-page {
    padding: 12px;
  }

  .home-hero__content {
    min-height: auto;
    padding: 28px 22px;
  }

  .home-hero h1 em {
    display: block;
    margin: 5px 0 0;
  }

  .home-hero__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .home-entry-grid {
    grid-template-columns: 1fr;
  }

  .home-history-filters {
    grid-template-columns: 1fr;
  }

  .home-history-list button {
    grid-template-columns: 64px minmax(0, 1fr) auto;
  }

  .home-history-list button > time {
    display: none;
  }

  .home-history-list__preview {
    width: 64px;
  }
}

@media (max-width: 440px) {
  .home-hero__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
