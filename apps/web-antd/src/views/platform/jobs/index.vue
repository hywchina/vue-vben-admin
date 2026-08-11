<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Progress, Segmented } from 'ant-design-vue';

import PageHeading from '#/components/platform/page-heading.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();
const keyword = ref('');
const statusFilter = ref('all');
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '进行中', value: 'active' },
  { label: '已完成', value: 'succeeded' },
  { label: '异常', value: 'failed' },
];

const applicationMap = computed(() =>
  Object.fromEntries(
    platformStore.applications.map((item) => [item.key, item]),
  ),
);

const filteredJobs = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  return platformStore.currentJobs.filter((job) => {
    const matchesStatus =
      statusFilter.value === 'all' ||
      (statusFilter.value === 'active'
        ? ['queued', 'running'].includes(job.status)
        : job.status === statusFilter.value);
    const matchesKeyword =
      !normalized ||
      `${job.name}${job.owner}${job.id}`.toLowerCase().includes(normalized);
    return matchesStatus && matchesKeyword;
  });
});
</script>

<template>
  <main class="platform-page jobs-page">
    <PageHeading
      description="所有耗时能力共用任务状态、进度、错误和输出登记协议。"
      eyebrow="Unified job ledger"
      title="任务中心"
    />

    <div class="platform-content">
      <section class="platform-panel">
        <div class="rail-toolbar job-toolbar">
          <Segmented v-model:value="statusFilter" :options="statusOptions" />
          <Input
            v-model:value="keyword"
            allow-clear
            class="job-search"
            placeholder="搜索任务名称或编号"
          >
            <template #prefix><IconifyIcon icon="lucide:search" /></template>
          </Input>
        </div>

        <div class="job-table-head">
          <span>任务</span>
          <span>应用</span>
          <span>状态与进度</span>
          <span>创建信息</span>
          <span></span>
        </div>
        <div class="job-list">
          <article v-for="job in filteredJobs" :key="job.id" class="job-row">
            <div class="job-row__name">
              <div class="job-row__icon">
                <IconifyIcon
                  :icon="applicationMap[job.appKey]?.icon || 'lucide:workflow'"
                />
              </div>
              <div>
                <strong>{{ job.name }}</strong>
                <small>{{ job.id }}</small>
              </div>
            </div>
            <div class="job-row__app">
              <strong>
                {{ applicationMap[job.appKey]?.name || job.appKey }}
              </strong>
              <small>{{ applicationMap[job.appKey]?.provider }}</small>
            </div>
            <div class="job-row__progress">
              <div>
                <StatusPill :status="job.status" />
                <span>{{ job.progress }}%</span>
              </div>
              <Progress
                :percent="job.progress"
                :show-info="false"
                :stroke-color="
                  job.status === 'succeeded' ? '#287a53' : '#b91c32'
                "
                size="small"
              />
              <small>{{ job.stage }}</small>
            </div>
            <div class="job-row__meta">
              <strong>{{ job.owner }}</strong>
              <small>
                {{ job.createdAt }}
                <template v-if="job.duration">· {{ job.duration }}</template>
              </small>
            </div>
            <div class="job-row__actions">
              <Button
                type="link"
                @click="
                  router.push({
                    path: `/workspace/${job.appKey}`,
                    query: { instanceId: job.workspaceInstanceId },
                  })
                "
              >
                打开会话
              </Button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.job-search {
  width: 300px;
}

.job-table-head,
.job-row {
  display: grid;
  grid-template-columns:
    minmax(220px, 1.3fr) minmax(150px, 0.8fr) minmax(230px, 1.1fr)
    minmax(130px, 0.65fr) 90px;
  gap: 18px;
  align-items: center;
}

.job-table-head {
  padding: 11px 18px;
  font-size: 9px;
  font-weight: 700;
  color: var(--rail-steel);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: #fafbfc;
  border-bottom: 1px solid var(--rail-line);
}

.job-row {
  min-height: 92px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--rail-line);
}

.job-row:last-child {
  border-bottom: 0;
}

.job-row__name {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.job-row__icon {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 42px;
  height: 42px;
  font-size: 19px;
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-radius: 10px;
}

.job-row__name > div:last-child,
.job-row__app,
.job-row__meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.job-row strong,
.job-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-row strong {
  font-size: 11px;
}

.job-row small {
  margin-top: 4px;
  font-size: 9px;
  color: var(--rail-steel);
}

.job-row__progress > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.job-row__progress > div > span:last-child {
  font-family: ui-monospace, monospace;
  font-size: 9px;
  color: var(--rail-steel);
}

.job-row__actions {
  text-align: right;
}

@media (max-width: 1050px) {
  .job-table-head {
    display: none;
  }

  .job-row {
    position: relative;
    grid-template-columns: 1fr 1fr;
  }

  .job-row__progress {
    grid-column: 1 / -1;
  }

  .job-row__actions {
    position: absolute;
    right: 14px;
  }
}

@media (max-width: 680px) {
  .job-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .job-search {
    width: 100%;
  }

  .job-row {
    grid-template-columns: 1fr;
  }

  .job-row__progress {
    grid-column: auto;
  }
}
</style>
