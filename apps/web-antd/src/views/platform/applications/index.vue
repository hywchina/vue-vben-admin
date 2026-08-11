<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Empty,
  Input,
  message,
  Segmented,
  Select,
  Switch,
} from 'ant-design-vue';

import { createWorkflowWorkspaceInstanceApi } from '#/api';
import PageHeading from '#/components/platform/page-heading.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { assetTypeLabels } from '#/modules/platform/asset-types';
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();
const keyword = ref('');
const category = ref('all');
const status = ref('all');
const visibility = ref('all');
const visibilityUpdating = ref<string[]>([]);
const openingApplication = ref('');

const categoryOptions = [
  { label: '全部', value: 'all' },
  { label: '方案设计', value: 'design' },
  { label: '生成能力', value: 'generation' },
  { label: '模型训练', value: 'training' },
  { label: '报告交付', value: 'report' },
];

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '可使用', value: 'available' },
  { label: '接入测试', value: 'testing' },
  { label: '待接入', value: 'planned' },
];

const visibilityOptions = [
  { label: '全部可见性', value: 'all' },
  { label: '用户可见', value: 'visible' },
  { label: '已隐藏', value: 'hidden' },
];

const canManageVisibility = computed(() =>
  platformStore.applications.some(
    (application) => application.canManageVisibility,
  ),
);

const filteredApplications = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  return platformStore.applications.filter((application) => {
    const matchesCategory =
      category.value === 'all' || application.category === category.value;
    const matchesStatus =
      status.value === 'all' || application.status === status.value;
    const matchesVisibility =
      !canManageVisibility.value ||
      visibility.value === 'all' ||
      (visibility.value === 'visible'
        ? application.visible
        : !application.visible);
    const matchesKeyword =
      !normalized ||
      `${application.name}${application.shortName}${application.description}${application.provider}`
        .toLowerCase()
        .includes(normalized);
    return (
      matchesCategory && matchesStatus && matchesVisibility && matchesKeyword
    );
  });
});

async function changeVisibility(appKey: string, visible: boolean) {
  visibilityUpdating.value.push(appKey);
  try {
    await platformStore.setApplicationVisibility(appKey, visible);
    message.success(visible ? '应用已对普通用户显示' : '应用已对普通用户隐藏');
  } finally {
    visibilityUpdating.value = visibilityUpdating.value.filter(
      (key) => key !== appKey,
    );
  }
}

async function openApplicationInstance(appKey: string) {
  if (!platformStore.currentProjectId) {
    message.warning('请先选择项目');
    return;
  }
  openingApplication.value = appKey;
  try {
    const instance = await createWorkflowWorkspaceInstanceApi({
      appKey,
      projectId: platformStore.currentProjectId,
    });
    await router.push({
      path: `/workspace/${appKey}`,
      query: { instanceId: instance.id },
    });
  } finally {
    openingApplication.value = '';
  }
}
</script>

<template>
  <main class="platform-page applications-page">
    <PageHeading
      description="应用只声明业务输入、输出资产和使用权限；外部服务地址与密钥不进入浏览器。"
      eyebrow="Application registry"
      title="应用调试中心"
    >
      <template #extra>
        <Button disabled>
          <IconifyIcon class="mr-1" icon="lucide:plug-zap" />
          接入新能力
        </Button>
      </template>
    </PageHeading>

    <div class="platform-content">
      <section class="platform-panel">
        <div class="rail-toolbar application-toolbar">
          <div class="application-toolbar__categories">
            <Segmented v-model:value="category" :options="categoryOptions" />
          </div>
          <div class="application-toolbar__filters">
            <Input
              v-model:value="keyword"
              allow-clear
              class="application-search"
              placeholder="按名称、描述或服务方搜索"
            >
              <template #prefix><IconifyIcon icon="lucide:search" /></template>
            </Input>
            <Select
              v-model:value="status"
              :options="statusOptions"
              class="application-filter-select"
            />
            <Select
              v-if="canManageVisibility"
              v-model:value="visibility"
              :options="visibilityOptions"
              class="application-filter-select application-visibility-select"
            />
          </div>
        </div>

        <div v-if="filteredApplications.length > 0" class="application-grid">
          <article
            v-for="application in filteredApplications"
            :key="application.key"
            :class="{ 'application-card--hidden': !application.visible }"
            class="application-card"
          >
            <div class="application-card__head">
              <div
                class="application-card__icon"
                :style="{
                  backgroundColor: `${application.color}14`,
                  color: application.color,
                }"
              >
                <IconifyIcon :icon="application.icon" />
              </div>
              <div class="application-card__badges">
                <StatusPill :status="application.status" />
                <span
                  v-if="canManageVisibility && !application.visible"
                  class="application-visibility-badge"
                >
                  已隐藏
                </span>
              </div>
            </div>
            <div class="application-card__number">
              {{ application.shortName }}
            </div>
            <h2>{{ application.name }}</h2>
            <p>{{ application.description }}</p>

            <div class="application-contract">
              <div>
                <span>可选输入</span>
                <strong>
                  {{
                    application.acceptedAssetTypes
                      .map((type) => assetTypeLabels[type])
                      .join(' · ') || '无'
                  }}
                </strong>
              </div>
              <IconifyIcon icon="lucide:arrow-right" />
              <div>
                <span>登记输出</span>
                <strong>
                  {{
                    application.outputAssetTypes
                      .map((type) => assetTypeLabels[type])
                      .join(' · ')
                  }}
                </strong>
              </div>
            </div>

            <div class="application-card__footer">
              <div class="application-provider">
                <small>服务提供方</small>
                <span>{{ application.provider }}</span>
              </div>
              <div class="application-card__actions">
                <label
                  v-if="canManageVisibility"
                  class="application-visibility-control"
                >
                  <span>用户可见</span>
                  <Switch
                    :checked="application.visible"
                    :loading="visibilityUpdating.includes(application.key)"
                    size="small"
                    @change="
                      (checked) =>
                        changeVisibility(application.key, Boolean(checked))
                    "
                  />
                </label>
                <Button
                  :loading="openingApplication === application.key"
                  type="primary"
                  @click="openApplicationInstance(application.key)"
                >
                  单功能调试
                </Button>
              </div>
            </div>
          </article>
        </div>
        <Empty
          v-else
          class="application-empty"
          description="没有符合筛选条件的应用"
        />
      </section>
    </div>
  </main>
