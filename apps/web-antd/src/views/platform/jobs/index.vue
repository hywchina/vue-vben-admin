<script lang="ts" setup>
import type { PlatformJob, ProjectMember } from '#/modules/platform/types';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Checkbox,
  Input,
  message,
  Modal,
  Progress,
  Segmented,
  Select,
  Tooltip,
} from 'ant-design-vue';

import { getProjectMembersApi } from '#/api';
import PageHeading from '#/components/platform/page-heading.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { usePlatformStore } from '#/store';

const router = useRouter();
const route = useRoute();
const platformStore = usePlatformStore();
const keyword = ref('');
const statusFilter = ref('all');
const ownerFilter = ref('all');
const sortValue = ref('createdAt-desc');
const selectedJobIds = ref<string[]>([]);
const cancellingJobIds = ref(new Set<string>());
const projectMembers = ref<ProjectMember[]>([]);
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '进行中', value: 'active' },
  { label: '已完成', value: 'succeeded' },
  { label: '异常', value: 'failed' },
];
const sortOptions = [
  { label: '创建时间：最新优先', value: 'createdAt-desc' },
  { label: '创建时间：最早优先', value: 'createdAt-asc' },
  { label: '名称：A–Z', value: 'name-asc' },
  { label: '名称：Z–A', value: 'name-desc' },
  { label: '创建人：A–Z', value: 'owner-asc' },
  { label: '状态：正序', value: 'status-asc' },
];
const memberOptions = computed(() => [
  { label: '全部成员', value: 'all' },
  ...projectMembers.value.map((member) => ({
    label: `${member.name} · ${member.publicId}`,
    value: member.userId,
  })),
]);

const applicationMap = computed(() =>
  Object.fromEntries(
    platformStore.applications.map((item) => [item.key, item]),
  ),
);

const filteredJobs = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  const [sortBy, sortOrder] = sortValue.value.split('-') as [
    'createdAt' | 'name' | 'owner' | 'status',
    'asc' | 'desc',
  ];
  return platformStore.currentJobs
    .filter((job) => {
      const matchesStatus =
        statusFilter.value === 'all' ||
        (statusFilter.value === 'active'
          ? ['cancelling', 'queued', 'running'].includes(job.status)
          : job.status === statusFilter.value);
      const matchesOwner =
        ownerFilter.value === 'all' || job.createdBy === ownerFilter.value;
      const matchesKeyword =
        !normalized ||
        `${job.name}${job.owner}${job.ownerPublicId}${job.publicId}`
          .toLowerCase()
          .includes(normalized);
      return matchesStatus && matchesOwner && matchesKeyword;
    })
    .toSorted((left, right) => {
      const leftValue =
        sortBy === 'createdAt'
          ? new Date(left.createdAt).getTime()
          : String(left[sortBy]).toLowerCase();
      const rightValue =
        sortBy === 'createdAt'
          ? new Date(right.createdAt).getTime()
          : String(right[sortBy]).toLowerCase();
      let comparison = 0;
      if (leftValue < rightValue) comparison = -1;
      if (leftValue > rightValue) comparison = 1;
      return sortOrder === 'asc' ? comparison : -comparison;
    });
});

watch(
  () => route.query.status,
  (status) => {
    statusFilter.value = ['active', 'failed', 'succeeded'].includes(
      String(status),
    )
      ? String(status)
      : 'all';
  },
  { immediate: true },
);

onMounted(async () => {
  try {
    await platformStore.refreshCurrentProjectJobs();
  } catch {
    message.error('任务列表刷新失败，请稍后重试');
  }
});

watch(
  () => platformStore.currentProjectId,
  async (projectId) => {
    selectedJobIds.value = [];
    ownerFilter.value = 'all';
    if (!projectId) {
      projectMembers.value = [];
      return;
    }
    const result = await getProjectMembersApi(projectId);
    projectMembers.value = result.items;
  },
  { immediate: true },
);

