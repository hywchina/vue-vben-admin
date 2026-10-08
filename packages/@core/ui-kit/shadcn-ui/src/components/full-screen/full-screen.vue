<script lang="ts" setup>
import { Maximize2, Minimize2 } from '@vben-core/icons';

import { useFullscreen } from '@vueuse/core';

import { VbenIconButton } from '../button';

defineOptions({ name: 'FullScreen' });

withDefaults(
  defineProps<{
    tooltip?: string;
  }>(),
  {
    tooltip: '',
  },
);

const { isFullscreen, toggle } = useFullscreen();

// 重新检查全屏状态
isFullscreen.value = !!(
  document.fullscreenElement ||
  // @ts-expect-error - vendor fullscreen APIs are not included in the standard DOM typings
  document.webkitFullscreenElement ||
  // @ts-expect-error - vendor fullscreen APIs are not included in the standard DOM typings
  document.mozFullScreenElement ||
  // @ts-expect-error - vendor fullscreen APIs are not included in the standard DOM typings
  document.msFullscreenElement
);
</script>
<template>
  <VbenIconButton
    :tooltip="tooltip || undefined"
    class="hover:animate-[shrink_0.3s_ease-in-out]"
    @click="toggle"
  >
    <Minimize2 v-if="isFullscreen" class="text-foreground size-4" />
    <Maximize2 v-else class="text-foreground size-4" />
  </VbenIconButton>
</template>
