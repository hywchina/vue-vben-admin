<script setup lang="ts">
import type {
  WorkflowDefinition,
  WorkflowManagementResult,
  WorkflowVersion,
} from '#/modules/platform/types';

import { computed, ref, watch } from 'vue';

import { Button, Empty, message, Select, Space, Tag } from 'ant-design-vue';

import { copyTextToClipboard } from '#/utils/copy-text';

const props = defineProps<{
  capabilities: WorkflowManagementResult['capabilities'];
  workflow: WorkflowDefinition;
}>();
const versionId = ref<string>();
const expanded = ref(false);
const copying = ref(false);
const versions = computed(() =>
  props.workflow.versions.toSorted((a, b) => b.version - a.version),
);
const version = computed(() =>
  versions.value.find((item) => item.id === versionId.value),
);
const json = computed(() =>
  version.value ? JSON.stringify(version.value.apiJson, null, 2) : '',
);
const filename = computed(() =>
  version.value ? `${props.workflow.code}-v${version.value.version}.json` : '',
);
function bindingLabel(item: WorkflowVersion) {
  if (item.activeCapabilities.length === 0) return '未绑定功能';
  return `当前绑定：${item.activeCapabilities
    .map(
      (code) =>
        props.capabilities.find((entry) => entry.code === code)?.name ?? code,
    )
    .join('、')}`;
}
const options = computed(() =>
  versions.value.map((item) => ({
    label: `v${item.version} · ${bindingLabel(item)}`,
    value: item.id,
  })),
);
watch(
  () => props.workflow,
  () => {
    const bound = versions.value.filter(
      (item) => item.activeCapabilities.length,
    );
    // 多功能可能分别绑定不同版本；仅在绑定版本唯一时默认选中它。
    versionId.value = (bound.length === 1 ? bound[0] : versions.value[0])?.id;
    expanded.value = false;
  },
  { immediate: true },
);

async function copyJson() {
  if (!version.value || copying.value) return;
  copying.value = true;
  try {
    if (await copyTextToClipboard(json.value))
      message.success('API JSON 已复制');
    else message.error('复制失败，请展开 JSON 后手动复制');
  } catch {
    message.error('复制失败，请展开 JSON 后手动复制');
  } finally {
    copying.value = false;
  }
}
function downloadJson() {
  if (!version.value) return;
  let url: string | undefined;
  const anchor = document.createElement('a');
  try {
    const blob = new Blob([`${json.value}\n`], {
      type: 'application/json;charset=utf-8',
    });
    url = URL.createObjectURL(blob);
    anchor.href = url;
    anchor.download = filename.value;
    document.body.append(anchor);
    anchor.click();
  } catch {
    message.error('下载失败，请重试或复制 JSON');
  } finally {
    anchor.remove();
    // 留出浏览器消费 Blob 的时间，不在点击后立即撤销下载地址。
    if (url) {
      const objectUrl = url;
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    }
  }
}
</script>

<template>
  <section class="workflow-json-panel" aria-label="工作流 API JSON">
    <h3>工作流 API JSON</h3>
    <p class="json-note">
      来自数据库中已登记的版本，只读查看或导出，不修改原始文件和功能绑定。
      最新版本不一定是功能正在使用的版本；绑定不代表工作流或服务当前可执行。
    </p>
    <template v-if="versions.length">
      <label class="version-label">
        已有版本
        <Select
          v-model:value="versionId"
          aria-label="API JSON 版本"
          :options="options"
          class="version-select"
        />
      </label>
      <template v-if="version">
        <div class="version-info">
          <Tag
            :color="version.activeCapabilities.length ? 'success' : 'default'"
          >
            {{ bindingLabel(version) }}
          </Tag>
          <span>导出文件：{{ filename }}</span>
        </div>
        <Space wrap>
          <Button :aria-expanded="expanded" @click="expanded = !expanded">
            {{ expanded ? '收起 API JSON' : '查看 API JSON' }}
          </Button>
          <Button :loading="copying" @click="copyJson">复制 API JSON</Button>
          <Button @click="downloadJson">下载 API JSON</Button>
        </Space>
        <pre
          v-if="expanded"
          class="json-preview"
          tabindex="0"
          aria-label="API JSON 内容"
        ><code>{{ json }}</code></pre>
      </template>
    </template>
    <Empty v-else description="暂无工作流版本，无法查看或下载 API JSON" />
  </section>
</template>

<style scoped>
.workflow-json-panel {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding-top: 16px;
  border-top: 1px solid hsl(var(--border));
}

.workflow-json-panel h3 {
  font-weight: 600;
}

.json-note,
.version-info {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.version-label {
  display: grid;
  gap: 8px;
}

.version-select {
  width: 100%;
}

.version-info {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  overflow-wrap: anywhere;
}

.json-preview {
  max-height: 360px;
  padding: 12px;
  overflow: auto;
  font-family: SFMono-Regular, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  background: hsl(var(--muted) / 45%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
</style>