function toggleSelection(jobId: string, checked: boolean) {
  selectedJobIds.value = checked
    ? [...new Set([...selectedJobIds.value, jobId])]
    : selectedJobIds.value.filter((id) => id !== jobId);
}

function toggleSelectAll() {
  selectedJobIds.value =
    selectedJobIds.value.length === filteredJobs.value.length
      ? []
      : filteredJobs.value.map((job) => job.id);
}

function clearJobSelection() {
  selectedJobIds.value = [];
}

function jobErrorMessage(job: PlatformJob) {
  return job.error?.message || job.stage || '任务执行失败';
}

function jobErrorSummary(job: PlatformJob) {
  const message = jobErrorMessage(job).trim();
  if (/invalid_(?:union|value)|ZodError|"errors"/.test(message)) {
    return '工作流参数与当前服务版本不一致';
  }
  return message.length > 90 ? `${message.slice(0, 90)}…` : message;
}

function showJobError(job: PlatformJob) {
  Modal.info({
    content: jobErrorMessage(job),
    okText: '关闭',
    title: `任务错误详情 · ${job.publicId}`,
    width: 720,
  });
}

function confirmArchive(jobs: PlatformJob[]) {
  const activeJobs = jobs.filter((job) =>
    ['cancelling', 'queued', 'running'].includes(job.status),
  );
  if (activeJobs.length > 0) {
    message.warning('运行中的任务不能删除，请先取消任务');
    return;
  }
  Modal.confirm({
    cancelText: '取消',
    content: `确定从任务中心移除 ${jobs.length} 个任务吗？任务台账、资产和审计记录仍会保留。`,
    okButtonProps: { danger: true },
    okText: '删除任务',
    async onOk() {
      await platformStore.archiveJobs(jobs.map((job) => job.id));
      selectedJobIds.value = [];
      message.success('任务已从列表移除');
    },
    title: jobs.length > 1 ? '批量删除任务' : '删除任务',
  });
}

function isActiveJob(job: PlatformJob) {
  return ['cancelling', 'queued', 'running'].includes(job.status);
}

async function cancelJob(job: PlatformJob) {
  if (job.status === 'cancelling' || cancellingJobIds.value.has(job.id)) return;
  cancellingJobIds.value.add(job.id);
  try {
    const result = await platformStore.cancelJob(job.id);
    if (result.status === 'cancelled') {
      statusFilter.value = 'all';
      message.success('任务已取消，现在可以删除');
    } else {
      message.success('已提交取消请求，Worker 确认后可删除');
    }
    await platformStore.refreshCurrentProjectJobs();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '取消任务失败');
  } finally {
    cancellingJobIds.value.delete(job.id);
  }
}

