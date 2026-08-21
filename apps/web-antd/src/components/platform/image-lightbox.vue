<script lang="ts" setup>
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Modal, Tooltip } from 'ant-design-vue';

const props = defineProps<{
  nextEnabled?: boolean;
  open: boolean;
  previousEnabled?: boolean;
  title?: string;
  url?: string;
}>();

const emit = defineEmits<{
  next: [];
  previous: [];
  'update:open': [open: boolean];
}>();
const viewportRef = ref<HTMLElement>();
const imageRef = ref<HTMLImageElement>();
const zoom = ref(1);
const pan = reactive({ x: 0, y: 0 });
const dragging = ref(false);
let dragStart = { panX: 0, panY: 0, pointerX: 0, pointerY: 0 };

function clampPan() {
  const viewport = viewportRef.value;
  const image = imageRef.value;
  if (!viewport || !image) return;
  const maxX = Math.max(
    0,
    (image.clientWidth * zoom.value - viewport.clientWidth) / 2,
  );
  const maxY = Math.max(
    0,
    (image.clientHeight * zoom.value - viewport.clientHeight) / 2,
  );
  pan.x = Math.min(maxX, Math.max(-maxX, pan.x));
  pan.y = Math.min(maxY, Math.max(-maxY, pan.y));
}

function resetView() {
  zoom.value = 1;
  pan.x = 0;
  pan.y = 0;
  dragging.value = false;
}

function setZoom(value: number) {
  zoom.value = Math.min(8, Math.max(0.1, value));
  if (zoom.value <= 1) {
    pan.x = 0;
    pan.y = 0;
  } else {
    void nextTick(clampPan);
  }
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();
  setZoom(zoom.value * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0 || zoom.value <= 1) return;
  event.preventDefault();
  dragging.value = true;
  dragStart = {
    panX: pan.x,
    panY: pan.y,
    pointerX: event.clientX,
    pointerY: event.clientY,
  };
  viewportRef.value?.setPointerCapture(event.pointerId);
}

function handlePointerMove(event: PointerEvent) {
  if (!dragging.value) return;
  pan.x = dragStart.panX + event.clientX - dragStart.pointerX;
  pan.y = dragStart.panY + event.clientY - dragStart.pointerY;
  clampPan();
}

function handlePointerUp(event: PointerEvent) {
  if (!dragging.value) return;
  dragging.value = false;
  if (viewportRef.value?.hasPointerCapture(event.pointerId)) {
    viewportRef.value.releasePointerCapture(event.pointerId);
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === 'ArrowLeft' && props.previousEnabled) {
    event.preventDefault();
    emit('previous');
  }
  if (event.key === 'ArrowRight' && props.nextEnabled) {
    event.preventDefault();
    emit('next');
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) resetView();
  },
);

watch(() => props.url, resetView);
onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown));
</script>

<template>
  <Modal
    :footer="null"
    :open="open"
    :title="title || '图片预览'"
    :z-index="2200"
    width="min(1180px, 94vw)"
    wrap-class-name="platform-image-lightbox"
    @cancel="emit('update:open', false)"
  >
    <div class="lightbox-toolbar">
      <Button aria-label="缩小图片" size="small" @click="setZoom(zoom / 1.2)">
        <IconifyIcon icon="lucide:zoom-out" />
      </Button>
      <span>{{ Math.round(zoom * 100) }}%</span>
      <Button aria-label="放大图片" size="small" @click="setZoom(zoom * 1.2)">
        <IconifyIcon icon="lucide:zoom-in" />
      </Button>
      <Button size="small" @click="resetView">原始比例</Button>
      <Tooltip title="放大后按住图片拖拽查看细节">
        <span
          aria-label="拖拽查看图片"
          :class="{ active: zoom > 1 }"
          class="lightbox-pan-tool"
          role="img"
        >
          <IconifyIcon icon="lucide:hand" />
        </span>
      </Tooltip>
      <span v-if="previousEnabled !== undefined" class="lightbox-page-hint">
        使用左右方向键切换图片
      </span>
    </div>
    <div
      ref="viewportRef"
      :class="{ 'is-dragging': dragging, 'is-pannable': zoom > 1 }"
      class="lightbox-viewport"
      @pointercancel="handlePointerUp"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @wheel="handleWheel"
    >
      <img
        v-if="url"
        ref="imageRef"
        :alt="title || '图片预览'"
        :draggable="false"
        :src="url"
        :style="{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }"
        @load="clampPan"
      />
      <Button
        v-if="previousEnabled !== undefined"
        aria-label="查看上一张图片"
        class="lightbox-navigation lightbox-navigation--previous"
        :disabled="!previousEnabled"
        shape="circle"
        @click="emit('previous')"
      >
        <IconifyIcon icon="lucide:chevron-left" />
      </Button>
      <Button
        v-if="nextEnabled !== undefined"
        aria-label="查看下一张图片"
        class="lightbox-navigation lightbox-navigation--next"
        :disabled="!nextEnabled"
        shape="circle"
        @click="emit('next')"
      >
        <IconifyIcon icon="lucide:chevron-right" />
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.lightbox-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-bottom: 12px;
}

.lightbox-toolbar span {
  min-width: 54px;
  font-size: 12px;
  text-align: center;
}

.lightbox-page-hint {
  width: auto !important;
  margin-left: auto;
  color: #7f8990;
}

.lightbox-pan-tool {
  display: inline-grid;
  place-items: center;
  width: 28px;
  height: 24px;
  margin-left: 2px;
  color: #8a949c;
  cursor: help;
  background: #f3f4f5;
  border: 1px solid #d9dfe3;
  border-radius: 6px;
}

.lightbox-pan-tool.active {
  color: #fff;
  background: var(--rail-red, #c71f3a);
  border-color: var(--rail-red, #c71f3a);
}

.lightbox-viewport {
  position: relative;
  display: grid;
  place-items: center;
  height: min(72vh, 780px);
  overflow: hidden;
  touch-action: none;
  cursor: default;
  user-select: none;
  background:
    linear-gradient(45deg, #20262b 25%, transparent 25%) 0 0 / 20px 20px,
    linear-gradient(45deg, transparent 75%, #20262b 75%) 0 0 / 20px 20px,
    linear-gradient(45deg, transparent 75%, #20262b 75%) 10px -10px / 20px 20px,
    linear-gradient(45deg, #20262b 25%, #171c20 25%) 10px 10px / 20px 20px;
  border-radius: 12px;
}

.lightbox-navigation {
  position: absolute;
  top: 50%;
  z-index: 2;
  color: #fff;
  background: rgb(15 21 25 / 72%);
  border-color: rgb(255 255 255 / 28%);
  transform: translateY(-50%);
}

.lightbox-navigation--previous {
  left: 16px;
}

.lightbox-navigation--next {
  right: 16px;
}

.lightbox-viewport.is-pannable {
  cursor: grab;
}

.lightbox-viewport.is-dragging {
  cursor: grabbing;
}

.lightbox-viewport img {
  max-width: 100%;
  max-height: 100%;
  pointer-events: none;
  user-select: none;
  object-fit: contain;
  transform-origin: center;
  transition: transform 120ms ease;
}

.lightbox-viewport.is-dragging img {
  transition: none;
}
</style>
