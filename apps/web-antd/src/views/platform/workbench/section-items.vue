<script setup lang="ts">
import type { WorkbenchItem, WorkbenchSection } from '#/api/platform/workbench';

import { IconifyIcon } from '@vben/icons';

import { Button, Progress } from 'ant-design-vue';

import StatusPill from '#/components/platform/status-pill.vue';
import { assetTypeLabels } from '#/modules/platform/asset-types';

import AssetThumbnail from './asset-thumbnail.vue';

defineProps<{
  busy: boolean;
  items: WorkbenchItem[];
  section: WorkbenchSection;
}>();
const emit = defineEmits<{ action: [action: string, item: WorkbenchItem] }>();
const date = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
const active = (item: WorkbenchItem) =>
  ['cancelling', 'queued', 'running'].includes(item.status ?? '');
</script>
<template>
  <div class="wb-items" :class="[`wb-items--${section}`]">
    <article
      v-for="item in items"
      :key="item.id"
      class="wb-item"
      :data-item-id="item.id"
    >
      <template v-if="section === 'designs'">
        <button
          class="wb-design-thumb"
          :aria-label="`继续设计 ${item.name}`"
          :disabled="busy"
          @click="emit('action', 'design', item)"
        >
          <AssetThumbnail
            :asset-id="item.previewAssetId"
            :name="item.name"
            type="image"
          />
        </button>
        <div class="wb-item-body">
          <h3 :title="item.name">{{ item.name }}</h3>
          <p>{{ item.projectName }}</p>
          <p>{{ item.roundCount }} 轮设计 · {{ date(item.updatedAt) }}</p>
          <div class="wb-item-bottom">
            <StatusPill v-if="item.status" :status="item.status" />
            <span v-else class="wb-muted">尚未执行</span>
            <Button
              type="link"
              :disabled="busy"
              @click="emit('action', 'design', item)"
            >
              继续设计
            </Button>
          </div>
        </div>
      </template>
      <template v-else-if="section === 'projects'">
        <span class="wb-folder"><IconifyIcon icon="lucide:folder" /></span>
        <div class="wb-item-body">
          <h3 :title="item.name">
            <button
              class="wb-project-name"
              :disabled="busy"
              @click="emit('action', 'projects', item)"
            >
              {{ item.name }}
            </button>
          </h3>
          <p>{{ item.assetCount }} 项资产 · {{ date(item.updatedAt) }} 更新</p>
        </div>
        <Button
          type="link"
          :disabled="busy"
          @click="emit('action', 'assets', item)"
        >
          进入资产
        </Button>
      </template>
      <template v-else-if="section === 'tasks'">
        <div class="wb-item-body">
          <h3 :title="item.name">{{ item.name }}</h3>
          <p>{{ item.projectName }} · {{ item.appName }}</p>
        </div>
        <div class="wb-task-status">
          <StatusPill :status="item.status ?? ''" />
          <Progress
            v-if="active(item)"
            :percent="item.progress ?? 0"
            size="small"
            :show-info="true"
          />
        </div>
        <time>{{ date(item.updatedAt) }}</time>
        <div class="wb-task-actions">
          <Button
            type="link"
            :disabled="busy"
            @click="emit('action', 'task', item)"
          >
            {{
              active(item)
                ? '查看进度'
                : item.status === 'succeeded'
                  ? '查看结果'
                  : '查看详情'
            }}
          </Button>
          <Button
            v-if="active(item) && item.canWrite"
            type="text"
            danger
            :disabled="busy || item.status === 'cancelling'"
            @click="emit('action', 'stop', item)"
          >
            {{ item.status === 'cancelling' ? '取消中' : '停止' }}
          </Button>
        </div>
      </template>
      <template v-else-if="section === 'results' || section === 'saved'">
        <button
          class="wb-result-thumb"
          :aria-label="`预览 ${item.name}`"
          :disabled="busy"
          @click="emit('action', 'preview', item)"
        >
          <AssetThumbnail
            :asset-id="item.previewAssetId"
            :name="item.name"
            :type="item.type"
          />
          <span class="wb-save-badge" :class="[{ saved: item.saved }]">
            {{ item.saved ? '已保存' : '未保存' }}
          </span>
        </button>
        <div class="wb-item-body">
          <h3 :title="item.name">{{ item.name }}</h3>
          <p>{{ item.projectName }}</p>
          <p>
            {{ item.type ? assetTypeLabels[item.type] : '成果' }} ·
            {{ date(item.updatedAt) }}
            {{ section === 'saved' ? '保存' : '生成' }}
          </p>
          <div class="wb-result-actions">
            <Button
              type="link"
              :disabled="busy"
              @click="emit('action', 'preview', item)"
            >
              预览
            </Button>
            <Button
              v-if="section === 'saved'"
              type="link"
              :disabled="busy"
              @click="emit('action', 'download', item)"
            >
              下载
            </Button>
            <Button
              v-if="section === 'results' && !item.saved && item.canWrite"
              type="link"
              :disabled="busy"
              @click="emit('action', 'save', item)"
            >
              保存至项目
            </Button>
            <Button
              v-else-if="item.saved"
              type="link"
              :disabled="busy"
              @click="emit('action', 'folder', item)"
            >
              所在目录
            </Button>
          </div>
        </div>
      </template>
    </article>
  </div>
