<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Modal } from 'ant-design-vue';

const props = defineProps<{
  filename: string;
  open: boolean;
  src: string;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [file: File];
}>();

const outputSize = 512;
const canvasRef = ref<HTMLCanvasElement>();
const image = new Image();
const imageReady = ref(false);
const naturalWidth = ref(0);
const naturalHeight = ref(0);
const rotation = ref(0);
const zoom = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const dragging = ref(false);
let pointerId: null | number = null;
let lastPointerX = 0;
let lastPointerY = 0;
let imageLoadVersion = 0;

const rotatedWidth = computed(() =>
  rotation.value % 180 === 0 ? naturalWidth.value : naturalHeight.value,
);
const rotatedHeight = computed(() =>
  rotation.value % 180 === 0 ? naturalHeight.value : naturalWidth.value,
);
const baseScale = computed(() =>
  Math.max(
    outputSize / Math.max(rotatedWidth.value, 1),
    outputSize / Math.max(rotatedHeight.value, 1),
  ),
);
const actualScale = computed(() => baseScale.value * zoom.value);

function clampOffsets() {
  const renderedWidth = rotatedWidth.value * actualScale.value;
  const renderedHeight = rotatedHeight.value * actualScale.value;
  const maxX = Math.max(0, (renderedWidth - outputSize) / 2);
  const maxY = Math.max(0, (renderedHeight - outputSize) / 2);
  offsetX.value = Math.min(maxX, Math.max(-maxX, offsetX.value));
  offsetY.value = Math.min(maxY, Math.max(-maxY, offsetY.value));
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !imageReady.value) return;
  clampOffsets();
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, outputSize, outputSize);
  context.save();
  context.translate(
    outputSize / 2 + offsetX.value,
    outputSize / 2 + offsetY.value,
  );
  context.rotate((rotation.value * Math.PI) / 180);
  context.scale(actualScale.value, actualScale.value);
  context.drawImage(image, -naturalWidth.value / 2, -naturalHeight.value / 2);
  context.restore();
}

function reset() {
  rotation.value = 0;
  zoom.value = 1;
  offsetX.value = 0;
  offsetY.value = 0;
  draw();
}

function rotate() {
  rotation.value = (rotation.value + 90) % 360;
  offsetX.value = 0;
  offsetY.value = 0;
  void nextTick(draw);
}

