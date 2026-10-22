<script setup lang="ts">
import type { DesignModeApplications } from '#/api/platform/design-modes';
import type { PlatformApplication } from '#/modules/platform/types';

import { computed, ref } from 'vue';

import { Button, Checkbox, message, Modal, Select } from 'ant-design-vue';

import {
  getApplicationsApi,
  getDesignModeApplicationsApi,
  saveDesignModeApplicationsApi,
} from '#/api/platform';
import { designModes } from '#/modules/platform/design-modes';
import { usePlatformStore } from '#/store';
const store = usePlatformStore();
const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const configs = ref<DesignModeApplications[]>([]);
const applications = ref<PlatformApplication[]>([]);
const selectedMode = ref<'cabin' | 'cmf' | 'component'>('cabin');
const current = computed(() =>
  configs.value.find((item) => item.designMode === selectedMode.value),
);
const choices = computed(() =>
  applications.value.filter(
    (app) =>
      app.capabilityCode &&
      !['screen-capture-edit', 'text-chat'].includes(app.key),
  ),
);
const rows = computed(() => {
  const keys = current.value?.applicationKeys ?? [];
  return [
    ...keys,
    ...choices.value.map((app) => app.key).filter((key) => !keys.includes(key)),
  ].map((key) => ({
    key,
    name: applications.value.find((app) => app.key === key)?.name ?? key,
  }));
});
const defaults = computed(() =>
  (current.value?.applicationKeys ?? [])
    .filter((key) => key !== 'text-to-image')
    .map((key) => ({
      value: key,
      label: applications.value.find((app) => app.key === key)?.name ?? key,
    })),
);
async function show() {
  loading.value = true;
  try {
    const [catalogs, apps] = await Promise.all([
      getDesignModeApplicationsApi(),
      getApplicationsApi(),
    ]);
    configs.value = catalogs;
    applications.value = apps;
    open.value = true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '配置加载失败');
  } finally {
    loading.value = false;
  }
}
function toggle(key: string, checked: boolean) {
  const config = current.value;
  if (!config) return;
  config.applicationKeys = checked
    ? [...config.applicationKeys, key]
    : config.applicationKeys.filter((item) => item !== key);
  if (!config.applicationKeys.includes(config.defaultImageApplicationKey))
    config.defaultImageApplicationKey =
      config.applicationKeys.find((item) => item !== 'text-to-image') ?? '';
}
function move(key: string, direction: number) {
  const keys = current.value?.applicationKeys;
  if (!keys) return;
  const index = keys.indexOf(key);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= keys.length) return;
  [keys[index], keys[target]] = [keys[target] as string, keys[index] as string];
}
async function save() {
  if (!current.value?.defaultImageApplicationKey) {
    message.warning('请选择已启用的图生图默认功能');
    return;
  }
  saving.value = true;
  try {
    const saved = await saveDesignModeApplicationsApi(current.value);
    configs.value = configs.value.map((item) =>
      item.designMode === saved.designMode ? saved : item,
    );
    try {
      store.applications = await getApplicationsApi();
      message.success('当前模块功能已保存');
    } catch {
      message.warning('配置已保存，功能目录刷新失败，请刷新页面');
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '配置保存失败');
  } finally {
    saving.value = false;
  }
}
defineExpose({ show });
</script>
<template>
  <Button :loading="loading" @click="show">模块功能设置</Button>
  <Modal
    v-model:open="open"
    title="设计模块功能设置"
    :footer="null"
    width="min(760px, 94vw)"
    :closable="!saving"
    :mask-closable="false"
  >
    <p>
      分别设置各模块的可见功能、顺序及图生图默认功能。每次保存当前模块；取消关闭会丢弃未保存修改。
    </p>
    <Select
      v-model:value="selectedMode"
      :disabled="saving"
      aria-label="配置设计模块"
      :options="
        designModes
          .filter((item) => item.key !== 'report')
          .map((item) => ({ value: item.key, label: item.label }))
      "
      style="width: 100%"
    />
    <div class="mode-editor-list">
      <div v-for="row in rows" :key="row.key" class="mode-editor-row">
        <Checkbox
          :checked="current?.applicationKeys.includes(row.key)"
          :disabled="saving"
          @change="toggle(row.key, $event.target.checked)"
        >
          {{ row.name }}
        </Checkbox>
        <span v-if="current?.applicationKeys.includes(row.key)">
          <Button
            :aria-label="`上移${row.name}`"
            :disabled="saving || current.applicationKeys.indexOf(row.key) === 0"
            @click="move(row.key, -1)"
          >
            ↑
          </Button>
          <Button
            :aria-label="`下移${row.name}`"
            :disabled="
              saving ||
              current.applicationKeys.indexOf(row.key) ===
                current.applicationKeys.length - 1
            "
            @click="move(row.key, 1)"
          >
            ↓
          </Button>
        </span>
      </div>
    </div>
    <label>图生图默认功能</label>
    <Select
      v-if="current"
      v-model:value="current.defaultImageApplicationKey"
      :disabled="saving"
      aria-label="图生图默认功能"
      :options="defaults"
      style="width: 100%; margin: 8px 0 20px"
    />
    <div class="mode-editor-footer">
      <Button :disabled="saving" @click="open = false">关闭</Button>
      <Button type="primary" :loading="saving" @click="save">
        保存当前模块
      </Button>
    </div>
  </Modal>
</template>
<style scoped>
.mode-editor-list {
  max-height: 48vh;
  margin: 16px 0;
  overflow: auto;
}

.mode-editor-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  border-bottom: 1px solid #eee;
}

.mode-editor-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
