<script lang="ts" setup>
import { ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { getAssetPreviewApi } from '#/api';
import Model3dViewer from '#/components/platform/model3d-viewer.vue';

const props = defineProps<{
  assetId: string;
  format: string;
  name: string;
}>();

const failed = ref(false);
const loading = ref(false);
const url = ref('');
let requestVersion = 0;

watch(
  () => props.assetId,
  async (assetId) => {
    const version = ++requestVersion;
    failed.value = false;
    loading.value = true;
    url.value = '';
    try {
      const preview = await getAssetPreviewApi(assetId);
      if (preview.mode !== 'url') throw new Error('三维资产没有预览地址');
      if (version === requestVersion) url.value = preview.url;
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
  <Model3dViewer v-if="url" :format="format" :name="name" :url="url" />
  <div v-else class="asset-model-preview__state">
    <IconifyIcon
      :class="{ 'is-loading': loading }"
      :icon="failed ? 'lucide:box' : 'lucide:loader-circle'"
    />
    {{ failed ? '暂时无法读取三维模型' : '正在读取三维模型' }}
  </div>
</template>

<style scoped>
.asset-model-preview__state {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 460px;
  color: #788590;
}

.is-loading {
  animation: asset-model-preview-spin 0.9s linear infinite;
}

@keyframes asset-model-preview-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
