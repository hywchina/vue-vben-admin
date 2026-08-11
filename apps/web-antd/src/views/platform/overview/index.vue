<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { Button, message, Progress } from 'ant-design-vue';

import { createWorkflowWorkspaceInstanceApi } from '#/api';
import PageHeading from '#/components/platform/page-heading.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { assetTypeIcons } from '#/modules/platform/asset-types';
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();

const recentAssets = computed(() => platformStore.currentAssets.slice(0, 4));
const recentJobs = computed(() => platformStore.currentJobs.slice(0, 3));
const availableApplications = computed(() =>
  platformStore.applications
    .filter((item) => item.status !== 'planned')
    .slice(0, 4),
);

async function openApplication(appKey: string) {
  if (!platformStore.currentProjectId) {
    message.warning('请先选择项目');
    return;
  }
  const instance = await createWorkflowWorkspaceInstanceApi({
    appKey,
    projectId: platformStore.currentProjectId,
  });
  await router.push({
    path: `/workspace/${appKey}`,
    query: { instanceId: instance.id },
  });
}
</script>

<template>
  <main class="platform-page overview-page">
    <PageHeading
      description="在同一个项目上下文中组织人员、资产和应用，让每一次输入与输出都有清晰来源。"
      eyebrow="Rail cabin design operations"
      title="设计运营台"
    >
      <template #extra>
        <Button @click="router.push('/assets')">查看资产</Button>
        <Button type="primary" @click="router.push('/applications')">
          打开应用中心
        </Button>
      </template>
    </PageHeading>

    <div class="platform-content">
      <section
        v-if="platformStore.currentProject"
        class="overview-hero platform-panel"
      >
        <div class="overview-hero__copy">
          <div class="rail-section-label">当前项目</div>
          <h2>{{ platformStore.currentProject?.name }}</h2>
          <p>{{ platformStore.currentProject?.description }}</p>
          <div class="overview-hero__meta">
            <span>{{ platformStore.currentProject?.code }}</span>
            <span>{{ platformStore.currentProject?.members }} 位成员</span>
            <span>更新于 {{ platformStore.currentProject?.updatedAt }}</span>
          </div>
        </div>

        <div class="asset-rail" aria-label="资产流转轨道">
          <div class="asset-rail__track"></div>
          <div class="asset-rail__station asset-rail__station--input">
            <div class="asset-rail__node">
              <IconifyIcon icon="lucide:image-up" />
            </div>
            <strong>输入资产</strong>
            <small>参考图 · 遮罩 · 材质</small>
          </div>
          <div class="asset-rail__station asset-rail__station--core">
            <div class="asset-rail__node">
              <IconifyIcon icon="lucide:blocks" />
            </div>
            <strong>应用工作区</strong>
            <small>统一项目与权限上下文</small>
          </div>
          <div class="asset-rail__station asset-rail__station--output">
            <div class="asset-rail__node">
              <IconifyIcon icon="lucide:archive-restore" />
            </div>
            <strong>输出入库</strong>
            <small>版本 · 来源 · 可复用</small>
          </div>
        </div>
      </section>

      <section v-else class="platform-panel overview-onboarding">
        <div class="rail-empty">
          <div>
            <IconifyIcon class="text-4xl" icon="lucide:folder-plus" />
            <h2>先创建第一个项目空间</h2>
            <p>
              项目用于隔离成员、资产、任务和应用权限，创建后即可上传设计资料。
            </p>
            <Button type="primary" @click="router.push('/projects')">
              创建项目
            </Button>
          </div>
        </div>
      </section>

      <section class="overview-metrics">
        <div class="platform-panel rail-metric">
          <div class="rail-section-label">项目资产</div>
          <div class="rail-metric__value">
            {{ platformStore.currentAssets.length }}
          </div>
          <div class="rail-metric__hint">统一登记、版本可追溯</div>
        </div>
        <div class="platform-panel rail-metric">
          <div class="rail-section-label">可见应用</div>
          <div class="rail-metric__value">
            {{ platformStore.applications.length }}
          </div>
          <div class="rail-metric__hint">按角色与项目授权</div>
        </div>
        <div class="platform-panel rail-metric">
          <div class="rail-section-label">运行任务</div>
          <div class="rail-metric__value">
            {{ platformStore.activeJobs.length }}
          </div>
          <div class="rail-metric__hint">跨页面保持状态</div>
        </div>
        <div class="platform-panel rail-metric">
          <div class="rail-section-label">项目成员</div>
          <div class="rail-metric__value">
            {{ platformStore.currentProject?.members ?? 0 }}
          </div>
          <div class="rail-metric__hint">角色与数据范围隔离</div>
        </div>
      </section>

      <section class="overview-main-grid">
        <div class="platform-panel">
          <div class="platform-panel__header">
            <div>
              <h2>继续设计</h2>
              <p>工作区共享当前项目和资产，不重复切换上下文</p>
            </div>
            <Button type="link" @click="router.push('/applications')">
              全部应用
            </Button>
          </div>
          <div class="platform-panel__body app-shortcuts">
            <button
              v-for="application in availableApplications"
              :key="application.key"
              class="app-shortcut"
              type="button"
              @click="openApplication(application.key)"
            >
              <span
                class="app-shortcut__icon"
                :style="{
                  backgroundColor: `${application.color}14`,
                  color: application.color,
                }"
              >
                <IconifyIcon :icon="application.icon" />
              </span>
              <span class="app-shortcut__body">
                <strong>{{ application.name }}</strong>
                <small>{{ application.description }}</small>
              </span>
              <StatusPill :status="application.status" />
              <IconifyIcon
                class="app-shortcut__arrow"
                icon="lucide:arrow-up-right"
              />
            </button>
          </div>
        </div>

        <div class="platform-panel">
          <div class="platform-panel__header">
            <div>
              <h2>任务状态</h2>
              <p>统一查看不同应用产生的异步任务</p>
            </div>
            <Button type="link" @click="router.push('/jobs')">任务中心</Button>
          </div>
          <div class="job-snapshot-list">
            <div v-for="job in recentJobs" :key="job.id" class="job-snapshot">
              <div class="job-snapshot__top">
                <div>
                  <strong>{{ job.name }}</strong>
                  <small>{{ job.stage }}</small>
                </div>
                <StatusPill :status="job.status" />
              </div>
              <Progress
                :percent="job.progress"
                :show-info="false"
                :stroke-color="
                  job.status === 'succeeded' ? '#287a53' : '#b91c32'
                "
                size="small"
              />
            </div>
          </div>
        </div>
      </section>

      <section class="platform-panel overview-assets">
        <div class="platform-panel__header">
          <div>
            <h2>最近资产</h2>
            <p>工作流输出与用户上传使用同一套资产协议</p>
          </div>
          <Button type="link" @click="router.push('/assets')">
            进入资产中心
          </Button>
        </div>
        <div class="overview-assets__grid">
          <article
            v-for="asset in recentAssets"
            :key="asset.id"
            class="overview-asset"
          >
            <div
              class="overview-asset__preview"
              :style="{ '--asset-accent': asset.accent }"
            >
              <span>{{ asset.format }}</span>
              <IconifyIcon :icon="assetTypeIcons[asset.type]" />
            </div>
            <div class="overview-asset__body">
              <strong>{{ asset.name }}</strong>
              <small>
                {{ asset.owner }} · V{{ asset.version }} · {{ asset.createdAt }}
              </small>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.overview-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(300px, 0.8fr) minmax(520px, 1.2fr);
  min-height: 262px;
  overflow: hidden;
  color: #fff;
  background: #20252c;
  box-shadow: var(--rail-shadow);
}

