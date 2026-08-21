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
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import {
  getAssetPreviewApi,
  getDashboardApi,
  getDesignConversationsApi,
} from '#/api';
import PageHeading from '#/components/platform/page-heading.vue';
import {
  assetTypeIcons,
  assetTypeLabels,
} from '#/modules/platform/asset-types';
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();
const dashboard = ref<null | PlatformDashboard>(null);
const loading = ref(true);
const quickStartOpen = ref(false);
const quickStartSubmitting = ref(false);
const myDesignsOpen = ref(false);
const myDesignsLoading = ref(false);
const projectName = ref('');
const projectDescription = ref('');
const conversationKeyword = ref('');
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
const maxTrendTotal = computed(() =>
  Math.max(
    1,
    ...(dashboard.value?.jobTrend.map(
      (item) => item.succeeded + item.failed + item.running + item.cancelled,
    ) ?? [1]),
  ),
);
const totalJobs = computed(() => {
  const status = dashboard.value?.jobStatuses;
  return status
    ? status.succeeded +
        status.failed +
        status.running +
        status.queued +
        status.cancelled
    : 0;
});
const statusSegments = computed(() => {
  const status = dashboard.value?.jobStatuses;
  if (!status || totalJobs.value === 0) return [];
  return [
    { color: '#2f815e', label: '完成', value: status.succeeded },
    { color: '#c51f3a', label: '运行', value: status.running },
    { color: '#b47a2a', label: '排队', value: status.queued },
    { color: '#d84a4a', label: '异常', value: status.failed },
    { color: '#a7afb6', label: '取消', value: status.cancelled },
  ].filter((item) => item.value > 0);
});
const donutStyle = computed(() => {
  if (statusSegments.value.length === 0) {
    return { background: 'conic-gradient(#e6e9ec 0 100%)' };
  }
  let offset = 0;
  const stops = statusSegments.value.map((item) => {
    const start = offset;
    offset += (item.value / totalJobs.value) * 100;
    return `${item.color} ${start}% ${offset}%`;
  });
  return { background: `conic-gradient(${stops.join(',')})` };
});
const maxAssetCount = computed(() =>
  Math.max(
    1,
    ...(dashboard.value?.assetTypes.map((item) => item.count) ?? [1]),
  ),
);
const filteredMyDesigns = computed(() => {
  const query = conversationKeyword.value.trim().toLowerCase();
  if (!query) return myDesigns.value;
  return myDesigns.value.filter((conversation) =>
    `${conversation.title}${conversation.projectName}${conversation.projectCode}`
      .toLowerCase()
      .includes(query),
  );
});
const flowNodes = computed(() => [
  {
    count: dashboard.value?.flow.assetCount ?? 0,
    icon: 'lucide:library-big',
    key: 'assets',
    label: '项目资产',
    path: '/projects',
    unit: '项',
  },
  {
    count: dashboard.value?.flow.conversationCount ?? 0,
    icon: 'lucide:message-square-more',
    key: 'design',
    label: '开始设计',
    path: '/design',
    unit: '个会话',
  },
  {
    count: dashboard.value?.flow.applicationCount ?? 0,
    icon: 'lucide:sparkles',
    key: 'applications',
    label: 'AI 应用',
    path: '/design',
    unit: '项能力',
  },
  {
    count: dashboard.value?.flow.runningJobCount ?? 0,
    icon: 'lucide:activity',
    key: 'jobs',
    label: '任务执行',
    path: '/projects',
    unit: '项运行',
  },
  {
    count: dashboard.value?.flow.resultCount ?? 0,
    icon: 'lucide:package-check',
    key: 'results',
    label: '设计成果',
    path: '/projects',
    unit: '项入库',
  },
]);

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

function weekday(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString('zh-CN', {
    weekday: 'short',
  });
}

function jobStatusLabel(status: string) {
  return (
    {
      cancelled: '已取消',
      cancelling: '取消中',
      failed: '异常',
      queued: '排队中',
      running: '运行中',
      succeeded: '已完成',
    }[status] ?? status
  );
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

async function continueConversation(
  conversation: PlatformDashboard['recentConversations'][number],
) {
  await navigateTo('/design', conversation.projectId, {
    conversationId: conversation.id,
  });
}

async function createQuickDesign() {
  const name = projectName.value.trim();
  if (!name) {
    message.warning('请输入项目名称');
    return;
  }
  quickStartSubmitting.value = true;
  try {
    await platformStore.addProject(
      name,
      projectDescription.value.trim() || '新建客运装备内装设计项目。',
    );
    quickStartOpen.value = false;
    projectName.value = '';
    projectDescription.value = '';
    await router.push('/design');
    message.success('项目已创建，可以开始设计');
  } finally {
    quickStartSubmitting.value = false;
  }
}

async function openMyDesigns() {
  myDesignsOpen.value = true;
  myDesignsLoading.value = true;
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
  } finally {
    myDesignsLoading.value = false;
  }
}

async function continueMyDesign(
  conversation: (typeof myDesigns.value)[number],
) {
  myDesignsOpen.value = false;
  await navigateTo('/design', conversation.projectId, {
    conversationId: conversation.id,
  });
}

async function openRecentAsset(
  asset: PlatformDashboard['recentAssets'][number],
) {
  await navigateTo('/assets', asset.projectId, { assetId: asset.id });
}

function projectAssetBreakdown(
  project: PlatformDashboard['recentProjects'][number],
) {
  if (project.assetTypes.length === 0) return '暂无资产';
  const visible = project.assetTypes
    .slice(0, 3)
    .map((item) => `${assetTypeLabels[item.type]} ${item.count}`);
  const hidden = project.assetTypes.length - visible.length;
  return hidden > 0
    ? `${visible.join(' · ')} · 其他 ${hidden} 类`
    : visible.join(' · ');
}

