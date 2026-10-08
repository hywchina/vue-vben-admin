<script lang="ts" setup>
import { IconifyIcon } from '@vben/icons';

import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
defineProps<{ size?: number }>();
</script>

<template>
  <IconifyIcon
    :icon="platformSemanticIcons.mask"
    aria-hidden="true"
    fill="none"
    :height="size ?? 16"
    :width="size ?? 16"
  />
</template>
