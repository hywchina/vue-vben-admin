<script lang="ts" setup>
import type { CapabilityField } from '#/modules/platform/types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Input, InputNumber, Popover, Switch, Textarea } from 'ant-design-vue';

const props = defineProps<{
  field: CapabilityField;
  value: unknown;
}>();

const emit = defineEmits<{
  change: [value: unknown];
}>();

const isSeedField = computed(() =>
  `${props.field.key}${props.field.label}`.toLowerCase().match(/seed|种子/),
);

const displayValue = computed(() => {
  const value = props.value;
  if (props.field.type === 'boolean') return value ? '开启' : '关闭';
  const option = props.field.options.find((item) => item.value === value);
  if (option) return option.label;
  if (value === undefined || value === null || value === '') return '设置';
  return String(value);
});

function optionRatio(label: string) {
  const match = label.match(/(\d+)\s*[:：]\s*(\d+)/);
  if (!match) return undefined;
  return `${match[1]} / ${match[2]}`;
}

function randomizeSeed() {
  const minimum = Math.max(0, props.field.min ?? 0);
  const maximum = Math.min(
    Number.MAX_SAFE_INTEGER,
    props.field.max ?? 9_007_199_254_740_991,
  );
  emit('change', Math.floor(minimum + Math.random() * (maximum - minimum)));
}
</script>

<template>
  <Popover
    overlay-class-name="design-quick-popover"
    placement="top"
    trigger="click"
  >
    <template #content>
      <section
        class="quick-field-panel"
        :class="{
          'quick-field-panel--compact': ['number', 'boolean'].includes(
            field.type,
          ),
        }"
        :data-quick-field-key="field.key"
      >
        <header>
          <strong>{{ field.label }}</strong>
          <small v-if="field.help">{{ field.help }}</small>
        </header>

        <div v-if="field.type === 'select'" class="quick-option-grid">
          <button
            v-for="option in field.options"
            :key="String(option.value)"
            :class="{ active: option.value === value }"
            type="button"
            @click="emit('change', option.value)"
          >
            <i
              v-if="optionRatio(option.label)"
              :style="{ aspectRatio: optionRatio(option.label) }"
            ></i>
            <IconifyIcon v-else icon="lucide:circle-dot" />
            <span>{{ option.label }}</span>
          </button>
        </div>

        <div v-else-if="field.type === 'number'" class="quick-number-field">
          <InputNumber
            :max="field.max"
            :min="field.min"
            :step="field.step"
            :value="typeof value === 'number' ? value : undefined"
            @update:value="emit('change', $event ?? field.defaultValue)"
          />
          <button v-if="isSeedField" type="button" @click="randomizeSeed">
            <IconifyIcon icon="lucide:dices" />
            随机
          </button>
        </div>

        <div v-else-if="field.type === 'boolean'" class="quick-switch-field">
          <span>{{ value ? '已开启' : '已关闭' }}</span>
          <Switch
            :checked="value === true"
            @update:checked="emit('change', $event)"
          />
        </div>

        <Textarea
          v-else-if="['textarea', 'json'].includes(field.type)"
          :rows="5"
          :maxlength="field.maxLength"
          :value="
            typeof value === 'string'
              ? value
              : JSON.stringify(value ?? null, null, 2)
          "
          @update:value="emit('change', $event)"
        />
        <Input
          v-else
          :maxlength="field.maxLength"
          :placeholder="field.placeholder"
          :value="typeof value === 'string' ? value : String(value ?? '')"
          @update:value="emit('change', $event)"
        />
      </section>
    </template>

    <button
      class="quick-field-trigger"
      :data-param-key="field.key"
      type="button"
    >
      <IconifyIcon
        :icon="
          field.type === 'select'
            ? 'lucide:list-filter'
            : field.type === 'boolean'
              ? 'lucide:toggle-left'
              : field.type === 'number'
                ? 'lucide:sliders-horizontal'
                : 'lucide:type'
        "
      />
      <span>{{ field.label }}</span>
      <strong>{{ displayValue }}</strong>
      <IconifyIcon icon="lucide:chevron-down" />
    </button>
  </Popover>
</template>

<style scoped>
.quick-field-trigger {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 5px;
  align-items: center;
  min-height: 32px;
  padding: 4px 7px;
  font-size: 14px;
  color: var(--rail-theme-text, #262a2f);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 7px;
}

.quick-field-trigger:hover {
  color: var(--rail-theme-accent, #bd1934);
  background: var(--rail-theme-surface, #fff1f3);
}

.quick-field-trigger strong {
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 650;
  color: var(--rail-theme-text, #111418);
  white-space: nowrap;
}

:global(.design-quick-popover .ant-popover-inner) {
  padding: 0;
  border: 1px solid var(--rail-theme-border, #e4e6e8);
  border-radius: 13px;
  box-shadow: 0 14px 38px rgb(29 38 44 / 14%);
}

:global(.design-quick-popover .ant-popover-arrow::before) {
  background: var(--rail-theme-surface, #fff);
}

.quick-field-panel {
  width: min(280px, 76vw);
  padding: 14px;
}

.quick-field-panel--compact {
  width: min(220px, 76vw);
}

.quick-field-panel header {
  display: grid;
  gap: 3px;
  margin-bottom: 12px;
}

.quick-field-panel header strong {
  font-size: 14px;
}

.quick-field-panel header small {
  max-width: 330px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--rail-theme-secondary, #7a858c);
}

.quick-option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(64px, 1fr));
  gap: 8px;
  max-height: min(360px, 45vh);
  overflow-y: auto;
}

.quick-option-grid button {
  display: grid;
  gap: 6px;
  place-items: center;
  min-height: 64px;
  padding: 8px 5px;
  font-size: 12px;
  color: var(--rail-theme-text, #30363b);
  cursor: pointer;
  background: var(--rail-theme-surface, #f7f7f8);
  border: 1px solid transparent;
  border-radius: 10px;
}

.quick-option-grid button:hover,
.quick-option-grid button.active {
  color: var(--rail-theme-accent, #bd1934);
  background: var(--rail-theme-surface, #fff1f3);
  border-color: #e8a3af;
}

.quick-option-grid i {
  display: block;
  width: 17px;
  min-height: 8px;
  max-height: 19px;
  border: 1.5px solid currentcolor;
  border-radius: 2px;
}

.quick-number-field,
.quick-switch-field {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.quick-number-field :deep(.ant-input-number) {
  flex: 1;
}

.quick-number-field button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  min-height: 32px;
  padding: 4px 10px;
  color: var(--rail-theme-accent, #bd1934);
  cursor: pointer;
  background: var(--rail-theme-surface, #fff1f3);
  border: 1px solid var(--rail-theme-border, #d8dde3);
  border-radius: 7px;
}

.quick-switch-field span {
  font-size: 13px;
  color: var(--rail-theme-secondary, #606b72);
}

.quick-field-panel :deep(.ant-switch-checked) {
  background: #c51f3a;
}
</style>