async function loadPreview(assetId: string) {
  if (previewUrls.has(assetId) || previewFailures.has(assetId)) return;
  try {
    const preview = await getAssetPreviewApi(assetId);
    if (preview.mode === 'url') previewUrls.set(assetId, preview.url);
  } catch {
    previewFailures.add(assetId);
  }
}

async function loadDashboard() {
  loading.value = true;
  try {
    dashboard.value = await getDashboardApi();
    const imageAssetIds = new Set<string>();
    for (const item of dashboard.value.recentConversations) {
      if (item.previewAssetId) imageAssetIds.add(item.previewAssetId);
    }
    for (const item of dashboard.value.recentAssets) {
      if (item.type === 'image') imageAssetIds.add(item.id);
    }
    await Promise.all(
      [...imageAssetIds].map((assetId) => loadPreview(assetId)),
    );
  } finally {
    loading.value = false;
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
  <main class="platform-page design-dashboard-page">
    <PageHeading
      description="从项目、设计会话和资产出发，继续可追溯的智能设计流程。"
      eyebrow="Rail design workspace"
      title="欢迎使用客运装备内装模块化分区快速设计平台"
    />

    <div v-if="loading" class="platform-content dashboard-loading">
      <IconifyIcon icon="lucide:loader-circle" />
      正在加载工作台
    </div>

    <div v-else-if="dashboard" class="platform-content dashboard-content">
      <section class="dashboard-panel quick-entry-panel">
        <header class="dashboard-panel__heading compact">
          <div>
            <small>QUICK START</small>
            <h2>快速开始</h2>
          </div>
          <span>常用功能与当前接入状态</span>
        </header>
        <div class="quick-entry-grid">
          <button
            class="quick-entry-card quick-entry-card--primary"
            data-testid="quick-start-design"
            type="button"
            @click="quickStartOpen = true"
          >
            <IconifyIcon icon="lucide:square-pen" />
            <span>
              <strong>开始新设计</strong>
              <small>新建项目并进入设计会话</small>
            </span>
            <IconifyIcon icon="lucide:arrow-up-right" />
          </button>
          <button
            class="quick-entry-card"
            data-testid="quick-open-designs"
            type="button"
            @click="openMyDesigns"
          >
            <IconifyIcon icon="lucide:history" />
            <span>
              <strong>查看我的设计</strong>
              <small>搜索并续接历史设计会话</small>
            </span>
            <IconifyIcon icon="lucide:arrow-up-right" />
          </button>
          <button
            class="quick-entry-card"
            :disabled="!dashboard.currentProject"
            type="button"
            @click="navigateTo('/assets', currentProjectId)"
          >
            <IconifyIcon icon="lucide:library-big" />
            <span>
              <strong>资产中心</strong>
              <small>管理当前项目设计成果</small>
            </span>
            <IconifyIcon icon="lucide:arrow-up-right" />
          </button>
          <button
            class="quick-entry-card is-planned"
            disabled
            title="训练服务协议尚未确定"
            type="button"
          >
            <IconifyIcon icon="lucide:brain-circuit" />
            <span>
              <strong>开始模型训练</strong>
              <small>外部训练服务待接入</small>
            </span>
            <em>待接入</em>
          </button>
          <button
            class="quick-entry-card is-planned"
            disabled
            title="Word/PPT 生成技术路线尚未确定"
            type="button"
          >
            <IconifyIcon icon="lucide:file-chart-column" />
            <span>
              <strong>开始报告生成</strong>
              <small>模板与生成服务待确定</small>
            </span>
            <em>待接入</em>
          </button>
          <button
            class="quick-entry-card"
            type="button"
            @click="navigateTo('/projects')"
          >
            <IconifyIcon icon="lucide:layout-dashboard" />
            <span>
              <strong>设计工作台</strong>
              <small>进入项目空间与协作管理</small>
            </span>
            <IconifyIcon icon="lucide:arrow-up-right" />
          </button>
        </div>
      </section>

      <section v-if="!dashboard.currentProject" class="dashboard-empty">
        <IconifyIcon icon="lucide:folder-plus" />
        <h2>从第一个项目开始</h2>
        <p>项目承载设计会话、任务与资产。</p>
        <Button type="primary" @click="navigateTo('/projects')">
          创建项目
        </Button>
      </section>

      <template v-else>
        <section class="dashboard-panel design-flow-panel">
          <header class="dashboard-panel__heading">
            <div>
              <small>CORE WORKFLOW</small>
              <h2>平台设计闭环</h2>
            </div>
          </header>
          <div class="design-cycle-scroll dashboard-scroll-region">
            <div class="design-cycle" aria-label="平台核心功能关系图">
              <div class="design-cycle__orbit-wrap" aria-hidden="true">
                <svg class="design-cycle__orbit" viewBox="0 0 420 420">
                  <defs>
                    <filter
                      id="design-cycle-pulse-glow"
                      height="400%"
                      width="400%"
                      x="-150%"
                      y="-150%"
                    >
                      <feGaussianBlur result="pulse-blur" stdDeviation="2.4" />
                      <feMerge>
                        <feMergeNode in="pulse-blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <circle
                    class="design-cycle__track-halo"
                    cx="210"
                    cy="210"
                    r="188"
                  />
                  <circle
                    class="design-cycle__track"
                    cx="210"
                    cy="210"
                    r="180"
                  />
                  <circle
                    class="design-cycle__data-rail"
                    cx="210"
                    cy="210"
                    pathLength="100"
                    r="180"
                  />
                  <circle
                    class="design-cycle__inner-rail"
                    cx="210"
                    cy="210"
                    pathLength="100"
                    r="164"
                  />
                  <g
                    class="design-cycle__data-pulse design-cycle__data-pulse--1"
                  >
                    <circle
                      class="design-cycle__pulse-halo"
                      cx="210"
                      cy="30"
                      r="8"
                    />
                    <circle
                      class="design-cycle__pulse-core"
                      cx="210"
                      cy="30"
                      r="3"
                    />
                  </g>
                  <g
                    class="design-cycle__data-pulse design-cycle__data-pulse--2"
                  >
                    <circle
                      class="design-cycle__pulse-halo"
                      cx="210"
                      cy="30"
                      r="8"
                    />
                    <circle
                      class="design-cycle__pulse-core"
                      cx="210"
                      cy="30"
                      r="3"
                    />
                  </g>
                  <g
                    class="design-cycle__data-pulse design-cycle__data-pulse--3"
                  >
                    <circle
                      class="design-cycle__pulse-halo"
                      cx="210"
                      cy="30"
                      r="8"
                    />
                    <circle
                      class="design-cycle__pulse-core"
                      cx="210"
                      cy="30"
                      r="3"
                    />
                  </g>
                </svg>
                <div class="design-cycle__center">
                  <IconifyIcon icon="lucide:refresh-cw" />
                  <b>持续设计</b>
                  <small>输入 · 生成 · 验证 · 入库</small>
                </div>
              </div>

              <button
                v-for="node in flowNodes"
                :key="node.key"
                :class="[`design-cycle__node--${node.key}`]"
                class="design-cycle__node"
                @click="navigateTo(node.path, currentProjectId)"
              >
                <span><IconifyIcon :icon="node.icon" /></span>
                <i>
                  <b>{{ node.label }}</b>
                  <small>{{ node.count }} {{ node.unit }}</small>
                </i>
              </button>
            </div>
          </div>
        </section>

        <div class="dashboard-grid dashboard-grid--charts">
          <section class="dashboard-panel trend-panel">
            <header class="dashboard-panel__heading compact">
              <div>
                <small>LAST 7 DAYS</small>
                <h2>任务趋势</h2>
              </div>
              <div class="chart-legend">
                <span>
                  <i class="success"></i>
                  完成
                </span>
                <span>
                  <i class="running"></i>
                  运行
                </span>
                <span>
                  <i class="failed"></i>
                  异常
                </span>
              </div>
            </header>
            <div class="trend-chart-scroll dashboard-scroll-region">
              <div class="trend-chart" aria-label="最近七天个人任务趋势图">
                <button
                  v-for="item in dashboard.jobTrend"
                  :key="item.day"
                  :aria-label="`${item.day}：完成${item.succeeded}，运行${item.running}，异常${item.failed}`"
                  class="trend-column"
                  @click="navigateTo('/projects')"
                >
                  <span class="trend-stack">
                    <i
                      class="success"
                      :style="{
                        height: `${(item.succeeded / maxTrendTotal) * 100}%`,
                      }"
                    ></i>
                    <i
                      class="running"
                      :style="{
                        height: `${(item.running / maxTrendTotal) * 100}%`,
                      }"
                    ></i>
                    <i
                      class="failed"
                      :style="{
                        height: `${(item.failed / maxTrendTotal) * 100}%`,
                      }"
                    ></i>
                  </span>
                  <small>{{ weekday(item.day) }}</small>
                </button>
              </div>
            </div>
          </section>

          <section class="dashboard-panel status-panel">
            <header class="dashboard-panel__heading compact">
              <div>
                <small>MY TASKS</small>
                <h2>任务状态</h2>
              </div>
              <button @click="navigateTo('/projects')">
                按项目查看
                <IconifyIcon icon="lucide:arrow-up-right" />
              </button>
            </header>
            <div class="status-chart dashboard-scroll-region">
              <button
                :style="donutStyle"
                aria-label="按项目查看任务"
                class="status-donut"
                @click="navigateTo('/projects')"
              >
                <span>
                  <strong>{{ totalJobs }}</strong>
                  <small>任务</small>
                </span>
              </button>
              <div class="status-legend">
                <button
                  v-for="item in statusSegments"
                  :key="item.label"
                  @click="navigateTo('/projects')"
                >
                  <i :style="{ background: item.color }"></i>
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </button>
                <small v-if="!statusSegments.length">暂无任务记录</small>
              </div>
            </div>
          </section>
        </div>

        <div class="dashboard-grid dashboard-grid--work">
          <section class="dashboard-panel conversations-panel">
            <header class="dashboard-panel__heading compact">
              <div>
                <small>CONTINUE DESIGN</small>
                <h2>继续设计</h2>
              </div>
              <button @click="navigateTo('/design', currentProjectId)">
                开始设计
                <IconifyIcon icon="lucide:arrow-up-right" />
              </button>
            </header>
            <div
              v-if="dashboard.recentConversations.length"
              class="conversation-list dashboard-scroll-region"
            >
              <button
                v-for="conversation in dashboard.recentConversations"
                :key="conversation.id"
                @click="continueConversation(conversation)"
              >
                <span class="conversation-preview">
                  <img
                    v-if="
                      conversation.previewAssetId &&
                      previewUrls.get(conversation.previewAssetId)
                    "
                    :alt="`${conversation.title}最近结果`"
                    :src="previewUrls.get(conversation.previewAssetId)"
                  />
                  <IconifyIcon v-else icon="lucide:message-square-more" />
                </span>
                <span class="conversation-copy">
                  <b>{{ conversation.title }}</b>
                  <small>
                    {{ conversation.projectName }} ·
                    {{ conversation.lastAppName ?? '文生文' }}
                  </small>
                </span>
                <span class="conversation-meta">
                  <i v-if="conversation.activeJobCount"></i>
                  {{ conversation.roundCount }} 轮 ·
                  {{ formatTime(conversation.updatedAt) }}
                </span>
                <IconifyIcon icon="lucide:chevron-right" />
              </button>
            </div>
            <div v-else class="panel-empty">
              <IconifyIcon icon="lucide:message-square-plus" />
              <span>暂无设计会话</span>
            </div>
          </section>

          <section class="dashboard-panel assets-chart-panel">
            <header class="dashboard-panel__heading compact">
              <div>
                <small>ASSET MIX</small>
                <h2>资产构成</h2>
              </div>
              <button @click="navigateTo('/projects')">
                按项目查看
                <IconifyIcon icon="lucide:arrow-up-right" />
              </button>
            </header>
            <div
              v-if="dashboard.assetTypes.length"
              class="asset-bars dashboard-scroll-region"
            >
              <button
                v-for="item in dashboard.assetTypes"
                :key="item.type"
                :title="`全部项目共有 ${item.count} 项${assetTypeLabels[item.type]}资产`"
                @click="navigateTo('/projects')"
              >
                <span>
                  <IconifyIcon :icon="assetTypeIcons[item.type]" />
                  {{ assetTypeLabels[item.type] }}
                </span>
                <i>
                  <b
                    :style="{ width: `${(item.count / maxAssetCount) * 100}%` }"
                  ></b>
                </i>
                <strong>{{ item.count }}</strong>
              </button>
            </div>
            <div v-else class="panel-empty compact-empty">
              <IconifyIcon icon="lucide:package-open" />
              <span>暂无项目资产</span>
            </div>
          </section>
        </div>

        <div class="dashboard-grid dashboard-grid--activity">
          <section class="dashboard-panel jobs-panel">
            <header class="dashboard-panel__heading compact">
              <div>
                <small>ACTIVITY</small>
                <h2>任务动态</h2>
              </div>
            </header>
            <div
              v-if="dashboard.recentJobs.length"
              class="job-activity-list dashboard-scroll-region"
            >
              <button
                v-for="job in dashboard.recentJobs"
                :key="job.id"
                @click="navigateTo('/jobs', job.projectId)"
              >
                <i :class="job.status"></i>
                <span>
                  <b>{{ job.name }}</b>
                  <small>{{ job.projectName }} · {{ job.appName }}</small>
                </span>
                <em :class="job.status">{{ jobStatusLabel(job.status) }}</em>
                <strong v-if="['queued', 'running'].includes(job.status)">
                  {{ job.progress }}%
                </strong>
              </button>
            </div>
            <div v-else class="panel-empty compact-empty">
              <IconifyIcon icon="lucide:list-checks" />
              <span>暂无任务动态</span>
            </div>
          </section>

          <section class="dashboard-panel projects-panel">
            <header class="dashboard-panel__heading compact">
              <div>
                <small>RECENT PROJECTS</small>
                <h2>最近项目</h2>
              </div>
              <button @click="navigateTo('/projects')">
                全部项目
                <IconifyIcon icon="lucide:arrow-up-right" />
              </button>
            </header>
            <div class="recent-projects-chart dashboard-scroll-region">
              <button
                v-for="project in dashboard.recentProjects.slice(0, 4)"
                :key="project.id"
                @click="navigateTo('/design', project.id)"
              >
                <span class="recent-projects-chart__title">
                  <b>{{ project.name }}</b>
                </span>
                <span class="recent-projects-chart__resources">
                  <b>{{ project.assetCount }} 项资产</b>
                  <small>{{ projectAssetBreakdown(project) }}</small>
                </span>
                <span class="recent-projects-chart__tasks">
                  <b>{{ project.jobCount }} 项任务</b>
                  <small>{{ project.code }}</small>
                </span>
                <span class="recent-projects-chart__status">
                  <em v-if="project.activeJobCount">
                    {{ project.activeJobCount }} 运行
                  </em>
                  <small v-else>{{ formatTime(project.updatedAt) }}</small>
                  <IconifyIcon icon="lucide:chevron-right" />
                </span>
              </button>
            </div>
          </section>
        </div>

        <section class="dashboard-panel results-panel">
          <header class="dashboard-panel__heading compact">
            <div>
              <small>RECENT OUTPUTS</small>
              <h2>最近设计成果</h2>
            </div>
            <button @click="navigateTo('/projects')">
              按项目查看
              <IconifyIcon icon="lucide:arrow-up-right" />
            </button>
          </header>
          <div
            v-if="dashboard.recentAssets.length"
            class="result-gallery dashboard-scroll-region"
          >
            <Tooltip
              v-for="asset in dashboard.recentAssets"
              :key="asset.id"
              :title="`${asset.name} · ${asset.appName ?? '项目资产'}`"
            >
              <button
                :data-asset-id="asset.id"
                :data-project-id="asset.projectId"
                @click="openRecentAsset(asset)"
              >
                <img
                  v-if="asset.type === 'image' && previewUrls.get(asset.id)"
                  :alt="asset.name"
                  :src="previewUrls.get(asset.id)"
                />
                <span v-else>
                  <IconifyIcon :icon="assetTypeIcons[asset.type]" />
                </span>
                <small>{{ assetTypeLabels[asset.type] }}</small>
              </button>
            </Tooltip>
          </div>
          <div v-else class="panel-empty compact-empty">
            <IconifyIcon icon="lucide:images" />
            <span>生成结果入库后将在这里展示</span>
          </div>
        </section>
      </template>
    </div>

    <Modal
      v-model:open="quickStartOpen"
      :confirm-loading="quickStartSubmitting"
      ok-text="创建并开始设计"
      title="开始新设计"
      @ok="createQuickDesign"
    >
      <div class="quick-start-form">
        <label>
          <span>项目名称</span>
          <Input
            v-model:value="projectName"
            :maxlength="120"
            placeholder="例如：城际列车客室内装概念方案"
          />
        </label>
        <label>
          <span>设计任务说明</span>
          <Textarea
            v-model:value="projectDescription"
            :maxlength="2000"
            :rows="4"
            placeholder="说明车辆类型、设计目标、范围与重点约束"
          />
        </label>
      </div>
    </Modal>

    <Modal
      v-model:open="myDesignsOpen"
      :footer="null"
      title="我的设计"
      width="min(760px, 94vw)"
    >
      <Input
        v-model:value="conversationKeyword"
        allow-clear
        class="my-design-search"
        placeholder="搜索会话名称、项目名称或项目编号"
      >
        <template #prefix><IconifyIcon icon="lucide:search" /></template>
      </Input>
      <div v-if="myDesignsLoading" class="my-design-empty">
        <IconifyIcon class="is-spinning" icon="lucide:loader-circle" />
        正在读取设计会话
      </div>
      <div v-else-if="filteredMyDesigns.length" class="my-design-list">
        <button
          v-for="conversation in filteredMyDesigns"
          :key="conversation.id"
          type="button"
          @click="continueMyDesign(conversation)"
        >
          <IconifyIcon icon="lucide:message-square-more" />
          <span>
            <strong>{{ conversation.title }}</strong>
            <small>
              {{ conversation.projectName }} · {{ conversation.projectCode }} ·
              {{ conversation.roundCount }} 轮
            </small>
          </span>
          <em>{{ formatTime(conversation.updatedAt) }}</em>
          <IconifyIcon icon="lucide:chevron-right" />
        </button>
      </div>
      <div v-else class="my-design-empty">
        <IconifyIcon icon="lucide:message-square-dashed" />
        {{ conversationKeyword ? '没有匹配的设计会话' : '还没有设计会话' }}
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.design-dashboard-page {
  --dashboard-red: #c51f3a;
  --dashboard-ink: #1c252d;
  --dashboard-muted: #71808c;
  --dashboard-line: #dde3e7;
  --dashboard-soft: #f4f6f7;
}