function pointerDown(event: PointerEvent) {
  if (!imageReady.value) return;
  pointerId = event.pointerId;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  dragging.value = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function pointerMove(event: PointerEvent) {
  if (!dragging.value || pointerId !== event.pointerId) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const ratio = outputSize / Math.max(bounds.width, 1);
  offsetX.value += (event.clientX - lastPointerX) * ratio;
  offsetY.value += (event.clientY - lastPointerY) * ratio;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  draw();
}

function pointerUp(event: PointerEvent) {
  if (pointerId !== event.pointerId) return;
  dragging.value = false;
  pointerId = null;
}

function confirm() {
  draw();
  canvasRef.value?.toBlob(
    (blob) => {
      if (!blob) return;
      emit(
        'confirm',
        new File([blob], 'avatar-cropped.png', { type: 'image/png' }),
      );
    },
    'image/png',
    0.94,
  );
}

watch(
  () => [props.open, props.src] as const,
  ([open, src]) => {
    if (!open || !src) return;
    imageReady.value = false;
    const version = ++imageLoadVersion;
    image.addEventListener(
      'load',
      () => {
        if (version !== imageLoadVersion) return;
        naturalWidth.value = image.naturalWidth;
        naturalHeight.value = image.naturalHeight;
        imageReady.value = true;
        reset();
      },
      { once: true },
    );
    image.src = src;
  },
  { immediate: true },
);

watch(zoom, draw);
</script>

<template>
  <Modal
    :closable="false"
    :footer="null"
    :keyboard="false"
    :mask-closable="false"
    :open="open"
    centered
    class="avatar-crop-modal"
    width="720px"
  >
    <div class="avatar-cropper">
      <header>
        <strong>裁剪头像</strong>
        <span>{{ filename }}</span>
      </header>
      <div class="avatar-cropper__stage">
        <canvas
          ref="canvasRef"
          :class="{ dragging }"
          :height="outputSize"
          :width="outputSize"
          aria-label="头像方形裁剪区域"
          @pointercancel="pointerUp"
          @pointerdown="pointerDown"
          @pointermove="pointerMove"
          @pointerup="pointerUp"
        ></canvas>
        <span class="avatar-cropper__corner corner-a"></span>
        <span class="avatar-cropper__corner corner-b"></span>
        <span class="avatar-cropper__corner corner-c"></span>
        <span class="avatar-cropper__corner corner-d"></span>
      </div>
      <div class="avatar-cropper__zoom">
        <IconifyIcon icon="lucide:image" />
        <input
          v-model.number="zoom"
          aria-label="裁剪缩放"
          max="3"
          min="1"
          step="0.01"
          type="range"
        />
        <IconifyIcon icon="lucide:zoom-in" />
      </div>
      <footer>
        <button type="button" @click="emit('cancel')">取消</button>
        <button aria-label="重置裁剪" type="button" @click="reset">
          <IconifyIcon icon="lucide:history" />
          <span>重置</span>
        </button>
        <button aria-label="向右旋转" type="button" @click="rotate">
          <IconifyIcon icon="lucide:rotate-cw" />
          <span>旋转</span>
        </button>
        <button class="confirm" type="button" @click="confirm">确定</button>
      </footer>
    </div>
  </Modal>
</template>

<style>
.avatar-crop-modal .ant-modal-content {
  padding: 0;
  overflow: hidden;
  background: #17191c;
  border-radius: 16px;
}

.avatar-cropper {
  color: #fff;
  background: #17191c;
}

.avatar-cropper header {
  display: flex;
  gap: 12px;
  align-items: baseline;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgb(255 255 255 / 9%);
}

.avatar-cropper header strong {
  font-size: 18px;
}

.avatar-cropper header span {
  max-width: 440px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: rgb(255 255 255 / 55%);
  white-space: nowrap;
}

.avatar-cropper__stage {
  position: relative;
  width: min(512px, calc(100vw - 120px));
  aspect-ratio: 1;
  margin: 30px auto 18px;
  background:
    linear-gradient(45deg, #262a2e 25%, transparent 25%),
    linear-gradient(-45deg, #262a2e 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #262a2e 75%),
    linear-gradient(-45deg, transparent 75%, #262a2e 75%), #202327;
  background-position:
    0 0,
    0 10px,
    10px -10px,
    -10px 0;
  background-size: 20px 20px;
  box-shadow: 0 0 0 999px rgb(0 0 0 / 18%);
}

.avatar-cropper canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
  user-select: none;
}

.avatar-cropper canvas.dragging {
  cursor: grabbing;
}

.avatar-cropper__corner {
  position: absolute;
  width: 26px;
  height: 26px;
  pointer-events: none;
  border-color: #fff;
  border-style: solid;
}

.corner-a {
  inset: -2px auto auto -2px;
  border-width: 3px 0 0 3px;
}

.corner-b {
  inset: -2px -2px auto auto;
  border-width: 3px 3px 0 0;
}

.corner-c {
  inset: auto auto -2px -2px;
  border-width: 0 0 3px 3px;
}

.corner-d {
  inset: auto -2px -2px auto;
  border-width: 0 3px 3px 0;
}

.avatar-cropper__zoom {
  display: grid;
  grid-template-columns: 24px minmax(160px, 360px) 24px;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 0 24px 20px;
}

.avatar-cropper__zoom input {
  width: 100%;
  accent-color: #c51c37;
}

.avatar-cropper footer {
  display: grid;
  grid-template-columns: 1fr auto auto 1fr;
  gap: 18px;
  align-items: center;
  padding: 18px 24px 22px;
  border-top: 1px solid rgb(255 255 255 / 9%);
}

.avatar-cropper footer button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 18px;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 9px;
}

.avatar-cropper footer button:hover {
  background: rgb(255 255 255 / 8%);
}

.avatar-cropper footer .confirm {
  justify-self: end;
  min-width: 94px;
  background: #c51c37;
}

.avatar-cropper footer .confirm:hover {
  background: #a9152d;
}
</style>
