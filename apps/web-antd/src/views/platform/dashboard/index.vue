<script lang="ts" setup>
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
} from '#/api';
import {
  assetTypeIcons,
  assetTypeLabels,
} from '#/modules/platform/asset-types';
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();

const dashboard = ref<null | PlatformDashboard>(null);
const dashboardLoading = ref(true);
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

const currentProjectId = computed(
  () => dashboard.value?.currentProject?.id ?? platformStore.currentProjectId,
);

const quickEntries = computed(() => [
  {
    action: 'new-design',
    cta: '立即开始',
    description: '新建项目并进入设计会话',
    icon: 'lucide:wand-sparkles',
    label: '开始新设计',
    tone: 'red',
  },
  {
    action: 'history',
    cta: '继续设计',
    description: '查找并续接个人设计会话',
    icon: 'lucide:history',
    label: '查看我的设计',
    tone: 'violet',
  },
  {
    action: 'assets',
    cta: '进入中心',
    description: '管理当前项目的设计资产',
    icon: 'lucide:boxes',
    label: '查看资产中心',
    tone: 'blue',
  },
  {
    action: 'training',
    cta: '查看配置',
    description: '训练服务接入后配置专用模型',
    icon: 'lucide:graduation-cap',
    label: '开始模型训练',
    tone: 'green',
    unavailable: !applicationAvailable('lora-training'),
  },
  {
    action: 'report',
    cta: '查看状态',
    description: '基于项目成果生成交付报告',
    icon: 'lucide:file-chart-column',
    label: '开始报告生成',
    tone: 'orange',
    unavailable: !applicationAvailable('report-generator'),
  },
  {
    action: 'workspace',
    cta: '进入工作台',
    description: '查看项目、任务与协作信息',
    icon: 'lucide:panels-top-left',
    label: '设计工作台',
    tone: 'pink',
  },
]);