.dashboard-panel__heading,
.chart-legend,
.conversation-meta {
  display: flex;
  align-items: center;
}

.dashboard-content {
  display: grid;
  gap: 18px;
}

.dashboard-loading,
.dashboard-empty {
  display: grid;
  gap: 12px;
  place-items: center;
  align-content: center;
  min-height: 420px;
  color: var(--dashboard-muted);
}

.dashboard-loading svg {
  width: 28px;
  height: 28px;
  animation: dashboard-spin 1s linear infinite;
}

.dashboard-empty svg {
  width: 52px;
  height: 52px;
  color: var(--dashboard-red);
}

.dashboard-empty h2,
.dashboard-empty p {
  margin: 0;
}

.dashboard-panel {
  min-width: 0;
  padding: 20px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--dashboard-line);
  border-radius: 13px;
}

.quick-entry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.quick-entry-card {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 92px;
  padding: 15px;
  color: var(--dashboard-ink);
  text-align: left;
  cursor: pointer;
  background: #f7f9fa;
  border: 1px solid #e0e5e8;
  border-radius: 11px;
  transition:
    transform 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.quick-entry-card:hover:not(:disabled),
.quick-entry-card:focus-visible {
  border-color: rgb(197 31 58 / 44%);
  box-shadow: 0 10px 22px rgb(30 40 48 / 8%);
  transform: translateY(-2px);
}

.quick-entry-card > svg:first-child {
  box-sizing: content-box;
  width: 22px;
  height: 22px;
  padding: 10px;
  color: var(--dashboard-red);
  background: #fff;
  border: 1px solid #e3e8ea;
  border-radius: 10px;
}

.quick-entry-card > span {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.quick-entry-card strong,
.quick-entry-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-entry-card strong {
  font-size: 14px;
}

.quick-entry-card small {
  font-size: 12px;
  color: var(--dashboard-muted);
}

.quick-entry-card > svg:last-child {
  color: #99a3aa;
}

.quick-entry-card--primary {
  color: #fff;
  background: linear-gradient(135deg, #b71933, #d33b53);
  border-color: transparent;
}

.quick-entry-card--primary small,
.quick-entry-card--primary > svg:last-child {
  color: rgb(255 255 255 / 78%);
}

.quick-entry-card--primary > svg:first-child {
  color: #fff;
  background: rgb(255 255 255 / 13%);
  border-color: rgb(255 255 255 / 20%);
}

.quick-entry-card:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.quick-entry-card em {
  padding: 4px 7px;
  font-size: 10px;
  font-style: normal;
  color: #8a6b35;
  background: #fff5d9;
  border-radius: 999px;
}

.quick-start-form,
.quick-start-form label {
  display: grid;
  gap: 8px;
}

.quick-start-form {
  gap: 18px;
}

.quick-start-form label > span {
  font-size: 13px;
  font-weight: 650;
  color: var(--dashboard-ink);
}

.my-design-search {
  margin-bottom: 14px;
}

.my-design-list {
  display: grid;
  gap: 7px;
  max-height: 58vh;
  overflow: auto;
}

.my-design-list > button {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto 16px;
  gap: 10px;
  align-items: center;
  padding: 11px 12px;
  color: var(--dashboard-ink);
  text-align: left;
  background: #f7f9fa;
  border: 1px solid #e3e7e9;
  border-radius: 9px;
}

.my-design-list > button:hover {
  border-color: rgb(197 31 58 / 36%);
}

.my-design-list > button > svg:first-child {
  color: var(--dashboard-red);
}

.my-design-list span {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.my-design-list strong,
.my-design-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.my-design-list small,
.my-design-list em {
  font-size: 11px;
  font-style: normal;
  color: var(--dashboard-muted);
}

.my-design-empty {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  color: var(--dashboard-muted);
}

.is-spinning {
  animation: dashboard-spin 1s linear infinite;
}

.dashboard-panel__heading {
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 18px;
}

.dashboard-panel__heading h2,
.dashboard-panel__heading small {
  margin: 0;
}

.dashboard-panel__heading h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--dashboard-ink);
}

.dashboard-panel__heading > div > small {
  font-size: 10px;
  font-weight: 700;
  color: #a2abb2;
  letter-spacing: 0.14em;
}

.dashboard-panel__heading > span {
  font-size: 13px;
  color: var(--dashboard-muted);
}

.dashboard-panel__heading > button {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 12px;
  color: var(--dashboard-muted);
  background: transparent;
  border: 0;
}

.dashboard-panel__heading > button:hover {
  color: var(--dashboard-red);
}

.design-flow-panel {
  padding-bottom: 18px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 54%, rgb(197 31 58 / 6%), transparent 34%),
    #fff;
}

.design-cycle-scroll {
  overflow: auto hidden;
}

.design-cycle {
  position: relative;
  min-width: 1100px;
  height: 500px;
  overflow: hidden;
}

.design-cycle-scroll,
.trend-chart-scroll,
.status-chart,
.conversation-list,
.asset-bars,
.job-activity-list,
.recent-projects-chart,
.result-gallery {
  scroll-behavior: smooth;
}

.design-cycle__orbit-wrap {
  position: absolute;
  top: 55px;
  left: 50%;
  width: 410px;
  height: 410px;
  transform: translateX(-50%);
}

.design-cycle__orbit {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.design-cycle__data-rail,
.design-cycle__inner-rail,
.design-cycle__track,
.design-cycle__track-halo {
  fill: none;
}

.design-cycle__track-halo {
  stroke: rgb(197 31 58 / 6%);
  stroke-width: 22;
}

.design-cycle__track {
  stroke: #e8c8cf;
  stroke-width: 2.2;
}

.design-cycle__data-rail {
  stroke: rgb(197 31 58 / 28%);
  stroke-width: 3.2;
  stroke-linecap: round;
  stroke-dasharray: 0.35 2.65;
  animation: design-cycle-data-flow 8s linear infinite;
}

.design-cycle__inner-rail {
  opacity: 0.66;
  stroke: rgb(197 31 58 / 18%);
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-dasharray: 0.45 3.55;
  animation: design-cycle-data-flow 12s linear infinite reverse;
}

.design-cycle__data-pulse {
  transform-origin: 210px 210px;
  transform-box: view-box;
  animation: design-cycle-pulse-orbit 9s linear infinite;
}

.design-cycle__data-pulse--2 {
  animation-delay: -3s;
}

.design-cycle__data-pulse--3 {
  animation-delay: -6s;
}

.design-cycle__pulse-halo {
  opacity: 0.2;
  filter: url('#design-cycle-pulse-glow');
  fill: var(--dashboard-red);
}

.design-cycle__pulse-core {
  fill: #fff;
  stroke: var(--dashboard-red);
  stroke-width: 2.5;
}

.design-cycle__center {
  position: absolute;
  inset: 117px;
  z-index: 2;
  display: grid;
  gap: 7px;
  place-content: center;
  justify-items: center;
  color: var(--dashboard-ink);
  text-align: center;
  background: rgb(255 255 255 / 97%);
  border: 1px solid #efd7dc;
  border-radius: 50%;
  box-shadow:
    0 16px 44px rgb(34 42 49 / 8%),
    0 0 0 12px rgb(255 255 255 / 72%),
    0 0 32px rgb(197 31 58 / 8%);
}

.design-cycle__center svg {
  width: 27px;
  height: 27px;
  color: var(--dashboard-red);
}

.design-cycle__center b {
  font-size: 20px;
  font-weight: 700;
}

.design-cycle__center small {
  font-size: 12px;
  font-weight: 500;
  color: var(--dashboard-muted);
  white-space: nowrap;
}

.design-cycle__node {
  position: absolute;
  z-index: 3;
  display: flex;
  gap: 14px;
  align-items: center;
  width: 235px;
  padding: 4px;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 999px;
  transition: transform 160ms ease;
}

.design-cycle__node:hover {
  transform: translateY(-2px);
}

.design-cycle__node > span {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 64px;
  height: 64px;
  color: var(--dashboard-red);
  background: #fff;
  border: 1px solid #e5c4cc;
  border-radius: 50%;
  box-shadow:
    0 9px 25px rgb(34 42 49 / 10%),
    0 0 0 7px rgb(255 255 255 / 88%),
    0 0 22px rgb(197 31 58 / 7%);
  transition:
    color 160ms ease,
    background 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.design-cycle__node > span svg {
  width: 27px;
  height: 27px;
}

.design-cycle__node:hover > span,
.design-cycle__node:focus-visible > span {
  color: #fff;
  background: var(--dashboard-red);
  border-color: var(--dashboard-red);
  box-shadow:
    0 9px 24px rgb(197 31 58 / 22%),
    0 0 0 7px rgb(197 31 58 / 8%);
}

.design-cycle__node > i {
  display: grid;
  gap: 5px;
  font-style: normal;
}

.design-cycle__node b {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--dashboard-ink);
}

.design-cycle__node small {
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.3;
  color: var(--dashboard-muted);
}

.design-cycle__node--assets {
  top: 0;
  left: calc(50% - 117px);
  flex-direction: column-reverse;
  gap: 10px;
  text-align: center;
}

.design-cycle__node--design {
  top: 174px;
  left: calc(50% + 139px);
}

.design-cycle__node--applications {
  top: 373px;
  left: calc(50% + 74px);
}

.design-cycle__node--jobs {
  top: 373px;
  left: calc(50% - 309px);
  flex-direction: row-reverse;
  text-align: right;
}

.design-cycle__node--results {
  top: 174px;
  left: calc(50% - 374px);
  flex-direction: row-reverse;
  text-align: right;
}

.dashboard-grid {
  display: grid;
  gap: 18px;
}

.dashboard-grid--charts,
.dashboard-grid--work,
.dashboard-grid--activity {
  grid-template-columns: minmax(0, 1.35fr) minmax(330px, 0.65fr);
}

.dashboard-scroll-region {
  min-width: 0;
  max-width: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: #c7ced3 transparent;
  scrollbar-width: thin;
}

.dashboard-scroll-region::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.dashboard-scroll-region::-webkit-scrollbar-thumb {
  background: #c7ced3;
  border-radius: 99px;
}

.dashboard-scroll-region::-webkit-scrollbar-track {
  background: transparent;
}

.trend-chart-scroll {
  max-height: 208px;
}

.trend-chart {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  min-width: 580px;
  height: 190px;
  padding: 10px 8px 0 28px;
  background-image: repeating-linear-gradient(
    to top,
    #edf0f2 0,
    #edf0f2 1px,
    transparent 1px,
    transparent 44px
  );
}

.trend-column {
  display: grid;
  grid-template-rows: 1fr 20px;
  align-items: end;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: 0;
}

.trend-stack {
  display: flex;
  flex-direction: column-reverse;
  align-items: stretch;
  align-self: stretch;
  justify-content: flex-start;
  width: min(32px, 70%);
  margin: 0 auto;
  overflow: hidden;
  border-radius: 5px 5px 2px 2px;
}

.trend-stack i {
  display: block;
  min-height: 0;
}

.trend-stack .success,
.chart-legend i.success {
  background: #2f815e;
}

.trend-stack .running,
.chart-legend i.running {
  background: var(--dashboard-red);
}

.trend-stack .failed,
.chart-legend i.failed {
  background: #d77755;
}

.trend-column small {
  font-size: 11px;
  color: var(--dashboard-muted);
}

.chart-legend {
  gap: 12px;
  font-size: 11px;
  color: var(--dashboard-muted);
}

.chart-legend span {
  display: flex;
  gap: 5px;
  align-items: center;
}

.chart-legend i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.status-chart {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 28px;
  align-items: center;
  min-height: 190px;
  max-height: 208px;
  padding-right: 4px;
}

.status-donut {
  display: grid;
  place-items: center;
  width: 150px;
  height: 150px;
  padding: 20px;
  border: 0;
  border-radius: 50%;
}

.status-donut > span {
  display: grid;
  place-content: center;
  width: 100%;
  height: 100%;
  background: #fff;
  border-radius: 50%;
}

.status-donut strong {
  font-size: 28px;
  color: var(--dashboard-ink);
}

.status-donut small {
  font-size: 11px;
  color: var(--dashboard-muted);
}

.status-legend {
  display: grid;
  gap: 8px;
}

.status-legend button {
  display: grid;
  grid-template-columns: 8px 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
  text-align: left;
  background: transparent;
  border: 0;
}

.status-legend button:hover span {
  color: var(--dashboard-red);
}

.status-legend i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-legend span,
.status-legend > small {
  font-size: 12px;
  color: var(--dashboard-muted);
}

.status-legend strong {
  font-size: 13px;
  color: var(--dashboard-ink);
}

.conversation-list,
.job-activity-list,
.recent-projects-chart,
.asset-bars {
  display: grid;
  gap: 8px;
  max-height: 234px;
  padding-right: 5px;
}

.conversation-list > button {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto 16px;
  gap: 12px;
  align-items: center;
  padding: 9px;
  text-align: left;
  background: #fff;
  border: 1px solid #edf0f2;
  border-radius: 10px;
}

.conversation-list > button:hover {
  background: #fafbfb;
  border-color: #d7dde1;
}

.conversation-preview {
  display: grid;
  place-items: center;
  width: 54px;
  height: 46px;
  overflow: hidden;
  color: var(--dashboard-red);
  background: #faeef1;
  border-radius: 8px;
}

.conversation-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.conversation-preview svg {
  width: 20px;
  height: 20px;
}

.conversation-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.conversation-copy b,
.conversation-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-copy b {
  font-size: 13px;
  color: var(--dashboard-ink);
}

.conversation-copy small,
.conversation-meta {
  font-size: 11px;
  color: var(--dashboard-muted);
}

.conversation-meta {
  gap: 5px;
  white-space: nowrap;
}

.conversation-meta i {
  width: 7px;
  height: 7px;
  background: var(--dashboard-red);
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgb(197 31 58 / 10%);
}

.asset-bars button {
  display: grid;
  grid-template-columns: 90px 1fr 28px;
  gap: 10px;
  align-items: center;
  padding: 5px 0;
  text-align: left;
  background: transparent;
  border: 0;
}

.asset-bars button > span {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: #4e5b65;
}

.asset-bars button > i,
.recent-projects-chart button > i {
  height: 7px;
  overflow: hidden;
  background: #edf0f2;
  border-radius: 99px;
}

.asset-bars button > i > b,
.recent-projects-chart button > i > b {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #d95068, var(--dashboard-red));
  border-radius: inherit;
  transition: width 200ms ease;
}

.asset-bars strong {
  font-size: 12px;
  color: var(--dashboard-ink);
  text-align: right;
}

.job-activity-list button {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) auto 42px;
  gap: 10px;
  align-items: center;
  padding: 7px 0;
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #f0f2f3;
}

.job-activity-list button > i {
  width: 7px;
  height: 7px;
  background: #9ca6ad;
  border-radius: 50%;
}

.job-activity-list button > i.running,
.job-activity-list button > i.queued {
  background: var(--dashboard-red);
}

.job-activity-list button > i.succeeded {
  background: #2f815e;
}

.job-activity-list button > i.failed {
  background: #d15c45;
}

.job-activity-list button > span {
  display: grid;
  min-width: 0;
}

.job-activity-list b,
.job-activity-list small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-activity-list b {
  font-size: 12px;
  color: var(--dashboard-ink);
}

.job-activity-list small {
  font-size: 10px;
  color: var(--dashboard-muted);
}

.job-activity-list em {
  font-size: 11px;
  font-style: normal;
  color: var(--dashboard-muted);
}

.job-activity-list em.failed {
  color: #b54e38;
}

.job-activity-list button > strong {
  font-size: 11px;
  color: var(--dashboard-red);
  text-align: right;
}

.recent-projects-chart button {
  display: grid;
  grid-template-columns:
    minmax(116px, 0.9fr) minmax(158px, 1.3fr) minmax(92px, 0.7fr)
    minmax(82px, auto);
  gap: 12px;
  align-items: center;
  min-height: 52px;
  padding: 8px 10px;
  text-align: left;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 9px;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.recent-projects-chart button:hover {
  background: #fafbfb;
  border-color: #e3e7ea;
  transform: translateY(-1px);
}

.recent-projects-chart button > span:not(.recent-projects-chart__status) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.recent-projects-chart__title,
.recent-projects-chart__tasks {
  align-content: center;
}

.recent-projects-chart button > span b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12.5px;
  color: var(--dashboard-ink);
  white-space: nowrap;
}

.recent-projects-chart small,
.recent-projects-chart em {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10.5px;
  font-style: normal;
  color: var(--dashboard-muted);
  white-space: nowrap;
}

.recent-projects-chart em {
  color: var(--dashboard-red);
}

.recent-projects-chart__title small,
.recent-projects-chart__resources small {
  text-align: left;
}

.recent-projects-chart__resources b {
  font-weight: 600;
}

.recent-projects-chart__status {
  display: flex;
  gap: 7px;
  align-items: center;
  justify-content: flex-end;
  min-width: 70px;
  text-align: right;
}

.recent-projects-chart__status svg {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: #9aa4ab;
}

.result-gallery {
  display: grid;
  grid-template-columns: repeat(6, minmax(100px, 1fr));
  gap: 10px;
  max-height: 252px;
  padding-right: 5px;
}

.result-gallery button {
  position: relative;
  display: grid;
  place-items: center;
  height: 116px;
  padding: 0;
  overflow: hidden;
  color: #687680;
  background: var(--dashboard-soft);
  border: 1px solid #e4e8eb;
  border-radius: 10px;
}

.result-gallery img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 180ms ease;
}

