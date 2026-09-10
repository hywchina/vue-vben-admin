<script setup lang="ts">
import { ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { getAssetPreviewApi } from '#/api/platform/assets';
const props = defineProps<{ assetId?: string; name: string; type?: string }>();
const url = ref('');
let generation = 0;
watch(
  () => props.assetId,
  async (id) => {
    const current = ++generation;
    url.value = '';
    if (!id) return;
    try {
      const result = await getAssetPreviewApi(id);
      if (current === generation && result.mode === 'url')
        url.value = result.url;
    } catch {
      /* The file label remains usable when a thumbnail cannot load. */
    }
  },
  { immediate: true },
);
</script>
<template>
  <div class="wb-thumbnail">
    <img v-if="url" :src="url" :alt="name" loading="lazy" @error="url = ''" />
    <IconifyIcon
      v-else
      :icon="
        type === 'model3d'
          ? 'lucide:box'
          : type === 'image'
            ? 'lucide:image'
            : 'lucide:file-text'
      "
    />
  </div>
</template>
<style scoped>
.wb-thumbnail {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 64px;
  overflow: hidden;
  color: var(--rail-theme-muted, #a4adb7);
  background: var(--rail-theme-surface, #f2f4f6);
}

.wb-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wb-thumbnail :deep(svg) {
  width: 30px;
  height: 30px;
}
</style>
