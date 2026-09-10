<script lang="ts" setup>
import { ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { getAssetPreviewApi } from '#/api';

const props = defineProps<{ assetId: string }>();

const content = ref('');
const failed = ref(false);
const loading = ref(false);
let requestVersion = 0;

watch(
  () => props.assetId,
  async (assetId) => {
    const version = ++requestVersion;
    content.value = '';
    failed.value = false;
    loading.value = true;
    try {
      const preview = await getAssetPreviewApi(assetId);
      let value = '';
      if (preview.mode === 'inline') {
        value = preview.content;
      } else {
        const response = await fetch(preview.url);
        if (!response.ok) throw new Error('读取文本预览失败');
        value = await response.text();
      }
      if (version === requestVersion) content.value = value;
    } catch {
      if (version === requestVersion) failed.value = true;
    } finally {
      if (version === requestVersion) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="loading" class="asset-text-preview__state">
    <IconifyIcon class="is-loading" icon="lucide:loader-circle" />
    正在读取文本内容
  </div>
  <div v-else-if="failed" class="asset-text-preview__state">
    <IconifyIcon icon="lucide:file-warning" />
    暂时无法读取文本内容
  </div>
  <pre v-else class="asset-text-preview__content">{{ content }}</pre>
</template>

<style scoped>
.asset-text-preview__content {
  width: 100%;
  max-height: 420px;
  padding: 16px;
  margin: 0;
  overflow: auto;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.75;
  color: var(--rail-theme-text, #26323d);
  text-align: left;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--rail-theme-surface, #fff);
  border-radius: 10px;
}

.asset-text-preview__state {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 160px;
  color: var(--rail-theme-secondary, #788590);
}

.is-loading {
  animation: asset-text-preview-spin 0.9s linear infinite;
}

@keyframes asset-text-preview-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
