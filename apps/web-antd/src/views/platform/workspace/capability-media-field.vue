<script lang="ts" setup>
import type { CapabilityField, PlatformAsset } from '#/modules/platform/types';

import { computed, nextTick, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, message, Select } from 'ant-design-vue';

import { getAssetPreviewApi } from '#/api';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  points: Point[];
  size: number;
}

const props = defineProps<{
  accent: string;
  assets: PlatformAsset[];
  field: CapabilityField;
  selectedAssetId?: string;
  value?: unknown;
}>();

const emit = defineEmits<{
  select: [assetId: string];
  'update:value': [value: string];
  upload: [file: File];
}>();

const canvasRef = ref<HTMLCanvasElement>();
const imageRef = ref<HTMLImageElement>();
const fileInputRef = ref<HTMLInputElement>();
const previewUrl = ref('');
const loadingPreview = ref(false);
const drawing = ref(false);
const savingMask = ref(false);
const strokes = ref<Stroke[]>([]);
const activeStroke = ref<Stroke>();
const brushColor = ref('255,0,0');
const brushSize = ref(24);

const selectedAsset = computed(() =>
  props.assets.find((asset) => asset.id === props.selectedAssetId),
);
const assetOptions = computed(() =>
  props.assets
    .filter(
      (asset) =>
        props.field.acceptedKinds.length === 0 ||
        props.field.acceptedKinds.includes(asset.type),
    )
    .map((asset) => ({
      label: `${asset.name} · V${asset.version}`,
      value: asset.id,
    })),
);
const isDrawingField = computed(() =>
  ['mask', 'region'].includes(props.field.type),
);

async function loadPreview(assetId?: string) {
  previewUrl.value = '';
  strokes.value = [];
  activeStroke.value = undefined;
  if (props.field.type === 'region') emit('update:value', '');
  if (!assetId) return;
  loadingPreview.value = true;
  try {
    const preview = await getAssetPreviewApi(assetId);
    previewUrl.value = preview.url;
    await nextTick();
  } catch {
    previewUrl.value = '';
  } finally {
    loadingPreview.value = false;
  }
}

function configureCanvas() {
  const canvas = canvasRef.value;
  const image = imageRef.value;
  if (!canvas || !image) return;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  redraw();
}

function canvasPoint(event: PointerEvent) {
  const canvas = canvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const bounds = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
    y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
  };
}

function drawStroke(context: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length === 0) return;
  context.beginPath();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.size;
  context.strokeStyle = `rgb(${stroke.color})`;
  context.moveTo(stroke.points[0]?.x ?? 0, stroke.points[0]?.y ?? 0);
  for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
  context.stroke();
}

function redraw() {
  const canvas = canvasRef.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalAlpha = 0.72;
  for (const stroke of strokes.value) drawStroke(context, stroke);
  if (activeStroke.value) drawStroke(context, activeStroke.value);
  context.globalAlpha = 1;
}

function startDrawing(event: PointerEvent) {
  if (!previewUrl.value || !isDrawingField.value) return;
  drawing.value = true;
  canvasRef.value?.setPointerCapture(event.pointerId);
  activeStroke.value = {
    color: brushColor.value,
    points: [canvasPoint(event)],
    size: brushSize.value,
  };
  redraw();
}

function continueDrawing(event: PointerEvent) {
  if (!drawing.value || !activeStroke.value) return;
  activeStroke.value.points.push(canvasPoint(event));
  redraw();
}

function serializeStrokes() {
  return strokes.value
    .filter((stroke) => stroke.points.length > 0)
    .map(
      (stroke) =>
        `brush:brush:${stroke.size}:1:${stroke.color}:${stroke.points
          .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
          .join(';')}`,
    )
    .join('|');
}

function finishDrawing() {
  if (!drawing.value || !activeStroke.value) return;
  drawing.value = false;
  strokes.value.push(activeStroke.value);
  activeStroke.value = undefined;
  redraw();
  if (props.field.type === 'region') {
    emit('update:value', serializeStrokes());
  }
}

function clearDrawing() {
  strokes.value = [];
  activeStroke.value = undefined;
  redraw();
  if (props.field.type === 'region') emit('update:value', '');
}

function handleAssetSelect(value: unknown) {
  if (typeof value === 'string') emit('select', value);
}

async function saveMask() {
  const image = imageRef.value;
  if (!image || strokes.value.length === 0) {
    message.warning('请先在图像上绘制需要重绘的区域');
    return;
  }
  savingMask.value = true;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法创建遮罩画布');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'destination-out';
    for (const stroke of strokes.value) drawStroke(context, stroke);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('遮罩图像导出失败');
    emit(
      'upload',
      new File([blob], `masked-${Date.now()}.png`, { type: 'image/png' }),
    );
  } finally {
    savingMask.value = false;
  }
}

async function captureScreen() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    message.error('当前浏览器不支持屏幕捕获');
    return;
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 120));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) throw new Error('屏幕画面捕获失败');
    emit(
      'upload',
      new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' }),
    );
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

function handleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit('upload', file);
  input.value = '';
}

watch(() => props.selectedAssetId, loadPreview, { immediate: true });
</script>

