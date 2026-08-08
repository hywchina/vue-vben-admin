<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
  status: string;
}>();

const labelMap: Record<string, string> = {
  available: '可使用',
  cancelled: '已取消',
  cancelling: '取消中',
  disabled: '已停用',
  enabled: '已启用',
  failed: '失败',
  planned: '待接入',
  queued: '排队中',
  running: '运行中',
  succeeded: '已完成',
  success: '成功',
  testing: '接入测试',
};

const label = computed(() => labelMap[props.status] ?? props.status);
</script>

<template>
  <span :class="`status-pill status-pill--${status}`">{{ label }}</span>
</template>