const heroMetrics = computed(() => [
  {
    icon: 'lucide:folder-kanban',
    label: '可访问项目',
    value: dashboard.value?.summary.projectCount,
  },
  {
    icon: 'lucide:library-big',
    label: '项目资产',
    value: dashboard.value?.flow.assetCount,
  },
  {
    icon: 'lucide:messages-square',
    label: '设计会话',
    value: dashboard.value?.flow.conversationCount,
  },
  {
    icon: 'lucide:sparkles',
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

function applicationAvailable(appKey: string) {
  const application = platformStore.applications.find(
    (item) => item.key === appKey,
  );
  return Boolean(application?.visible && application.capabilityCode);
}

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

function jobStatusLabel(status: string) {
  return (
    {
      cancelled: '已取消',
      cancelling: '取消中',
      failed: '执行异常',
      queued: '排队中',
      running: '运行中',
      succeeded: '已完成',
    }[status] ?? status
  );
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
  dashboardLoading.value = true;
  try {
    dashboard.value = await getDashboardApi();
    await Promise.all(
      dashboard.value.recentAssets
        .filter((asset) => asset.type === 'image')
        .map((asset) => loadPreview(asset.id)),
    );
  } finally {
    dashboardLoading.value = false;
  }
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
          :class="`tone-${entry.tone}`"
          :data-action="entry.action"
          :data-unavailable="entry.unavailable || undefined"
          :title="
            entry.unavailable ? '该外部服务与能力契约尚未接入' : undefined
          "
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
            <em v-if="entry.unavailable">待接入</em>
            <IconifyIcon v-else icon="lucide:arrow-right" />
          </span>
        </button>
      </nav>

      <section class="home-work-grid" aria-label="最近工作">
        <article class="home-panel home-panel--tasks">
          <header>
            <div>
              <span>RECENT TASKS</span>
              <h2>最近任务</h2>
            </div>
            <button type="button" @click="navigateTo('/jobs')">
              查看全部
              <IconifyIcon icon="lucide:arrow-right" />
            </button>
          </header>
          <div v-if="dashboardLoading" class="home-panel__empty compact">
            <IconifyIcon
              class="home-loading-icon"
              icon="lucide:loader-circle"
            />
            正在加载
          </div>
          <div v-else-if="dashboard?.recentJobs.length" class="home-task-list">
            <button
              v-for="job in dashboard.recentJobs"
              :key="job.id"
              type="button"
              @click="navigateTo('/jobs', job.projectId)"
            >
              <i :data-status="job.status"></i>
              <span>
                <strong>{{ job.name }}</strong>
                <small>
                  {{ job.appName }} · {{ job.projectName }} ·
                  {{ formatTime(job.createdAt) }}
                </small>
              </span>
              <em :data-status="job.status">
                {{ jobStatusLabel(job.status) }}
              </em>
            </button>
          </div>
          <div v-else class="home-panel__empty">
            <IconifyIcon icon="lucide:list-checks" />
            <span>当前账号暂无任务记录</span>
          </div>
        </article>

        <article class="home-panel home-panel--assets">
          <header>
            <div>
              <span>RECENT ASSETS</span>
              <h2>最近资产</h2>
            </div>
            <button type="button" @click="navigateTo('/assets')">
              查看全部
              <IconifyIcon icon="lucide:arrow-right" />
            </button>
          </header>
          <div v-if="dashboardLoading" class="home-panel__empty compact">
            <IconifyIcon
              class="home-loading-icon"
              icon="lucide:loader-circle"
            />
            正在加载
          </div>
          <div
            v-else-if="dashboard?.recentAssets.length"
            class="home-asset-list"
          >
            <button
              v-for="asset in dashboard.recentAssets"
              :key="asset.id"
              type="button"
              @click="
                navigateTo('/assets', asset.projectId, { assetId: asset.id })
              "
            >
              <span class="home-asset-list__preview">
                <img
                  v-if="asset.type === 'image' && previewUrl(asset.id)"
                  :alt="`${asset.name} 资产预览`"
                  :src="previewUrl(asset.id)"
                />
                <IconifyIcon v-else :icon="assetTypeIcons[asset.type]" />
              </span>
              <div>
                <strong>{{ asset.name }}</strong>
                <small>
                  {{ assetTypeLabels[asset.type] }} · {{ asset.projectName }}
                </small>
                <em>{{ asset.appName || '项目资产' }}</em>
              </div>
              <time :datetime="asset.createdAt">
                {{ formatTime(asset.createdAt) }}
              </time>
            </button>
          </div>
          <div v-else class="home-panel__empty">
            <IconifyIcon icon="lucide:library-big" />
            <span>当前账号暂无已生成资产</span>
          </div>
        </article>
      </section>

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
  min-height: 100%;
  padding: clamp(16px, 2vw, 28px);
  background:
    radial-gradient(circle at 92% 4%, rgb(201 24 56 / 5%), transparent 24%),
    #f5f7f9;
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
  background: linear-gradient(115deg, #fff 0%, #fffafa 56%, #fff3f5 100%);
  border: 1px solid #eadfe2;
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
  background: var(--rail-red);
}

.home-hero h1 {
  max-width: 640px;
  margin: 17px 0 0;
  font-size: clamp(29px, 2.7vw, 42px);
  font-weight: 760;
  line-height: 1.22;
  color: #17212b;
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
  color: #66727d;
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
  width: 22px;
  height: 22px;
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
  color: #1d2730;
}

.home-hero__metrics small {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: #7d8790;
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
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
}

.home-entry-grid button {
  --entry-color: #c51f3a;
  --entry-soft: #fff0f2;

  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  min-height: 194px;
  padding: 18px;
  color: #232d36;
  text-align: left;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e0e5e9;
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
  border-color: color-mix(in srgb, var(--entry-color) 34%, #e0e5e9);
  box-shadow: 0 15px 34px rgb(24 35 44 / 9%);
  transform: translateY(-3px);
}

.home-entry-grid button.tone-violet {
  --entry-color: #7c3aed;
  --entry-soft: #f4efff;
}

.home-entry-grid button.tone-blue {
  --entry-color: #2563eb;
  --entry-soft: #edf4ff;
}

.home-entry-grid button.tone-green {
  --entry-color: #238451;
  --entry-soft: #edf8f1;
}

.home-entry-grid button.tone-orange {
  --entry-color: #c86a18;
  --entry-soft: #fff4e9;
}

.home-entry-grid button.tone-pink {
  --entry-color: #c61f65;
  --entry-soft: #fff0f7;
}

.home-entry-card__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  color: var(--entry-color);
  background: var(--entry-soft);
  border-radius: 11px;
}

.home-entry-card__icon svg {
  width: 22px;
  height: 22px;
}

.home-entry-grid button > strong {
  margin-top: 14px;
  font-size: 15px;
}

.home-entry-grid button > small {
  min-height: 38px;
  margin-top: 7px;
  font-size: 12px;
  line-height: 1.55;
  color: #74808a;
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
  font-size: 12px;
  font-weight: 650;
  color: var(--entry-color);
  background: var(--entry-soft);
  border: 1px solid color-mix(in srgb, var(--entry-color) 24%, #fff);
  border-radius: 8px;
}

.home-entry-card__action em {
  padding: 2px 7px;
  font-size: 10px;
  font-style: normal;
  color: #8a6b47;
  background: #fff7e6;
  border-radius: 999px;
}

.home-entry-grid button[data-unavailable='true'] {
  --entry-color: #8a949c;
}

.home-work-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.home-panel {
  min-width: 0;
  padding: 18px;
  background: #fff;
  border: 1px solid #e0e5e9;
  border-radius: 16px;
  box-shadow: 0 8px 22px rgb(24 35 44 / 4%);
}

.home-panel > header {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  justify-content: space-between;
  min-height: 44px;
  padding-bottom: 13px;
  border-bottom: 1px solid #edf0f2;
}

.home-panel > header span {
  font-size: 9px;
  font-weight: 700;
  color: #a2717a;
  letter-spacing: 0.12em;
}

.home-panel h2 {
  margin: 3px 0 0;
  font-size: 15px;
  color: #28323b;
}

.home-panel > header button {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 4px;
  font-size: 11px;
  color: #7b858e;
  background: transparent;
  border: 0;
}

.home-asset-list,
.home-task-list {
  display: grid;
  gap: 8px;
  padding-top: 12px;
}

.home-asset-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.home-asset-list > button,
.home-task-list > button {
  display: grid;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 10px;
  color: #29333c;
  text-align: left;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 11px;
  transition:
    background-color 150ms ease,
    border-color 150ms ease;
}

.home-asset-list > button:hover,
.home-task-list > button:hover {
  background: #fff9fa;
  border-color: #ecd7db;
}

.home-asset-list > button {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 8px;
}

.home-asset-list__preview,
.home-history-list__preview {
  display: grid;
  place-items: center;
  overflow: hidden;
  color: var(--rail-red);
  background:
    linear-gradient(135deg, rgb(197 31 58 / 8%), rgb(37 99 235 / 6%)), #f5f7f9;
  border-radius: 10px;
}

.home-asset-list__preview {
  width: 100%;
  aspect-ratio: 16 / 9;
}

.home-asset-list__preview img,
.home-history-list__preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.home-asset-list__preview > svg,
.home-history-list__preview > svg {
  width: 22px;
  height: 22px;
  opacity: 0.58;
}

.home-asset-list strong,
.home-asset-list small,
.home-asset-list em,
.home-task-list strong,
.home-task-list small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-asset-list strong,
.home-task-list strong {
  font-size: 12px;
}

.home-asset-list small,
.home-asset-list em,
.home-task-list small,
.home-asset-list time {
  margin-top: 3px;
  font-size: 10px;
  color: #7a858e;
}

.home-asset-list > button > div {
  min-width: 0;
  padding: 4px 2px 0;
}

.home-asset-list em {
  font-style: normal;
  color: #9a6570;
}

.home-asset-list time {
  padding: 0 2px 2px;
}

.home-task-list > button {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.home-task-list > button > i {
  width: 7px;
  height: 7px;
  background: #99a2a9;
  border-radius: 50%;
}

.home-task-list > button > i[data-status='succeeded'] {
  background: #2f9565;
}

.home-task-list > button > i[data-status='running'],
.home-task-list > button > i[data-status='queued'] {
  background: #d28a2d;
}

.home-task-list > button > i[data-status='failed'] {
  background: #d43d4e;
}

.home-task-list > button > em,
.home-panel__summary {
  font-size: 9px;
  font-style: normal;
  color: #78838c;
  white-space: nowrap;
}

.home-task-list > button > em[data-status='failed'] {
  color: #c51f3a;
}

.home-panel__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 165px;
  font-size: 11px;
  color: #84909a;
}

.home-panel__empty.compact {
  flex-direction: row;
}

.home-panel__empty > svg {
  width: 24px;
  height: 24px;
  color: #c51f3a;
}

.home-data-note {
  display: flex;
  gap: 9px;
  align-items: center;
  justify-content: flex-end;
  min-height: 30px;
  padding: 0 4px;
  font-size: 10px;
  color: #7d8790;
}

.home-data-note > svg {
  color: #33835e;
}

.home-data-note > i {
  width: 1px;
  height: 12px;
  background: #ced4d9;
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
  color: #46505a;
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
  color: #71808c;
}

.home-history-filters input[type='date'] {
  min-height: 32px;
  padding: 4px 9px;
  color: #46505a;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
}

.home-history-list button {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  color: #1c252d;
  text-align: left;
  background: #fff;
  border: 1px solid #dde3e7;
  border-radius: 10px;
}

.home-history-list__preview {
  width: 76px;
  height: 50px;
}

.home-history-list button:hover {
  border-color: #c51f3a;
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
  color: #71808c;
}

.home-history-empty {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  color: #71808c;
}

.home-history-empty > svg {
  width: 34px;
  height: 34px;
  color: #c51f3a;
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

  .home-entry-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .home-entry-grid button {
    min-height: 174px;
  }

  .home-work-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .home-history-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 980px) {
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

  .home-entry-grid,
  .home-work-grid {
    grid-template-columns: 1fr;
  }

  .home-asset-list,
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
