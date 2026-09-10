<script setup lang="ts">
import type { CapabilityField } from '#/modules/platform/types';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { InputNumber, Popover } from 'ant-design-vue';

import {
  imageRatios,
  linkedSize,
  sizeRatio,
  validDimension,
} from '#/modules/platform/image-dimensions';
const props = defineProps<{
  height: number;
  heightField: CapabilityField;
  width: number;
  widthField: CapabilityField;
}>();
const emit = defineEmits<{
  change: [size: { height: number; width: number }];
}>();
const locked = ref(true);
const automatic = ref(false);
const notice = ref('');
const draftWidth = ref<number | undefined>(props.width);
const draftHeight = ref<number | undefined>(props.height);
const ratio = ref(sizeRatio(props.width, props.height));
watch(
  () => [props.width, props.height],
  () => {
    if (
      props.width !== Number(props.widthField.defaultValue) ||
      props.height !== Number(props.heightField.defaultValue)
    )
      automatic.value = false;
    draftWidth.value = props.width;
    draftHeight.value = props.height;
    ratio.value = sizeRatio(props.width, props.height);
  },
);
const caption = computed(() => {
  if (automatic.value) return '自动';
  return imageRatios.includes(ratio.value) ? ratio.value : '自定义';
});
function choose(value: string) {
  notice.value = '';
  try {
    if (value === 'auto') {
      const width = Number(props.widthField.defaultValue);
      const height = Number(props.heightField.defaultValue);
      if (
        !validDimension(width, props.widthField) ||
        !validDimension(height, props.heightField)
      )
        throw new Error('当前工作流未提供有效默认尺寸');
      automatic.value = true;
      locked.value = true;
      emit('change', { width, height });
      return;
    }
    const size = linkedSize(
      value,
      props.width,
      'width',
      props.widthField,
      props.heightField,
    );
    automatic.value = false;
    locked.value = true;
    ratio.value = value;
    emit('change', size);
    if (size.width !== props.width)
      notice.value = `已按工作流范围和步长调整为 ${size.width}×${size.height}`;
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '尺寸不可用';
  }
}
function commit(side: 'height' | 'width') {
  notice.value = '';
  automatic.value = false;
  try {
    const value = Number(
      side === 'width' ? draftWidth.value : draftHeight.value,
    );
    if (locked.value) {
      const size = linkedSize(
        ratio.value,
        value,
        side,
        props.widthField,
        props.heightField,
      );
      draftWidth.value = size.width;
      draftHeight.value = size.height;
      emit('change', size);
      if (size[side] !== value)
        notice.value = `已按工作流范围和步长调整为 ${size.width}×${size.height}`;
    } else {
      const size = {
        width: Number(draftWidth.value),
        height: Number(draftHeight.value),
      };
      if (
        !validDimension(size.width, props.widthField) ||
        !validDimension(size.height, props.heightField)
      )
        throw new Error('尺寸须符合当前工作流的范围和步长');
      emit('change', size);
    }
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '尺寸不可用';
  }
}
</script>
<template>
  <Popover
    trigger="click"
    placement="top"
    overlay-class-name="image-size-popover"
  >
    <template #content>
      <section class="image-size-panel" aria-label="比例与尺寸">
        <strong>画面比例</strong>
        <div class="ratio-grid">
          <button
            type="button"
            :class="{ selected: automatic }"
            @click="choose('auto')"
          >
            <span class="ratio-outline auto"></span>
            自动
          </button>
          <button
            v-for="item in imageRatios"
            :key="item"
            type="button"
            :aria-label="`比例 ${item}`"
            :aria-pressed="!automatic && ratio === item"
            :class="{ selected: !automatic && ratio === item }"
            @click="choose(item)"
          >
            <span class="ratio-icon">
              <span
                class="ratio-outline"
                :style="{
                  aspectRatio: item.replace(':', '/'),
                  width:
                    Number(item.split(':')[0]) >= Number(item.split(':')[1])
                      ? '30px'
                      : 'auto',
                  height:
                    Number(item.split(':')[0]) < Number(item.split(':')[1])
                      ? '30px'
                      : 'auto',
                }"
              ></span>
            </span>
            {{ item }}
          </button>
        </div>
        <div class="size-fields">
          <label>
            宽度
            <InputNumber
              v-model:value="draftWidth"
              aria-label="图片宽度"
              :min="widthField.min"
              :max="widthField.max"
              :step="widthField.step"
              :precision="0"
              addon-after="px"
              @blur="commit('width')"
              @press-enter="commit('width')"
            />
          </label>
          <button
            type="button"
            class="size-lock"
            :aria-label="locked ? '解锁比例' : '锁定比例'"
            :aria-pressed="locked"
            @click="locked = !locked"
          >
            <IconifyIcon
              :icon="
                locked ? 'lucide:lock-keyhole' : 'lucide:lock-keyhole-open'
              "
            />
          </button>
          <label>
            高度
            <InputNumber
              v-model:value="draftHeight"
              aria-label="图片高度"
              :min="heightField.min"
              :max="heightField.max"
              :step="heightField.step"
              :precision="0"
              addon-after="px"
              @blur="commit('height')"
              @press-enter="commit('height')"
            />
          </label>
        </div>
        <p v-if="notice" role="status">{{ notice }}</p>
      </section>
    </template>
    <button class="size-trigger" type="button" aria-label="设置图片比例与尺寸">
      <IconifyIcon icon="lucide:rectangle-horizontal" />
      比例 {{ caption }}
      <span>{{ width }}×{{ height }}</span>
      <IconifyIcon icon="lucide:chevron-down" />
    </button>
  </Popover>
</template>
<style scoped>
.image-size-panel {
  width: min(390px, calc(100vw - 88px));
  padding: 4px;
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 14px 0;
}

.ratio-grid button {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 76px;
  color: var(--rail-theme-text, #4b5563);
  cursor: pointer;
  background: var(--rail-theme-surface, #f7f8fa);
  border: 1px solid transparent;
  border-radius: 9px;
}

.ratio-grid button.selected {
  color: var(--rail-theme-accent, #bd1934);
  background: var(--rail-theme-surface, #fff1f3);
  border-color: var(--rail-theme-accent, #bd1934);
}

.ratio-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 30px;
}

.ratio-outline {
  display: block;
  border: 1.5px solid currentcolor;
  border-radius: 2px;
}

.ratio-outline.auto {
  width: 26px;
  height: 26px;
  border-style: dashed;
}

.size-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px minmax(0, 1fr);
  gap: 10px;
  align-items: end;
  padding: 14px 0;
  border-top: 1px solid var(--rail-theme-border, #e5e7eb);
}

.size-fields label {
  display: grid;
  gap: 6px;
  min-width: 0;
  color: var(--rail-theme-secondary, #6b7280);
}

.size-fields :deep(.ant-input-number-group-wrapper) {
  width: 100%;
}

.size-lock {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  color: var(--rail-theme-accent, #bd1934);
  cursor: pointer;
  background: var(--rail-theme-surface, #fff1f3);
  border: 0;
  border-radius: 6px;
}

.image-size-panel p {
  margin-top: 8px;
  color: var(--rail-theme-accent, #bd1934);
}

.size-trigger {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 8px;
  color: var(--rail-theme-text, #30363b);
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.size-trigger span {
  color: var(--rail-theme-text, #475569);
}
</style>
