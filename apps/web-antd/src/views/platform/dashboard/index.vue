<script lang="ts" setup>
import type { PlatformDashboard } from '#/modules/platform/types';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, message, Modal, Textarea } from 'ant-design-vue';

import { getDashboardApi } from '#/api';
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

const currentProjectId = computed(
  () => dashboard.value?.currentProject?.id ?? platformStore.currentProjectId,
);

const quickEntries = computed(() => [
  { action: 'new-design', label: '开始新设计' },
  { action: 'history', label: '查看我的设计' },
  { action: 'assets', label: '查看资产中心' },
  {
    action: 'training',
    label: '开始模型训练',
    unavailable: !applicationAvailable('lora-training'),
  },
  {
    action: 'report',
    label: '开始报告生成',
    unavailable: !applicationAvailable('report-generator'),
  },
  { action: 'workspace', label: '设计工作台' },
]);

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
  historyOpen.value = false;
  await navigateTo('/design', conversation.projectId, {
    conversationId: conversation.id,
  });
}

function startNewFromHistory() {
  historyOpen.value = false;
  createProjectOpen.value = true;
}

function activateQuickEntry(action: string) {
  if (action === 'new-design') {
    createProjectOpen.value = true;
    return;
  }
  if (action === 'history') {
    historyOpen.value = true;
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

  let appKey = '';
  if (action === 'training') appKey = 'lora-training';
  if (action === 'report') appKey = 'report-generator';
  if (!appKey || !applicationAvailable(appKey)) {
    message.info('该外部服务与能力契约尚未接入');
    return;
  }
  void navigateTo('/design', currentProjectId.value, { appKey });
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
  } finally {
    dashboardLoading.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <main class="platform-page home-page">
    <section class="home-stage" aria-labelledby="home-welcome-title">
      <div class="home-welcome">
        <h1 id="home-welcome-title">
          欢迎来到客运装备内装模块化分区快速设计平台
        </h1>
        <p>今天你想做些什么？</p>
      </div>

      <nav class="home-entry-grid" aria-label="首页功能导航">
        <button
          v-for="entry in quickEntries"
          :key="entry.action"
          :data-action="entry.action"
          :data-unavailable="entry.unavailable || undefined"
          :title="
            entry.unavailable ? '该外部服务与能力契约尚未接入' : undefined
          "
          type="button"
          @click="activateQuickEntry(entry.action)"
        >
          {{ entry.label }}
        </button>
      </nav>
    </section>

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
      width="680px"
    >
      <div v-if="dashboardLoading" class="home-history-empty">
        <IconifyIcon class="home-loading-icon" icon="lucide:loader-circle" />
        <span>正在加载最近设计</span>
      </div>
      <div
        v-else-if="dashboard?.recentConversations.length"
        class="home-history-list"
      >
        <button
          v-for="conversation in dashboard.recentConversations"
          :key="conversation.id"
          type="button"
          @click="continueConversation(conversation)"
        >
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
        <span>还没有可继续的设计会话</span>
        <Button type="primary" @click="startNewFromHistory">开始新设计</Button>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.home-page {
  min-height: 100%;
  padding: 0;
  background: #fff;
}

.home-stage {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: calc(100vh - 104px);
  padding: clamp(92px, 14vh, 164px) 32px 72px;
}

.home-welcome {
  box-sizing: border-box;
  width: min(640px, 100%);
  min-height: 132px;
  padding: 31px 28px 22px;
  text-align: center;
  background: var(--rail-mist);
  border: 1px solid var(--rail-line);
}

.home-welcome h1 {
  margin: 0;
  font-size: clamp(22px, 2.1vw, 29px);
  font-weight: 700;
  line-height: 1.4;
  color: var(--rail-red);
  letter-spacing: -0.02em;
}

.home-welcome p {
  margin: 16px 0 0;
  font-size: 17px;
  line-height: 1.5;
  color: var(--rail-ink);
}

.home-entry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px 20px;
  width: min(600px, 100%);
  margin-top: 60px;
}

.home-entry-grid button {
  min-height: 52px;
  padding: 10px 16px;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--rail-ink);
  cursor: pointer;
  background: var(--rail-red-soft);
  border: 1px solid #efd1d6;
  border-radius: 8px;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.home-entry-grid button:hover,
.home-entry-grid button:focus-visible {
  color: var(--rail-red-dark);
  outline: none;
  background: #ffe3e8;
  border-color: #dda0aa;
  box-shadow: 0 6px 16px rgb(185 28 50 / 12%);
  transform: translateY(-1px);
}

.home-entry-grid button[data-unavailable='true'] {
  color: var(--rail-steel);
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

.home-history-list button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  padding: 14px;
  color: #1c252d;
  text-align: left;
  background: #fff;
  border: 1px solid #dde3e7;
  border-radius: 10px;
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

@media (max-width: 720px) {
  .home-stage {
    min-height: calc(100vh - 88px);
    padding: 64px 20px;
  }

  .home-entry-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 40px;
  }
}

@media (max-width: 440px) {
  .home-welcome {
    padding-inline: 18px;
  }

  .home-entry-grid {
    grid-template-columns: 1fr;
  }
}
</style>
