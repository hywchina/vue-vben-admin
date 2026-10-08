<script setup lang="ts">
import type { LoraField } from '#/modules/platform/lora-training';

import { IconifyIcon } from '@vben/icons';

import { Tooltip } from 'ant-design-vue';

import { loraDemoDisplay } from '#/modules/platform/lora-training';
import { platformUiIcons } from '#/modules/platform/ui-icons';

defineProps<{ field: LoraField }>();
</script>

<template>
  <span class="lora-label">
    <span>{{ field.label }}</span>
    <Tooltip :trigger="['hover', 'focus', 'click']">
      <template #title>
        <div class="lora-help">
          <strong>{{ field.label }}</strong>
          <code>{{ field.path }}</code>
          <p>{{ field.help }}</p>
          <span>demo 默认值：{{ loraDemoDisplay(field) }}</span>
        </div>
      </template>
      <button type="button" :aria-label="`${field.label}参数说明`">
        <IconifyIcon :icon="platformUiIcons.circleHelp" />
      </button>
    </Tooltip>
  </span>
</template>

<style scoped>
.lora-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  font-weight: 600;
}

.lora-label button {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: var(--rail-theme-secondary, #758089);
  cursor: help;
  background: transparent;
  border: 0;
  border-radius: 50%;
}

.lora-label button:hover,
.lora-label button:focus-visible {
  color: var(--rail-red);
  background: var(--rail-theme-surface, #f2f4f7);
}

.lora-help {
  max-width: 300px;
}

.lora-help code {
  display: block;
  margin: 6px 0;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.lora-help p {
  margin: 8px 0;
}
</style>