.overview-hero::after {
  position: absolute;
  inset: auto -80px -120px auto;
  width: 320px;
  height: 320px;
  content: '';
  border: 54px solid rgb(185 28 50 / 30%);
  border-radius: 50%;
}

.overview-hero__copy {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 38px;
}

.overview-hero__copy .rail-section-label {
  color: #f5a8b5;
}

.overview-hero__copy h2 {
  max-width: 560px;
  margin: 12px 0 10px;
  font-size: clamp(27px, 3vw, 42px);
  font-weight: 680;
  line-height: 1.1;
  color: #fff;
  letter-spacing: -0.045em;
}

.overview-hero__copy p {
  max-width: 570px;
  margin: 0;
  line-height: 1.65;
  color: #c7ccd1;
}

.overview-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-top: 24px;
  font-size: 12px;
  color: #9da5ad;
}

.asset-rail {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;
  padding: 46px 42px;
}

.asset-rail__track {
  position: absolute;
  top: 50%;
  right: 14%;
  left: 14%;
  height: 8px;
  border-top: 2px solid #68717a;
  border-bottom: 2px solid #68717a;
  transform: translateY(-18px);
}

.asset-rail__track::after {
  position: absolute;
  inset: -2px 48% -2px 0;
  content: '';
  background: var(--rail-red);
  animation: rail-flow 3.2s ease-in-out infinite alternate;
}