.result-gallery button:hover img {
  transform: scale(1.03);
}

.result-gallery button > span svg {
  width: 30px;
  height: 30px;
}

.result-gallery button > small {
  position: absolute;
  right: 7px;
  bottom: 7px;
  padding: 2px 6px;
  font-size: 9px;
  color: #fff;
  background: rgb(20 28 34 / 72%);
  border-radius: 5px;
}

.panel-empty {
  display: grid;
  gap: 8px;
  place-content: center;
  justify-items: center;
  min-height: 150px;
  color: #a0a9b0;
}

.compact-empty {
  min-height: 95px;
}

.panel-empty svg {
  width: 24px;
  height: 24px;
}

.panel-empty span {
  font-size: 12px;
}

@keyframes dashboard-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes design-cycle-data-flow {
  to {
    stroke-dashoffset: -100;
  }
}

@keyframes design-cycle-pulse-orbit {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1180px) {
  .dashboard-grid--charts,
  .dashboard-grid--work,
  .dashboard-grid--activity {
    grid-template-columns: 1fr;
  }

  .quick-entry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .quick-entry-grid {
    grid-template-columns: 1fr;
  }

  .status-chart {
    grid-template-columns: 130px 1fr;
  }

  .status-donut {
    width: 120px;
    height: 120px;
    padding: 16px;
  }

  .conversation-list > button {
    grid-template-columns: 48px minmax(0, 1fr) 16px;
  }

  .conversation-meta {
    display: none;
  }

  .result-gallery {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .design-cycle__data-rail,
  .design-cycle__data-pulse,
  .design-cycle__inner-rail,
  .dashboard-loading svg {
    animation: none;
  }
}
</style>