</template>

<style scoped>
.application-search {
  width: min(320px, 100%);
}

.application-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.application-toolbar__categories {
  max-width: 100%;
  overflow-x: auto;
}

.application-toolbar__filters {
  display: flex;
  flex: 1 1 480px;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.application-filter-select {
  flex: 0 0 auto;
  width: 132px;
}

.application-visibility-select {
  width: 142px;
}

.application-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
}

.application-card {
  position: relative;
  min-height: 342px;
  padding: 20px;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--rail-line);
  border-radius: 13px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.application-card--hidden {
  background: #fafafa;
  border-style: dashed;
}

.application-card:hover {
  border-color: #cfaeb4;
  box-shadow: var(--rail-shadow);
  transform: translateY(-2px);
}

.application-card__head {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.application-card__badges {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-end;
}

.application-visibility-badge {
  padding: 2px 8px;
  font-size: 10px;
  color: #6b7280;
  background: #f1f2f4;
  border: 1px solid #d9dde3;
  border-radius: 999px;
}

.application-card__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  font-size: 23px;
  border-radius: 12px;
}

.application-card__number {
  position: absolute;
  top: 66px;
  right: 18px;
  z-index: 0;
  max-width: 52%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Arial Narrow', sans-serif;
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  color: #f3f4f5;
  text-align: right;
  letter-spacing: -0.06em;
  white-space: nowrap;
  pointer-events: none;
}

.application-card h2 {
  position: relative;
  margin: 22px 0 7px;
  font-size: 19px;
  font-weight: 680;
  isolation: isolate;
}

.application-card > p {
  min-height: 43px;
  margin: 0;
  font-size: 11px;
  line-height: 1.65;
  color: var(--rail-steel);
}

.application-contract {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 9px;
  align-items: center;
  padding: 13px;
  margin-top: 19px;
  background: var(--rail-mist);
  border-radius: 10px;
}

.application-contract div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.application-contract div:last-child {
  text-align: right;
}

.application-contract span {
  font-size: 9px;
  color: var(--rail-steel);
}

.application-contract strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  white-space: nowrap;
}

.application-contract > svg {
  color: var(--rail-red);
}

.application-card__footer {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
  padding-top: 16px;
  margin-top: 21px;
  border-top: 1px solid var(--rail-line);
}

.application-provider {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.application-card__footer small {
  font-size: 9px;
  color: var(--rail-steel);
}

.application-provider > span {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  white-space: nowrap;
}

.application-card__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 10px;
  align-items: flex-end;
}

.application-visibility-control {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
  font-size: 9px;
  color: var(--rail-steel);
  white-space: nowrap;
}

.application-empty {
  padding: 72px 20px;
}

@media (max-width: 1100px) {
  .application-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 720px) {
  .application-grid {
    grid-template-columns: 1fr;
  }

  .application-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .application-toolbar__filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .application-search {
    grid-column: 1 / -1;
    width: 100%;
  }

  .application-filter-select,
  .application-visibility-select {
    width: 100%;
  }

  .application-card__footer {
    align-items: stretch;
  }

  .application-card__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .application-visibility-control {
    flex-direction: row;
    justify-content: flex-end;
  }

  .application-toolbar :deep(.ant-segmented-group) {
    flex-wrap: wrap;
  }
}
</style>