<template>
  <article class="media-field" :style="{ '--field-accent': accent }">
    <header>
      <div>
        <span>{{ field.label }}</span>
        <small v-if="field.required">必填</small>
      </div>
      <IconifyIcon
        :icon="
          field.type === 'capture'
            ? 'lucide:monitor-up'
            : field.type === 'mask'
              ? 'lucide:paintbrush'
              : field.type === 'region'
                ? 'lucide:square-dashed-mouse-pointer'
                : 'lucide:image'
        "
      />
    </header>

    <div class="media-preview" :class="{ drawing: isDrawingField }">
      <img
        v-if="previewUrl"
        ref="imageRef"
        alt=""
        crossorigin="anonymous"
        :src="previewUrl"
        @load="configureCanvas"
      />
      <canvas
        v-if="previewUrl && isDrawingField"
        ref="canvasRef"
        @pointercancel="finishDrawing"
        @pointerdown="startDrawing"
        @pointermove="continueDrawing"
        @pointerup="finishDrawing"
      ></canvas>
      <div v-if="!previewUrl" class="media-placeholder">
        <IconifyIcon
          :icon="loadingPreview ? 'lucide:loader-circle' : 'lucide:scan-image'"
        />
        <p>{{ loadingPreview ? '正在读取预览' : '选择项目资产或导入图像' }}</p>
      </div>
    </div>

    <p v-if="field.help" class="media-help">{{ field.help }}</p>

    <div v-if="isDrawingField && previewUrl" class="drawing-tools">
      <template v-if="field.type === 'region'">
        <button
          v-for="color in ['255,0,0', '0,128,255', '0,180,110', '255,180,0']"
          :key="color"
          :class="{ active: brushColor === color }"
          :style="{ backgroundColor: `rgb(${color})` }"
          type="button"
          @click="brushColor = color"
        ></button>
      </template>
      <input v-model.number="brushSize" max="120" min="4" type="range" />
      <Button size="small" @click="clearDrawing">清除</Button>
      <Button
        v-if="field.type === 'mask'"
        :loading="savingMask"
        size="small"
        type="primary"
        @click="saveMask"
      >
        保存遮罩
      </Button>
    </div>

    <div class="media-actions">
      <Select
        :options="assetOptions"
        placeholder="从项目资产选择"
        :value="selectedAssetId"
        show-search
        @update:value="handleAssetSelect"
      />
      <Button v-if="field.type === 'capture'" @click="captureScreen">
        <IconifyIcon icon="lucide:monitor-up" />
        捕获屏幕
      </Button>
      <Button v-else @click="fileInputRef?.click()">
        <IconifyIcon icon="lucide:upload" />
        导入
      </Button>
      <input
        ref="fileInputRef"
        accept="image/*"
        hidden
        type="file"
        @change="handleFile"
      />
    </div>

    <footer v-if="selectedAsset">
      <span>{{ selectedAsset.name }}</span>
      <small>V{{ selectedAsset.version }}</small>
    </footer>
  </article>
</template>

<style scoped>
.media-field {
  padding: 14px;
  background: #fff;
  border: 1px solid #dce1e4;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgb(28 39 46 / 5%);
}

.media-field header,
.media-field header > div,
.media-actions,
.drawing-tools,
.media-field footer {
  display: flex;
  gap: 8px;
  align-items: center;
}

.media-field header {
  justify-content: space-between;
  margin-bottom: 11px;
}

.media-field header span {
  font-size: 12px;
  font-weight: 750;
}

.media-field header small {
  padding: 2px 6px;
  font-size: 8px;
  color: var(--field-accent);
  background: color-mix(in srgb, var(--field-accent) 10%, white);
  border-radius: 999px;
}

.media-field header > svg {
  font-size: 18px;
  color: var(--field-accent);
}

.media-preview {
  position: relative;
  display: grid;
  min-height: 142px;
  overflow: hidden;
  background:
    linear-gradient(45deg, #edf0f1 25%, transparent 25%) 0 0 / 18px 18px,
    linear-gradient(45deg, transparent 75%, #edf0f1 75%) 0 0 / 18px 18px,
    linear-gradient(45deg, transparent 75%, #edf0f1 75%) 9px -9px / 18px 18px,
    linear-gradient(45deg, #edf0f1 25%, #f8f9f9 25%) 9px 9px / 18px 18px;
  border: 1px solid #e0e4e6;
  border-radius: 12px;
}

.media-preview img,
.media-preview canvas {
  grid-area: 1 / 1;
  width: 100%;
  height: auto;
  max-height: 260px;
  object-fit: contain;
}

.media-preview canvas {
  touch-action: none;
  cursor: crosshair;
}

.media-placeholder {
  display: grid;
  place-content: center;
  place-items: center;
  color: #74818a;
}

.media-placeholder svg {
  margin-bottom: 8px;
  font-size: 28px;
}

.media-placeholder p,
.media-help {
  margin: 0;
  font-size: 10px;
  line-height: 1.55;
  color: #74818a;
}

.media-help {
  margin-top: 9px;
}

.media-actions {
  margin-top: 11px;
}

.media-actions :deep(.ant-select) {
  flex: 1;
  min-width: 0;
}

.drawing-tools {
  padding: 9px;
  margin-top: 9px;
  background: #f5f7f7;
  border-radius: 10px;
}

.drawing-tools > button:not(.ant-btn) {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #cfd5d8;
}

.drawing-tools > button.active {
  box-shadow: 0 0 0 2px var(--field-accent);
}

.drawing-tools input {
  flex: 1;
  min-width: 60px;
  accent-color: var(--field-accent);
}

.media-field footer {
  justify-content: space-between;
  padding-top: 10px;
  margin-top: 11px;
  font-size: 9px;
  color: #697680;
  border-top: 1px solid #e6e9ea;
}

.media-field footer span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
