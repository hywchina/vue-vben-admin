<script setup lang="ts">
import { computed } from 'vue';

import { Textarea } from 'ant-design-vue';

import { regionPromptGroups } from './region-annotation';

const props = defineProps<{ marks: string; value: unknown }>();
const emit = defineEmits<{ change: [value: Record<string, string>] }>();
const groups = computed(() => regionPromptGroups(props.marks));
const values = computed<Record<string, string>>(() => {
  try {
    const value =
      typeof props.value === 'string' ? JSON.parse(props.value) : props.value;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
});
function update(key: string, text: string) {
  emit('change', { ...values.value, [key]: text });
}
</script>

<template>
  <div class="region-prompts" data-testid="region-prompts">
    <small>
      每区域修改要求（选填），留空沿用主提示词。同一编号或颜色共用一项要求。
    </small>
    <small v-if="!groups.length">请先框选或涂满需要修改的完整范围。</small>
    <label v-for="group in groups" :key="group.key">
      <span>{{ group.label }}</span>
      <Textarea
        :value="typeof values[group.key] === 'string' ? values[group.key] : ''"
        :aria-label="`${group.label}修改要求`"
        :maxlength="2000"
        :auto-size="{ minRows: 1, maxRows: 4 }"
        placeholder="例如：替换为深蓝色双人座椅；留空沿用主提示词"
        @update:value="update(group.key, $event)"
      />
    </label>
  </div>
</template>

<style scoped>
.region-prompts {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
}

.region-prompts small {
  color: var(--ant-color-text-secondary, #777);
}

.region-prompts label {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.region-prompts label > span {
  padding-top: 5px;
}
</style>
