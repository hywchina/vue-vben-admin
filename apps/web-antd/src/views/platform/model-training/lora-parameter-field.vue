<script setup lang="ts">
import type { PropType } from 'vue';

import type { LoraField } from '#/modules/platform/lora-training';

import { Input, InputNumber, Select, Switch, Textarea } from 'ant-design-vue';

import LoraParameterLabel from './lora-parameter-label.vue';

defineProps({
  field: { type: Object as PropType<LoraField>, required: true },
  loading: { type: Boolean, default: false },
  options: {
    type: Array as PropType<Array<{ label: string; value: string }>>,
    default: () => [],
  },
  // String must precede Boolean: Vue otherwise casts empty strings to true.
  value: { type: [String, Number, Boolean], required: true },
});
const emit = defineEmits<{ change: [value: unknown] }>();
const numberRanges = {
  learningRate: { min: 0.000001, max: 0.01, step: 0.00001 },
  repeats: { min: 1, max: 100, step: 1 },
  steps: { min: 20, max: 10_000, step: 1 },
};
const modeLabels = { automatic: '自动', editable: '可编辑', fixed: '固定' };
</script>

<template>
  <div class="lora-field" :data-lora-path="field.path">
    <div class="lora-field-heading">
      <LoraParameterLabel :field="field" />
      <small>{{ modeLabels[field.mode] }}</small>
    </div>
    <Select
      v-if="field.binding === 'baseModel'"
      :value="String(value)"
      :options="options"
      :loading="loading"
      :aria-label="field.label"
      @update:value="emit('change', $event)"
    />
    <InputNumber
      v-else-if="
        field.binding === 'steps' ||
        field.binding === 'repeats' ||
        field.binding === 'learningRate'
      "
      :value="Number(value)"
      v-bind="numberRanges[field.binding]"
      :aria-label="field.label"
      @update:value="emit('change', $event)"
    />
    <Select
      v-else-if="field.binding === 'resolution' || field.binding === 'rank'"
      :value="Number(value)"
      :options="
        (field.binding === 'rank' ? [4, 8, 16, 32, 64] : [512, 768, 1024]).map(
          (item) => ({ label: String(item), value: item }),
        )
      "
      :aria-label="field.label"
      @update:value="emit('change', $event)"
    />
    <Textarea
      v-else-if="field.binding === 'previewPrompt'"
      :value="String(value)"
      :rows="3"
      :maxlength="1000"
      :aria-label="field.label"
      @update:value="emit('change', $event)"
    />
    <Input
      v-else-if="field.binding === 'triggerWord'"
      :value="String(value)"
      :maxlength="64"
      :aria-label="field.label"
      @update:value="emit('change', $event)"
    />
    <Switch
      v-else-if="field.binding === 'disableSampling'"
      :checked="Boolean(value)"
      checked-children="禁用"
      un-checked-children="启用采样"
      :aria-label="field.label"
      @update:checked="emit('change', $event)"
    />
    <div v-else class="lora-readonly">
      {{ value === '' ? '空字符串' : String(value) }}
    </div>
    <small class="lora-path">{{ field.path }}</small>
  </div>
</template>

<style scoped>
.lora-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.lora-field-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.lora-field-heading > small {
  flex-shrink: 0;
  color: var(--rail-theme-secondary, #758089);
}

.lora-field :deep(.ant-input-number),
.lora-field :deep(.ant-select) {
  width: 100%;
}

.lora-field :deep(.ant-switch) {
  justify-self: start;
}

.lora-readonly {
  padding: 8px 12px;
  color: var(--rail-theme-secondary, #66717a);
  overflow-wrap: anywhere;
  background: var(--rail-theme-surface, #f2f4f7);
  border-radius: 8px;
}

.lora-path {
  font-size: 11px;
  color: var(--rail-theme-secondary, #758089);
  overflow-wrap: anywhere;
}
</style>