</template>
<style scoped>
.wb-project-name {
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font: inherit;
  color: inherit;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.wb-items {
  min-width: 0;
}

.wb-item {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.wb-item-body {
  flex: 1;
  min-width: 0;
}

h3 {
  margin: 0 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

p {
  margin: 4px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--rail-theme-secondary, #87909c);
  white-space: nowrap;
}

.wb-item-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.wb-muted,
time {
  font-size: 12px;
  color: var(--rail-theme-secondary, #87909c);
}

.wb-items :deep(.ant-btn) {
  height: 28px;
  padding: 0 5px;
  font-size: 12px;
}

.wb-items--designs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: 14px;
}

.wb-items--designs .wb-item {
  align-items: stretch;
  padding: 12px;
  border: 1px solid var(--rail-theme-border, #edf0f3);
  border-radius: 8px;
}

.wb-design-thumb {
  flex: 0 0 82px;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
}

.wb-items--projects .wb-item + .wb-item {
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid var(--rail-theme-border, #f0f2f5);
}

.wb-folder,
.wb-file-icon {
  display: grid;
  flex: 0 0 40px;
  place-items: center;
  height: 40px;
  color: var(--rail-theme-accent, #cf1641);
  background: var(--rail-theme-surface, #fff2f5);
  border-radius: 8px;
}

.wb-folder :deep(svg),
.wb-file-icon :deep(svg) {
  width: 21px;
  height: 21px;
}

.wb-file-icon {
  color: var(--rail-theme-secondary, #697b90);
  background: var(--rail-theme-surface, #f0f3f7);
}

.wb-items--tasks .wb-item {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) 150px 110px 160px;
  gap: 24px;
  padding: 13px 0;
  border-bottom: 1px solid var(--rail-theme-border, #f0f2f5);
}

.wb-items--tasks .wb-item:last-child {
  border: 0;
}

.wb-task-status {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.wb-task-actions {
  display: flex;
  justify-content: flex-end;
}

:is(.wb-items--results, .wb-items--saved) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

:is(.wb-items--results, .wb-items--saved) .wb-item {
  display: block;
  overflow: hidden;
  border: 1px solid var(--rail-theme-border, #edf0f3);
  border-radius: 8px;
}

:is(.wb-items--results, .wb-items--saved) .wb-item-body {
  padding: 12px;
}

.wb-result-thumb {
  position: relative;
  display: block;
  width: 100%;
  height: 150px;
  padding: 0;
  border: 0;
}

.wb-save-badge {
  position: absolute;
  top: 9px;
  right: 9px;
  padding: 3px 7px;
  font-size: 11px;
  color: #965916;
  background: var(--rail-theme-surface, #fff7e9);
  border-radius: 4px;
}

.wb-save-badge.saved {
  color: #35825d;
  background: var(--rail-theme-surface, #eef8f0);
}

.wb-result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin: 7px -5px -4px;
}

@media (max-width: 1250px) {
  .wb-result-thumb {
    height: 120px;
  }
}

@media (max-width: 760px) {
  .wb-items--tasks .wb-item {
    grid-template-columns: minmax(0, 1fr) 110px;
    gap: 10px;
  }

  :is(.wb-items--results, .wb-items--saved) {
    grid-template-columns: 1fr;
  }

  .wb-result-thumb {
    height: 190px;
  }

  .wb-items--tasks time {
    grid-row: 2;
  }
}
</style>
