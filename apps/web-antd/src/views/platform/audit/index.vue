<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Input, Pagination, Select, Tag } from 'ant-design-vue';

import PageHeading from '#/components/platform/page-heading.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { usePlatformStore } from '#/store';

const platformStore = usePlatformStore();
const keyword = ref('');
const moduleFilter = ref('all');
const actorFilter = ref('all');
const currentPage = ref(1);
const pageSize = 50;
const loading = ref(false);
const moduleOptions = [
  { label: '全部模块', value: 'all' },
  { label: '接口请求', value: 'request' },
  { label: '页面访问', value: 'navigation' },
  { label: '用户与认证', value: 'identity' },
  { label: '项目', value: 'project' },
  { label: '资产', value: 'asset' },
  { label: '任务', value: 'job' },
];

const scopeDescription = computed(() =>
  platformStore.auditScope === 'all'
    ? '管理员可查看所有管理员和普通用户的操作，用户名与角色标签用于区分不同操作者。'
    : '当前账号只能查看自己的操作记录。',
);

const actorOptions = computed(() => [
  { label: '全部用户', value: 'all' },
  ...platformStore.users.map((user) => ({
    label: `${user.name}（@${user.username} · ${user.roles[0] ?? '未分配'}）`,
    value: user.id,
  })),
]);

const filteredEvents = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  return platformStore.auditEvents.filter((event) => {
    const matchesKeyword =
      !normalized ||
      `${event.operator}${event.username ?? ''}${event.action}${event.target}${event.ip}`
        .toLowerCase()
        .includes(normalized);
    return matchesKeyword;
  });
});

function actorLabel(actorType: 'admin' | 'system' | 'user' | undefined) {
  if (actorType === 'admin') return '管理员';
  if (actorType === 'user') return '普通用户';
  return '系统';
}

async function loadEvents() {
  loading.value = true;
  try {
    const result = await platformStore.loadAuditEvents({
      actorId: actorFilter.value === 'all' ? undefined : actorFilter.value,
      limit: pageSize,
      module: moduleFilter.value === 'all' ? undefined : moduleFilter.value,
      page: currentPage.value,
    });
    if (result.scope === 'all' && platformStore.users.length === 0) {
      await platformStore.loadAdministration();
    }
  } finally {
    loading.value = false;
  }
}

function changePage(page: number) {
  currentPage.value = page;
  void loadEvents();
}

watch([moduleFilter, actorFilter], () => {
  currentPage.value = 1;
  void loadEvents();
});

onMounted(loadEvents);
</script>

<template>
  <main class="platform-page audit-page">
    <PageHeading
      :description="scopeDescription"
      eyebrow="Audit trail"
      title="操作日志"
    />
    <div class="platform-content">
      <section class="platform-panel" :aria-busy="loading">
        <div class="rail-toolbar">
          <div class="audit-filters">
            <Input
              v-model:value="keyword"
              allow-clear
              class="audit-search"
              placeholder="搜索姓名、用户名、动作、对象或 IP"
            >
              <template #prefix><IconifyIcon icon="lucide:search" /></template>
            </Input>
            <Select
              v-model:value="moduleFilter"
              :options="moduleOptions"
              class="audit-module"
            />
            <Select
              v-if="platformStore.auditScope === 'all'"
              v-model:value="actorFilter"
              :options="actorOptions"
              class="audit-actor-filter"
              show-search
            />
          </div>
          <span class="audit-total">
            当前页 {{ filteredEvents.length }} 条，共
            {{ platformStore.auditTotal }} 条
          </span>
        </div>
        <div class="audit-head">
          <span>时间</span>
          <span>操作人</span>
          <span>模块 / 动作</span>
          <span>操作对象</span>
          <span>请求</span>
          <span>来源 IP</span>
          <span>结果</span>
        </div>
        <div v-if="filteredEvents.length" class="audit-list">
          <div
            v-for="event in filteredEvents"
            :key="event.id"
            class="audit-row"
          >
            <time>{{ new Date(event.createdAt).toLocaleString('zh-CN') }}</time>
            <div class="audit-actor">
              <strong>{{ event.operator }}</strong>
              <small>@{{ event.username || 'system' }}</small>
              <Tag :color="event.actorType === 'admin' ? 'red' : 'default'">
                {{ actorLabel(event.actorType) }}
              </Tag>
            </div>
            <div>
              <small>{{ event.module }}</small>
              <strong>{{ event.action }}</strong>
            </div>
            <span class="audit-target">{{ event.target }}</span>
            <div class="audit-request">
              <code v-if="event.method">
                {{ event.method }} · {{ event.statusCode ?? '-' }}
              </code>
              <small
                v-if="
                  event.durationMs !== null && event.durationMs !== undefined
                "
              >
                {{ event.durationMs }} ms
              </small>
              <span v-if="!event.method">-</span>
            </div>
            <code>{{ event.ip }}</code>
            <StatusPill :status="event.result" />
          </div>
        </div>
        <div v-else class="audit-empty">
          {{ loading ? '正在读取操作日志…' : '暂无符合条件的操作日志' }}
        </div>
        <div
          v-if="platformStore.auditTotal > pageSize"
          class="audit-pagination"
        >
          <Pagination
            :current="currentPage"
            :page-size="pageSize"
            :show-size-changer="false"
            :total="platformStore.auditTotal"
            @change="changePage"
          />
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.audit-filters {
  display: flex;
  gap: 10px;
}

.audit-search {
  width: 330px;
}

.audit-module,
.audit-actor-filter {
  width: 140px;
}

.audit-actor-filter {
  width: 260px;
}

.audit-total {
  font-size: 11px;
  color: var(--rail-steel);
}

.audit-head,
.audit-row {
  display: grid;
  grid-template-columns:
    145px minmax(145px, 0.8fr) minmax(140px, 0.8fr) minmax(220px, 1.2fr)
    100px 115px 64px;
  gap: 14px;
  align-items: center;
  padding: 0 18px;
}

.audit-head {
  min-height: 38px;
  font-size: var(--rail-font-caption);
  font-weight: 700;
  color: var(--rail-steel);
  text-transform: uppercase;
  background: var(--rail-theme-surface, #fafbfc);
}

.audit-row {
  min-height: 76px;
  font-size: var(--rail-font-label);
  border-top: 1px solid var(--rail-line);
}

.audit-row > div {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.audit-row small {
  font-size: var(--rail-font-caption);
  color: var(--rail-steel);
}

.audit-row strong {
  font-size: var(--rail-font-label);
}

.audit-row code {
  font-size: var(--rail-font-caption);
  color: var(--rail-steel);
}

.audit-actor :deep(.ant-tag) {
  margin-top: 4px;
  font-size: var(--rail-font-caption);
}

.audit-target {
  overflow-wrap: anywhere;
}

.audit-request {
  gap: 2px;
}

.audit-empty {
  display: grid;
  place-items: center;
  min-height: 220px;
  font-size: 12px;
  color: var(--rail-steel);
  border-top: 1px solid var(--rail-line);
}

.audit-pagination {
  display: flex;
  justify-content: flex-end;
  padding: 16px 18px;
  border-top: 1px solid var(--rail-line);
}

@media (max-width: 1080px) {
  .audit-head {
    display: none;
  }

  .audit-row {
    grid-template-columns: 1fr 1fr;
    padding: 14px 18px;
  }
}

@media (max-width: 620px) {
  .audit-filters {
    flex-direction: column;
    width: 100%;
  }

  .audit-search,
  .audit-module,
  .audit-actor-filter {
    width: 100%;
  }
}
</style>