.asset-rail__station {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.asset-rail__node {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin-bottom: 16px;
  font-size: 21px;
  color: #fff;
  background: #606a74;
  border: 7px solid #20252c;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #86909a;
}

.asset-rail__station--core .asset-rail__node {
  width: 72px;
  height: 72px;
  background: var(--rail-red);
  border-color: #20252c;
  box-shadow:
    0 0 0 1px #e16b7d,
    0 0 34px rgb(185 28 50 / 35%);
}

.asset-rail__station strong {
  font-size: 13px;
}

.asset-rail__station small {
  margin-top: 4px;
  font-size: 11px;
  color: #919aa3;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
  margin-top: 14px;
}

.overview-main-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.28fr) minmax(330px, 0.72fr);
  gap: 14px;
  margin-top: 14px;
}

.app-shortcuts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.app-shortcut {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto 18px;
  gap: 12px;
  align-items: center;
  padding: 14px;
  text-align: left;
  background: #fff;
  border: 1px solid var(--rail-line);
  border-radius: 11px;
  transition:
    border-color 160ms ease,
    transform 160ms ease,
    box-shadow 160ms ease;
}

.app-shortcut:hover {
  border-color: #d3a7ae;
  box-shadow: 0 10px 24px rgb(40 47 55 / 8%);
  transform: translateY(-2px);
}

.app-shortcut:focus-visible {
  outline: 3px solid rgb(185 28 50 / 22%);
  outline-offset: 2px;
}

.app-shortcut__icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  font-size: 20px;
  border-radius: 10px;
}

.app-shortcut__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-shortcut__body strong {
  font-size: 13px;
}

.app-shortcut__body small {
  display: -webkit-box;
  margin-top: 4px;
  overflow: hidden;
  -webkit-line-clamp: 1;
  font-size: 11px;
  line-height: 1.45;
  color: var(--rail-steel);
  -webkit-box-orient: vertical;
}

.app-shortcut__arrow {
  color: #8b949d;
}

.job-snapshot-list {
  padding: 8px 18px 14px;
}

.job-snapshot {
  padding: 14px 0;
  border-bottom: 1px solid var(--rail-line);
}

.job-snapshot:last-child {
  border-bottom: 0;
}

.job-snapshot__top {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.job-snapshot__top div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.job-snapshot__top strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.job-snapshot__top small {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--rail-steel);
  white-space: nowrap;
}

.overview-assets {
  margin-top: 14px;
}

.overview-assets__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 16px;
}

.overview-asset {
  display: grid;
  grid-template-columns: 82px minmax(0, 1fr);
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--rail-line);
  border-radius: 10px;
}

.overview-asset__preview {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 78px;
  font-size: 24px;
  color: #fff;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 28%), transparent 52%),
    var(--asset-accent);
}

.overview-asset__preview span {
  position: absolute;
  top: 6px;
  left: 7px;
  padding: 2px 5px;
  font-size: 8px;
  font-weight: 700;
  color: #fff;
  background: rgb(0 0 0 / 30%);
  border-radius: 3px;
}

.overview-asset__body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 10px 12px;
}

.overview-asset__body strong,
.overview-asset__body small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.overview-asset__body strong {
  font-size: 12px;
}

.overview-asset__body small {
  margin-top: 6px;
  font-size: 10px;
  color: var(--rail-steel);
}

@keyframes rail-flow {
  to {
    right: 0;
  }
}

@media (max-width: 1180px) {
  .overview-hero {
    grid-template-columns: 1fr;
  }

  .asset-rail {
    min-height: 220px;
    padding-top: 20px;
  }

  .overview-metrics,
  .overview-assets__grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .overview-main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .overview-hero__copy {
    padding: 26px 22px;
  }

  .asset-rail {
    padding: 22px 8px 30px;
  }

  .asset-rail__node,
  .asset-rail__station--core .asset-rail__node {
    width: 48px;
    height: 48px;
  }

  .asset-rail__station small {
    display: none;
  }

  .overview-metrics,
  .overview-assets__grid,
  .app-shortcuts {
    grid-template-columns: 1fr;
  }
}
</style>
