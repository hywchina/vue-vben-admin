<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { platformSemanticIcons } from '#/modules/platform/semantic-icons';

const props = defineProps<{ alt: string; src?: string }>();
const failed = ref(false);
const showImage = computed(() => Boolean(props.src) && !failed.value);
watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <span
    class="design-history-preview"
    :class="{ 'design-history-preview--placeholder': !showImage }"
    :role="showImage ? undefined : 'img'"
    :aria-label="
      showImage ? undefined : failed ? '图片预览暂不可用' : '暂无生成图片'
    "
  >
    <img v-if="showImage" :src="src" :alt="alt" @error="failed = true" />
    <IconifyIcon
      v-else
      :icon="platformSemanticIcons.newDesign"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.design-history-preview {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--rail-theme-surface, #fff);
  border-radius: inherit;
}

.design-history-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.design-history-preview--placeholder {
  color: var(--rail-theme-accent, #c51f3a);
  background: linear-gradient(135deg, #fff7f2, #fcecf1);
  border: 1px solid rgb(197 31 58 / 7%);
}

.design-history-preview--placeholder::before {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 28px;
  height: 32px;
  content: '';
  background: rgb(255 255 255 / 85%);
  border: 1px solid rgb(197 31 58 / 15%);
  border-radius: 6px;
  box-shadow: 0 3px 8px rgb(197 31 58 / 5%);
  transform: translate(-50%, -50%) rotate(-10deg);
}

.design-history-preview--placeholder > svg {
  position: relative;
  width: 21px;
  height: 21px;
}
</style>