async function openConversation(job: PlatformJob) {
  if (!job.designConversationId) {
    message.info('该历史任务未关联设计会话');
    return;
  }
  await router.push({
    path: '/design',
    query: { conversationId: job.designConversationId },
  });
}
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
          <div class="job-toolbar__filters">
            <Segmented v-model:value="statusFilter" :options="statusOptions" />
            <Input
              v-model:value="keyword"
              allow-clear
              class="job-search"
              placeholder="搜索任务名称、编号或创建人"
            >
              <template #prefix><IconifyIcon icon="lucide:search" /></template>
            </Input>
            <Select
              v-model:value="ownerFilter"
              :options="memberOptions"
              class="job-member-filter"
            />
            <Select
              v-model:value="sortValue"
              :options="sortOptions"
              class="job-sort-filter"
            />
          </div>
          <Button @click="toggleSelectAll">
            {{
              selectedJobIds.length === filteredJobs.length &&
              filteredJobs.length
                ? '取消全选'
                : '全选'
            }}
          </Button>
        </div>

        <div v-if="selectedJobIds.length" class="job-batch-bar">
          <strong>已选择 {{ selectedJobIds.length }} 项</strong>
          <Button @click="clearJobSelection">
            <IconifyIcon icon="lucide:x" />
            取消选择
          </Button>
          <Button
            danger
            @click="
              confirmArchive(
                filteredJobs.filter((job) => selectedJobIds.includes(job.id)),
              )
            "
          >
            <IconifyIcon icon="lucide:trash-2" />
            批量删除
          </Button>
        </div>

        <div class="job-table-head">
          <span></span>
          <span>任务</span>
          <span>应用</span>
          <span>状态与进度</span>
          <span>创建信息</span>
          <span></span>
        </div>
        <div class="job-list">
          <article v-for="job in filteredJobs" :key="job.id" class="job-row">
            <Checkbox
              :checked="selectedJobIds.includes(job.id)"
              @change="toggleSelection(job.id, Boolean($event.target.checked))"
            />
            <div class="job-row__name">
              <div class="job-row__icon">
                <IconifyIcon
                  :icon="applicationMap[job.appKey]?.icon || 'lucide:workflow'"
                />
              </div>
              <div>
                <strong>{{ job.name }}</strong>
                <small>{{ job.publicId }}</small>
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
              <Tooltip v-if="job.status === 'failed'" title="点击查看完整错误">
                <button
                  class="job-row__error"
                  type="button"
                  @click="showJobError(job)"
                >
                  {{ jobErrorSummary(job) }}
                </button>
              </Tooltip>
              <small
                v-else-if="isActiveJob(job) && !job.externalExecution"
                class="job-row__ledger-warning"
              >
                无外部执行，可取消后删除
              </small>
              <small v-else>{{ job.stage }}</small>
            </div>
            <div class="job-row__meta">
              <strong>{{ job.owner }}</strong>
              <small>
                {{ job.ownerPublicId }} ·
                {{ new Date(job.createdAt).toLocaleString('zh-CN') }}
                <template v-if="job.duration">· {{ job.duration }}</template>
              </small>
            </div>
            <div class="job-row__actions">
              <Tooltip title="打开设计会话">
                <Button
                  :disabled="!job.designConversationId"
                  shape="circle"
                  @click="openConversation(job)"
                >
                  <IconifyIcon icon="lucide:message-square-more" />
                </Button>
              </Tooltip>
              <Tooltip
                v-if="isActiveJob(job)"
                :title="
                  job.status === 'cancelling'
                    ? '正在等待 Worker 确认取消'
                    : '取消任务后才能删除'
                "
              >
                <Button
                  aria-label="取消任务"
                  danger
                  :disabled="job.status === 'cancelling'"
                  :loading="cancellingJobIds.has(job.id)"
                  shape="circle"
                  @click="cancelJob(job)"
                >
                  <IconifyIcon icon="lucide:square" />
                </Button>
              </Tooltip>
              <Tooltip v-else title="删除任务">
                <Button
                  aria-label="删除任务"
                  danger
                  shape="circle"
                  @click="confirmArchive([job])"
                >
                  <IconifyIcon icon="lucide:trash-2" />
                </Button>
              </Tooltip>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.job-search {
  width: 280px;
}

.job-toolbar__filters,
.job-batch-bar,
.job-row__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.job-member-filter {
  width: 190px;
}

.job-sort-filter {
  width: 190px;
}

.job-batch-bar {
  padding: 10px 18px;
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-bottom: 1px solid #efc7ce;
}

.job-table-head,
.job-row {
  display: grid;
  grid-template-columns:
    24px minmax(220px, 1.3fr) minmax(150px, 0.8fr) minmax(230px, 1.1fr)
    minmax(170px, 0.75fr) 90px;
  gap: 18px;
  align-items: center;
}

.job-row > * {
  min-width: 0;
}

.job-table-head {
  padding: 11px 18px;
  font-size: 12px;
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
  font-size: 14px;
}

.job-row small {
  margin-top: 4px;
  font-size: 12px;
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

.job-row__error {
  display: block;
  width: 100%;
  padding: 0;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: #b91c32;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.job-row__ledger-warning {
  color: #9a6700 !important;
}

:global(.ant-modal-confirm-content) {
  max-height: min(60vh, 520px);
  overflow: auto;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.job-row__actions {
  justify-content: flex-end;
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
