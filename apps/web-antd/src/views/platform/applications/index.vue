<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { Button, Input, Segmented } from 'ant-design-vue';

import PageHeading from '#/components/platform/page-heading.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { usePlatformStore } from '#/store';

const router = useRouter();
const platformStore = usePlatformStore();
const keyword = ref('');
const category = ref('all');

const categoryOptions = [
  { label: '全部', value: 'all' },
  { label: '方案设计', value: 'design' },
  { label: '生成能力', value: 'generation' },
  { label: '模型训练', value: 'training' },
  { label: '报告交付', value: 'report' },
];

const assetTypeLabels: Record<string, string> = {
  audio: '音频',
  image: '图片',
  lora: 'LoRA',
  mask: '遮罩',
  material: '材质',
  model3d: '3D 模型',
  report: '报告',
  text: '文本',
  video: '视频',
};

const filteredApplications = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  return platformStore.applications.filter((application) => {
    const matchesCategory =
      category.value === 'all' || application.category === category.value;
    const matchesKeyword =
      !normalized ||
      `${application.name}${application.description}${application.provider}`
        .toLowerCase()
        .includes(normalized);
    return matchesCategory && matchesKeyword;
  });
});
</script>

<template>
  <main class="platform-page applications-page">
    <PageHeading
      description="应用只声明业务输入、输出资产和使用权限；外部服务地址与密钥不进入浏览器。"
      eyebrow="Application registry"
      title="应用中心"
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
          <Segmented v-model:value="category" :options="categoryOptions" />
          <Input
            v-model:value="keyword"
            allow-clear
            class="application-search"
            placeholder="搜索应用"
          >
            <template #prefix><IconifyIcon icon="lucide:search" /></template>
          </Input>
        </div>

        <div class="application-grid">
          <article
            v-for="application in filteredApplications"
            :key="application.key"
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
              <StatusPill :status="application.status" />
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
              <div>
                <small>服务提供方</small>
                <span>{{ application.provider }}</span>
              </div>
              <Button
                type="primary"
                @click="router.push(`/workspace/${application.key}`)"
              >
                打开工作区
              </Button>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.application-search {
  width: 280px;
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

.application-card:hover {
  border-color: #cfaeb4;
  box-shadow: var(--rail-shadow);
  transform: translateY(-2px);
}

.application-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
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
  top: 2px;
  right: 12px;
  z-index: 0;
  font-family: 'Arial Narrow', sans-serif;
  font-size: 58px;
  font-weight: 800;
  color: #f3f4f5;
  letter-spacing: -0.06em;
  pointer-events: none;
}

.application-card h2 {
  position: relative;
  margin: 22px 0 7px;
  font-size: 19px;
  font-weight: 680;
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

.application-card__footer div {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.application-card__footer small {
  font-size: 9px;
  color: var(--rail-steel);
}

.application-card__footer span {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  white-space: nowrap;
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

  .application-search {
    width: 100%;
  }

  .application-toolbar :deep(.ant-segmented-group) {
    flex-wrap: wrap;
  }
}
</style>
