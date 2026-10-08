<script lang="ts" setup>
import { RefreshCw } from '@vben-core/icons';

const emit = defineEmits(['refresh']);

const handleRefresh = () => {
  emit('refresh');
};
</script>

<template>
  <div
    class="flex-center h-full cursor-pointer border-l border-border px-2 text-lg font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
    @click="handleRefresh"
  >
    <RefreshCw class="size-4" />
  </div>
</template>
