<script lang="ts" setup>
import { computed, ref } from 'vue';

const props = withDefaults(
  defineProps<{
    afterLabel?: string;
    afterSrc: string;
    beforeLabel?: string;
    beforeSrc: string;
  }>(),
  {
    afterLabel: '生成结果',
    beforeLabel: '原始输入',
  },
);

const position = ref(50);
const clipStyle = computed(() => ({
  clipPath: `inset(0 ${100 - position.value}% 0 0)`,
}));
</script>

<template>
  <div class="image-comparison" data-image-comparison>
    <img :alt="props.afterLabel" :src="props.afterSrc" />
    <img
      :alt="props.beforeLabel"
      :src="props.beforeSrc"
      class="image-comparison__before"
      :style="clipStyle"
    />
    <span class="image-comparison__label image-comparison__label--before">
      {{ props.beforeLabel }}
    </span>
    <span class="image-comparison__label image-comparison__label--after">
      {{ props.afterLabel }}
    </span>
    <div
      aria-hidden="true"
      class="image-comparison__divider"
      :style="{ left: `${position}%` }"
    >
      <span>
        <i></i>
        <i></i>
      </span>
    </div>
    <input
      v-model.number="position"
      aria-label="拖动查看图片修改前后对比"
      max="100"
      min="0"
      type="range"
    />
  </div>
</template>

<style scoped>
.image-comparison {
  position: relative;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  overflow: hidden;
  line-height: 0;
  user-select: none;
  background: #1d272d;
  border-radius: 14px;
  box-shadow: 0 10px 34px rgb(24 34 40 / 14%);
}

.image-comparison img {
  display: block;
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: min(68vh, 720px);
  pointer-events: none;
  object-fit: contain;
}

.image-comparison__before {
  position: absolute;
  inset: 0;
  width: 100% !important;
  height: 100% !important;
}

.image-comparison input {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: ew-resize;
  opacity: 0;
}

.image-comparison__divider {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  width: 2px;
  pointer-events: none;
  background: #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 20%);
  transform: translateX(-1px);
}

.image-comparison__divider span {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  background: rgb(20 27 31 / 82%);
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 5px 18px rgb(0 0 0 / 28%);
  transform: translate(-50%, -50%);
}

.image-comparison__divider i {
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
}

.image-comparison__divider i:first-child {
  border-right: 6px solid #fff;
}

.image-comparison__divider i:last-child {
  border-left: 6px solid #fff;
}

.image-comparison__label {
  position: absolute;
  top: 12px;
  z-index: 2;
  padding: 5px 9px;
  font-size: 12px;
  line-height: 1;
  color: #fff;
  background: rgb(14 20 24 / 72%);
  border: 1px solid rgb(255 255 255 / 20%);
  border-radius: 999px;
  backdrop-filter: blur(8px);
}

.image-comparison__label--before {
  left: 12px;
}

.image-comparison__label--after {
  right: 12px;
}
</style>
