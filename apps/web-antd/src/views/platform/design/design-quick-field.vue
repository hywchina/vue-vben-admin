<script lang="ts" setup>
import type { CapabilityField } from '#/modules/platform/types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Input, InputNumber, Popover, Switch, Textarea } from 'ant-design-vue';

import { platformUiIcons } from '#/modules/platform/ui-icons';

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
  if (props.field.type === 'boolean') return value === true ? '开启' : '关闭';
  const option = props.field.options.find((item) => item.value === value);
  if (option) return option.label;
  if (value === undefined || value === null || value === '') return '设置';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
});

// Long model filenames need readable rows, not narrow ratio-style tiles.
const longOptions = computed(() =>
  props.field.options.some((option) => option.label.length > 18),
);

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

        <div
          v-if="field.type === 'select'"
          class="quick-option-grid"
          :class="{ 'quick-option-grid--list': longOptions }"
        >
          <button
            v-for="option in field.options"
            :key="String(option.value)"
            :class="{ active: option.value === value }"
            :aria-pressed="option.value === value"
            :title="option.label"
            type="button"
            @click="emit('change', option.value)"
          >
            <i
              v-if="optionRatio(option.label)"
              :style="{ aspectRatio: optionRatio(option.label) }"
            ></i>
            <IconifyIcon v-else :icon="platformUiIcons.circleDot" />
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
            <IconifyIcon :icon="platformUiIcons.dices" />
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
      :title="`${field.label}：${displayValue}`"
      type="button"
    >
      <IconifyIcon
        :icon="
          field.type === 'select'
            ? platformUiIcons.listFilter
            : field.type === 'boolean'
              ? platformUiIcons.toggleLeft
              : field.type === 'number'
                ? platformUiIcons.slidersHorizontal
                : platformUiIcons.type
        "
      />
      <span class="quick-field-label">{{ field.label }}</span>
      <strong>{{ displayValue }}</strong>
      <IconifyIcon :icon="platformUiIcons.chevronDown" />
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
  font-family: inherit;
  font-size: var(--design-parameter-font-size, 14px);
  font-weight: 400;
  line-height: 22px;
  color: var(--rail-theme-text, #262a2f);
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 7px;
}

.quick-field-label {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-field-trigger:hover {
  color: var(--rail-theme-accent, #bd1934);
  background: var(--rail-theme-surface, #fff1f3);
}

.quick-field-trigger strong {
  max-width: 112px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
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
  font-family: inherit;
  overflow-wrap: anywhere;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  max-height: min(360px, 45vh);
  overflow: hidden auto;
}

.quick-option-grid button {
  display: grid;
  gap: 6px;
  place-items: center;
  min-width: 0;
  min-height: 64px;
  padding: 8px 5px;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  color: var(--rail-theme-text, #30363b);
  cursor: pointer;
  background: var(--rail-theme-surface, #f7f7f8);
  border: 1px solid transparent;
  border-radius: 10px;
}

.quick-option-grid button span {
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}

.quick-option-grid--list {
  grid-template-columns: minmax(0, 1fr);
}

.quick-option-grid--list button {
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px;
  justify-items: start;
  min-height: 42px;
  padding: 10px;
  font-size: 13px;
  text-align: left;
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
  min-width: 0;
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
