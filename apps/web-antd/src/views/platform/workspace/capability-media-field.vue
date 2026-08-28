<script lang="ts" setup>
import type {
  RegionPoint as Point,
  RegionStroke as Stroke,
} from './region-annotation';

import type { CapabilityField, PlatformAsset } from '#/modules/platform/types';

import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, message, Modal } from 'ant-design-vue';

import { getAssetApi, getAssetPreviewApi } from '#/api';
import ComfyMaskEditor from '#/components/platform/comfy-mask-editor.vue';
import ComfyMaskIcon from '#/components/platform/comfy-mask-icon.vue';
import ImageLightbox from '#/components/platform/image-lightbox.vue';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';

import AssetPickerModal from './asset-picker-modal.vue';
import {
  drawRegionStroke,
  parseRegionStrokes,
  serializeRegionStrokes,
} from './region-annotation';

interface CaptureCrop {
  height: number;
  sourceHeight: number;
  sourceWidth: number;
  width: number;
  x: number;
  y: number;
}

const props = defineProps<{
  accent: string;
  assets: PlatformAsset[];
  field: CapabilityField;
  liveCapture?: (file: File) => Promise<boolean | undefined>;
  openEditorRequest?: number;
  projectId?: string;
  refreshRate?: number;
  saveMask?: (file: File) => Promise<unknown>;
  selectedAssetId?: string;
  stopLiveCapture?: () => Promise<void>;
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
const strokes = ref<Stroke[]>([]);
const activeStroke = ref<Stroke>();
const brushColor = ref('255,0,0');
const brushSize = ref(24);
const brushOpacity = ref(1);
const activeMarker = ref<string>();
const drawingTool = ref<'box' | 'erase' | 'free' | 'square'>('free');
const redoHistory = ref<Stroke[][]>([]);
const undoHistory = ref<Stroke[][]>([]);
const editorOpen = ref(false);
const maskEditorOpen = ref(false);
const editorZoom = ref(1);
const pickerOpen = ref(false);
const lightboxOpen = ref(false);
const selectedAssetDetail = ref<PlatformAsset>();
const captureVideoRef = ref<HTMLVideoElement>();
const captureMode = ref<'camera' | 'screen'>('screen');
const captureCrop = ref<CaptureCrop>();
const captureActive = ref(false);
const liveCapturing = ref(false);
const areaOpen = ref(false);
const areaCanvasRef = ref<HTMLCanvasElement>();
const areaDraft = reactive({ height: 0, width: 0, x: 0, y: 0 });
let areaStart: Point | undefined;
let areaSnapshot: ImageData | undefined;
let liveGeneration = 0;
let previousFrame: Uint8ClampedArray | undefined;
let captureStream: MediaStream | undefined;

const selectedAsset = computed(
  () =>
    props.assets.find((asset) => asset.id === props.selectedAssetId) ??
    (selectedAssetDetail.value?.id === props.selectedAssetId
      ? selectedAssetDetail.value
      : undefined),
);
const isDrawingField = computed(() => props.field.type === 'region');
const capturePreviewStyle = computed(() => {
  const crop = captureCrop.value;
  return crop ? { aspectRatio: `${crop.width} / ${crop.height}` } : undefined;
});
const captureVideoStyle = computed(() => {
  const crop = captureCrop.value;
  if (!crop) return undefined;
  return {
    maxHeight: 'none',
    maxWidth: 'none',
    transform: `translate(${-((crop.x / crop.sourceWidth) * 100)}%, ${-((crop.y / crop.sourceHeight) * 100)}%)`,
    transformOrigin: 'top left',
    width: `${(crop.sourceWidth / crop.width) * 100}%`,
  };
});

async function loadPreview(assetId?: string) {
  previewUrl.value = '';
  strokes.value =
    props.field.type === 'region'
      ? parseRegionStrokes(String(props.value ?? ''))
      : [];
  activeStroke.value = undefined;
  undoHistory.value = [];
  redoHistory.value = [];
  if (!assetId) return;
  loadingPreview.value = true;
  try {
    const preview = await getAssetPreviewApi(assetId);
    if (preview.mode !== 'url') throw new Error('图片资产没有返回预览地址');
    previewUrl.value = preview.url;
    await nextTick();
  } catch {
    previewUrl.value = '';
  } finally {
    loadingPreview.value = false;
  }
}

async function loadSelectedAssetDetail(assetId?: string) {
  selectedAssetDetail.value = undefined;
  if (!assetId || props.assets.some((asset) => asset.id === assetId)) return;
  try {
    selectedAssetDetail.value = await getAssetApi(assetId);
  } catch {
    // 资产可能已经失效，预览加载会保持为空并允许用户重新选择。
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

function redraw() {
  const canvas = canvasRef.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  for (const stroke of strokes.value) drawRegionStroke(context, stroke);
  if (activeStroke.value) drawRegionStroke(context, activeStroke.value);
}

function startDrawing(event: PointerEvent) {
  if (!previewUrl.value || !isDrawingField.value) return;
  pushHistory();
  drawing.value = true;
  canvasRef.value?.setPointerCapture(event.pointerId);
  activeStroke.value = {
    color: brushColor.value,
    marker: activeMarker.value,
    mode: drawingTool.value === 'erase' ? 'erase' : 'brush',
    opacity: brushOpacity.value,
    points: [canvasPoint(event)],
    size: brushSize.value,
    type: drawingTool.value === 'erase' ? 'free' : drawingTool.value,
  };
  redraw();
}

function continueDrawing(event: PointerEvent) {
  if (!drawing.value) return;
  if (!activeStroke.value) return;
  if (activeStroke.value.type === 'free') {
    activeStroke.value.points.push(canvasPoint(event));
  } else {
    activeStroke.value.points[1] = canvasPoint(event);
  }
  redraw();
}

function serializeStrokes() {
  return serializeRegionStrokes(strokes.value);
}

function finishDrawing() {
  if (!drawing.value) return;
  drawing.value = false;
  if (activeStroke.value) {
    if (
      activeStroke.value.type !== 'free' &&
      activeStroke.value.points.length < 2
    ) {
      activeStroke.value.points[1] = activeStroke.value.points[0] ?? {
        x: 0,
        y: 0,
      };
    }
    strokes.value.push(activeStroke.value);
  }
  activeStroke.value = undefined;
  redraw();
  syncRegionValue();
}

function clearDrawing() {
  pushHistory();
  strokes.value = [];
  activeStroke.value = undefined;
  redraw();
  if (props.field.type === 'region') emit('update:value', '');
}

function cloneStrokes(value = strokes.value) {
  return value.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

function pushHistory() {
  undoHistory.value.push(cloneStrokes());
  if (undoHistory.value.length > 50) undoHistory.value.shift();
  redoHistory.value = [];
}

function undoDrawing() {
  const previous = undoHistory.value.pop();
  if (!previous) return;
  redoHistory.value.push(cloneStrokes());
  strokes.value = cloneStrokes(previous);
  redraw();
  syncRegionValue();
}

function redoDrawing() {
  const next = redoHistory.value.pop();
  if (!next) return;
  undoHistory.value.push(cloneStrokes());
  strokes.value = cloneStrokes(next);
  redraw();
  syncRegionValue();
}

function syncRegionValue() {
  if (props.field.type === 'region') {
    emit('update:value', serializeStrokes());
  }
}

function handleAssetSelect(assetId: string) {
  emit('select', assetId);
}

function captureStorageKey() {
  return `rail-workflow-screen-area-${props.field.key}`;
}

function restoreCaptureCrop() {
  const video = captureVideoRef.value;
  if (!video?.videoWidth || !video.videoHeight) return;
  try {
    const stored = JSON.parse(
      localStorage.getItem(captureStorageKey()) ?? 'null',
    ) as CaptureCrop | null;
    captureCrop.value =
      stored?.sourceWidth === video.videoWidth &&
      stored.sourceHeight === video.videoHeight
        ? stored
        : undefined;
  } catch {
    captureCrop.value = undefined;
  }
}

function stopLive(cancelJob = true) {
  const wasLive = liveCapturing.value;
  liveCapturing.value = false;
  liveGeneration += 1;
  previousFrame = undefined;
  if (wasLive && cancelJob && props.stopLiveCapture) {
    void props.stopLiveCapture();
  }
}

function stopCapture() {
  stopLive();
  for (const track of captureStream?.getTracks() ?? []) track.stop();
  captureStream = undefined;
  captureActive.value = false;
  if (captureVideoRef.value) captureVideoRef.value.srcObject = null;
}

async function startCapture(mode: 'camera' | 'screen') {
  if (!navigator.mediaDevices) {
    message.error('当前浏览器不支持实时画面捕获');
    return;
  }
  stopCapture();
  captureMode.value = mode;
  try {
    captureStream =
      mode === 'screen'
        ? await navigator.mediaDevices.getDisplayMedia({ video: true })
        : await navigator.mediaDevices.getUserMedia({ video: true });
    await nextTick();
    if (!captureVideoRef.value) return;
    captureVideoRef.value.srcObject = captureStream;
    await captureVideoRef.value.play();
    captureActive.value = true;
    restoreCaptureCrop();
    captureStream.getVideoTracks()[0]?.addEventListener('ended', stopCapture, {
      once: true,
    });
  } catch (error) {
    stopCapture();
    if ((error as Error).name !== 'NotAllowedError') throw error;
  }
}

function captureFrameCanvas() {
  const video = captureVideoRef.value;
  if (!video?.videoWidth || !video.videoHeight) {
    throw new Error('实时画面尚未就绪');
  }
  const crop = captureCrop.value ?? {
    height: video.videoHeight,
    sourceHeight: video.videoHeight,
    sourceWidth: video.videoWidth,
    width: video.videoWidth,
    x: 0,
    y: 0,
  };
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  canvas
    .getContext('2d')
    ?.drawImage(
      video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height,
    );
  return canvas;
}

async function captureFrameFile() {
  const canvas = captureFrameCanvas();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('实时画面捕获失败');
  return new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });
}

async function captureFrame() {
  try {
    emit('upload', await captureFrameFile());
  } catch (error) {
    message.warning((error as Error).message);
  }
}

function areaPoint(event: PointerEvent) {
  const canvas = areaCanvasRef.value;
  if (!canvas) return { x: 0, y: 0 };
  const bounds = canvas.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(
        canvas.width,
        ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      ),
    ),
    y: Math.max(
      0,
      Math.min(
        canvas.height,
        ((event.clientY - bounds.top) / bounds.height) * canvas.height,
      ),
    ),
  };
}

function drawAreaDraft() {
  const canvas = areaCanvasRef.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context || !areaSnapshot) return;
  context.putImageData(areaSnapshot, 0, 0);
  context.fillStyle = 'rgb(8 10 16 / 58%)';
  context.beginPath();
  context.rect(0, 0, canvas.width, canvas.height);
  context.rect(areaDraft.x, areaDraft.y, areaDraft.width, areaDraft.height);
  context.fill('evenodd');
  context.strokeStyle = '#b8f448';
  context.lineWidth = Math.max(2, canvas.width / 500);
  context.setLineDash([10, 7]);
  context.strokeRect(
    areaDraft.x,
    areaDraft.y,
    areaDraft.width,
    areaDraft.height,
  );
}

async function openAreaPicker() {
  const video = captureVideoRef.value;
  if (!captureStream || !video?.videoWidth || !video.videoHeight) {
    message.warning('请先共享屏幕或打开摄像头');
    return;
  }
  areaOpen.value = true;
  await nextTick();
  const canvas = areaCanvasRef.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  areaSnapshot = context.getImageData(0, 0, canvas.width, canvas.height);
  const crop = captureCrop.value ?? {
    height: canvas.height,
    width: canvas.width,
    x: 0,
    y: 0,
  };
  Object.assign(areaDraft, crop);
  drawAreaDraft();
}

function startAreaSelection(event: PointerEvent) {
  areaStart = areaPoint(event);
  Object.assign(areaDraft, {
    height: 0,
    width: 0,
    x: areaStart.x,
    y: areaStart.y,
  });
  areaCanvasRef.value?.setPointerCapture(event.pointerId);
}

function moveAreaSelection(event: PointerEvent) {
  if (!areaStart) return;
  const end = areaPoint(event);
  Object.assign(areaDraft, {
    height: Math.abs(end.y - areaStart.y),
    width: Math.abs(end.x - areaStart.x),
    x: Math.min(areaStart.x, end.x),
    y: Math.min(areaStart.y, end.y),
  });
  drawAreaDraft();
}

function finishAreaSelection() {
  areaStart = undefined;
}

function useFullCaptureArea() {
  captureCrop.value = undefined;
  localStorage.removeItem(captureStorageKey());
  areaOpen.value = false;
}

function confirmCaptureArea() {
  const canvas = areaCanvasRef.value;
  if (!canvas || areaDraft.width < 2 || areaDraft.height < 2) {
    message.warning('捕获区域太小，请重新拖动选框');
    return;
  }
  const crop: CaptureCrop = {
    height: Math.round(areaDraft.height),
    sourceHeight: canvas.height,
    sourceWidth: canvas.width,
    width: Math.round(areaDraft.width),
    x: Math.round(areaDraft.x),
    y: Math.round(areaDraft.y),
  };
  captureCrop.value = crop;
  localStorage.setItem(captureStorageKey(), JSON.stringify(crop));
  areaOpen.value = false;
}

function frameSignature() {
  const source = captureFrameCanvas();
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('浏览器无法比较实时画面');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

function frameChanged(current: Uint8ClampedArray) {
  if (!previousFrame || previousFrame.length !== current.length) return true;
  let difference = 0;
  for (let index = 0; index < current.length; index += 4) {
    difference += Math.abs((previousFrame[index] ?? 0) - (current[index] ?? 0));
    difference += Math.abs(
      (previousFrame[index + 1] ?? 0) - (current[index + 1] ?? 0),
    );
    difference += Math.abs(
      (previousFrame[index + 2] ?? 0) - (current[index + 2] ?? 0),
    );
  }
  return difference / (48 * 48) > 1;
}

function waitForNextFrame(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function runLive(generation: number) {
  while (liveCapturing.value && generation === liveGeneration) {
    try {
      const current = frameSignature();
      if (frameChanged(current)) {
        previousFrame = current;
        const succeeded = await props.liveCapture?.(await captureFrameFile());
        if (succeeded === false) {
          stopLive(false);
          return;
        }
      }
    } catch (error) {
      stopLive(false);
      message.error((error as Error).message);
      return;
    }
    const refreshRate = Math.max(50, Number(props.refreshRate) || 500);
    await waitForNextFrame(refreshRate);
  }
}

async function toggleLive() {
  if (liveCapturing.value) {
    stopLive();
    return;
  }
  const video = captureVideoRef.value;
  if (!captureStream || !video?.videoWidth || !props.liveCapture) {
    message.warning('请先共享屏幕或打开摄像头');
    return;
  }
  previousFrame = undefined;
  liveCapturing.value = true;
  liveGeneration += 1;
  await runLive(liveGeneration);
}

function handleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) emit('upload', file);
  input.value = '';
}

watch(
  () => props.selectedAssetId,
  (assetId) => {
    void loadPreview(assetId);
    void loadSelectedAssetDetail(assetId);
  },
  { immediate: true },
);
watch(
  () => props.value,
  async (value) => {
    if (
      props.field.type !== 'region' ||
      drawing.value ||
      serializeStrokes() === String(value ?? '')
    ) {
      return;
    }
    strokes.value = parseRegionStrokes(String(value ?? ''));
    await nextTick();
    redraw();
  },
);
watch(
  () => props.openEditorRequest,
  (request, previousRequest) => {
    if (
      props.field.type === 'region' &&
      props.selectedAssetId &&
      request &&
      request !== previousRequest
    ) {
      editorOpen.value = true;
    }
  },
);
onBeforeUnmount(stopCapture);
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

    <div v-if="field.type === 'capture'" class="capture-inline-panel">
      <div
        :class="{ cropped: captureCrop }"
        :style="capturePreviewStyle"
        class="capture-preview-frame inline"
      >
        <video
          v-show="captureActive"
          ref="captureVideoRef"
          autoplay
          muted
          playsinline
          :style="captureVideoStyle"
          @loadedmetadata="restoreCaptureCrop"
        ></video>
        <img
          v-if="!captureActive && previewUrl"
          alt="已捕获画面"
          crossorigin="anonymous"
          :src="previewUrl"
          @click="lightboxOpen = true"
        />
        <div v-if="!captureActive && !previewUrl" class="capture-placeholder">
          <IconifyIcon icon="lucide:monitor-up" />
          <p>共享屏幕或打开摄像头后，可截取当前帧或持续实时运行。</p>
        </div>
      </div>
      <div class="capture-direct-actions primary-row">
        <Button
          :type="
            captureActive && captureMode === 'screen' ? 'primary' : 'default'
          "
          @click="startCapture('screen')"
        >
          <IconifyIcon icon="lucide:monitor-up" />
          共享屏幕
        </Button>
        <Button
          :type="
            captureActive && captureMode === 'camera' ? 'primary' : 'default'
          "
          @click="startCapture('camera')"
        >
          <IconifyIcon icon="lucide:camera" />
          摄像头
        </Button>
      </div>
      <div class="capture-direct-actions">
        <Button :disabled="!captureActive" @click="openAreaPicker">
          <IconifyIcon icon="lucide:scan" />
          Set Area
        </Button>
        <Button
          :danger="liveCapturing"
          :disabled="!captureActive"
          :type="liveCapturing ? 'primary' : 'default'"
          @click="toggleLive"
        >
          <IconifyIcon
            :icon="liveCapturing ? 'lucide:square' : 'lucide:radio'"
          />
          {{ liveCapturing ? '停止 Live' : 'Live On' }}
        </Button>
      </div>
      <div class="capture-status">
        <span v-if="liveCapturing">实时运行中：检测到画面变化后串行提交。</span>
        <span v-else-if="captureCrop">
          捕获区域 {{ captureCrop.width }} × {{ captureCrop.height }}
        </span>
        <span v-else>当前使用完整画面</span>
      </div>
      <div class="capture-direct-actions utility-row">
        <Button class="asset-picker-button" @click="pickerOpen = true">
          <IconifyIcon :icon="platformSemanticIcons.assets" />
          项目资产
        </Button>
        <Button @click="fileInputRef?.click()">
          <IconifyIcon icon="lucide:upload" />
          导入
        </Button>
        <Button
          :disabled="!captureActive || liveCapturing"
          @click="captureFrame"
        >
          捕获当前帧
        </Button>
        <Button v-if="captureActive" danger @click="stopCapture">停止</Button>
      </div>
    </div>

    <div
      v-else
      class="media-preview"
      :class="{ interactive: Boolean(previewUrl) }"
      @click="
        previewUrl &&
        (field.type === 'mask'
          ? (maskEditorOpen = true)
          : isDrawingField
            ? (editorOpen = true)
            : (lightboxOpen = true))
      "
    >
      <img v-if="previewUrl" alt="" crossorigin="anonymous" :src="previewUrl" />
      <span v-if="previewUrl" class="preview-affordance">
        <ComfyMaskIcon v-if="field.type === 'mask'" :size="15" />
        <IconifyIcon
          v-else
          :icon="isDrawingField ? 'lucide:scan-line' : 'lucide:maximize-2'"
        />
        {{
          field.type === 'mask'
            ? '打开遮罩编辑器'
            : isDrawingField
              ? '打开可视化编辑器'
              : '点击放大'
        }}
      </span>
      <div v-if="!previewUrl" class="media-placeholder">
        <IconifyIcon
          :icon="loadingPreview ? 'lucide:loader-circle' : 'lucide:scan'"
        />
        <p>{{ loadingPreview ? '正在读取预览' : '选择项目资产或导入图像' }}</p>
      </div>
    </div>

    <p v-if="field.help" class="media-help">{{ field.help }}</p>

    <div v-if="field.type !== 'capture'" class="media-actions">
      <Button class="asset-picker-button" @click="pickerOpen = true">
        <IconifyIcon :icon="platformSemanticIcons.assets" />
        从项目资产选择
      </Button>
      <Button @click="fileInputRef?.click()">
        <IconifyIcon icon="lucide:upload" />
        导入
      </Button>
    </div>
    <input
      ref="fileInputRef"
      accept="image/*"
      hidden
      type="file"
      @change="handleFile"
    />

    <footer v-if="selectedAsset">
      <span>{{ selectedAsset.name }}</span>
      <small>V{{ selectedAsset.version }}</small>
    </footer>

    <AssetPickerModal
      v-model:open="pickerOpen"
      :accepted-kinds="field.acceptedKinds"
      :assets="assets"
      :project-id="projectId"
      :selected-asset-id="selectedAssetId"
      @select="handleAssetSelect"
    />
    <ImageLightbox
      v-model:open="lightboxOpen"
      :title="selectedAsset?.name"
      :url="previewUrl"
    />
    <ComfyMaskEditor
      v-if="field.type === 'mask' && saveMask"
      v-model:open="maskEditorOpen"
      :on-save="saveMask"
      :src="previewUrl"
      :title="selectedAsset?.name ?? field.label"
    />

    <Modal
      v-if="field.type === 'region'"
      v-model:open="editorOpen"
      :footer="null"
      title="分区重绘编辑器"
      width="min(1180px, 96vw)"
      wrap-class-name="workflow-image-editor"
    >
      <div class="editor-toolbar">
        <Button
          :type="drawingTool === 'free' ? 'primary' : 'default'"
          @click="
            drawingTool = 'free';
            activeMarker = undefined;
          "
        >
          <IconifyIcon icon="lucide:paintbrush" />
          画笔
        </Button>
        <Button
          :type="drawingTool === 'box' ? 'primary' : 'default'"
          @click="
            drawingTool = 'box';
            activeMarker = undefined;
          "
        >
          <IconifyIcon icon="lucide:square" />
          方框
        </Button>
        <Button
          :type="
            drawingTool === 'square' && !activeMarker ? 'primary' : 'default'
          "
          @click="
            drawingTool = 'square';
            activeMarker = undefined;
          "
        >
          <IconifyIcon icon="lucide:square-dashed" />
          色块
        </Button>
        <Button
          :type="drawingTool === 'erase' ? 'primary' : 'default'"
          @click="
            drawingTool = 'erase';
            activeMarker = undefined;
          "
        >
          <IconifyIcon icon="lucide:eraser" />
          橡皮
        </Button>
        <Button :disabled="!undoHistory.length" @click="undoDrawing">
          <IconifyIcon icon="lucide:undo-2" />
        </Button>
        <Button :disabled="!redoHistory.length" @click="redoDrawing">
          <IconifyIcon icon="lucide:redo-2" />
        </Button>
        <button
          v-for="color in [
            '0,0,0',
            '255,255,255',
            '255,0,0',
            '0,255,0',
            '0,0,255',
            '128,128,128',
          ]"
          :key="color"
          :class="{ active: brushColor === color }"
          :style="{ backgroundColor: `rgb(${color})` }"
          class="color-swatch"
          :title="color"
          type="button"
          @click="
            brushColor = color;
            activeMarker = undefined;
          "
        ></button>
        <div class="marker-buttons">
          <button
            v-for="marker in ['1', '2', '3', '4', '5', '6']"
            :key="marker"
            :class="{ active: activeMarker === marker }"
            type="button"
            @click="
              activeMarker = marker;
              drawingTool = 'square';
            "
          >
            {{ marker }}
          </button>
        </div>
        <label>
          粗细
          <input v-model.number="brushSize" max="160" min="2" type="range" />
          <span>{{ brushSize }}</span>
        </label>
        <label>
          透明度
          <input
            v-model.number="brushOpacity"
            max="1"
            min="0.1"
            step="0.1"
            type="range"
          />
          <span>{{ Math.round(brushOpacity * 100) }}%</span>
        </label>
        <Button @click="editorZoom = Math.max(0.2, editorZoom / 1.2)">−</Button>
        <span>{{ Math.round(editorZoom * 100) }}%</span>
        <Button @click="editorZoom = Math.min(4, editorZoom * 1.2)">+</Button>
        <Button danger @click="clearDrawing">清除</Button>
      </div>
      <div class="editor-viewport">
        <div
          class="editor-canvas-stack"
          :style="{ transform: `scale(${editorZoom})` }"
        >
          <img
            v-if="previewUrl"
            ref="imageRef"
            alt="待编辑图片"
            crossorigin="anonymous"
            :src="previewUrl"
            @load="configureCanvas"
          />
          <canvas
            v-if="previewUrl"
            ref="canvasRef"
            @pointercancel="finishDrawing"
            @pointerdown="startDrawing"
            @pointermove="continueDrawing"
            @pointerup="finishDrawing"
          ></canvas>
        </div>
      </div>
      <div class="editor-footer">
        <span>不同颜色表示不同重绘分区，可撤销、重做或擦除。</span>
        <Button type="primary" @click="editorOpen = false">应用分区</Button>
      </div>
    </Modal>

    <Modal
      v-model:open="areaOpen"
      :footer="null"
      title="设置捕获区域"
      width="min(1100px, 96vw)"
    >
      <p class="area-guide">在完整画面上拖动选框，然后确认使用。</p>
      <div class="area-canvas-frame">
        <canvas
          ref="areaCanvasRef"
          @pointercancel="finishAreaSelection"
          @pointerdown="startAreaSelection"
          @pointermove="moveAreaSelection"
          @pointerup="finishAreaSelection"
        ></canvas>
      </div>
      <div class="editor-footer">
        <Button @click="useFullCaptureArea">使用完整画面</Button>
        <div class="area-actions">
          <Button @click="areaOpen = false">取消</Button>
          <Button type="primary" @click="confirmCaptureArea">
            使用所选区域
          </Button>
        </div>
      </div>
    </Modal>
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
  font-size: 12px;
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

.media-preview img {
  grid-area: 1 / 1;
  width: 100%;
  height: auto;
  max-height: 260px;
  object-fit: contain;
}

.media-preview:has(img) {
  background: #fff;
}

.media-preview.interactive {
  cursor: zoom-in;
}

.preview-affordance {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 5px 8px;
  font-size: 12px;
  color: #fff;
  pointer-events: none;
  background: rgb(18 27 33 / 78%);
  border-radius: 999px;
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
  font-size: 13px;
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

.asset-picker-button {
  flex: 1;
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
  font-size: 12px;
  color: #697680;
  border-top: 1px solid #e6e9ea;
}

.media-field footer span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-toolbar,
.capture-toolbar,
.editor-footer,
.editor-toolbar label,
.capture-toolbar label {
  display: flex;
  gap: 8px;
  align-items: center;
}

.editor-toolbar,
.capture-toolbar {
  flex-wrap: wrap;
  padding-bottom: 12px;
}

.editor-toolbar label {
  min-width: 180px;
  font-size: 14px;
}

.editor-toolbar label input {
  flex: 1;
  accent-color: var(--field-accent);
}

.color-swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 3px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #b8c0c4;
}

.color-swatch.active {
  box-shadow: 0 0 0 2px #172027;
}

.marker-buttons {
  display: grid;
  grid-template-columns: repeat(3, 28px);
  gap: 4px;
}

.marker-buttons button {
  height: 25px;
  padding: 0;
  font-size: 12px;
  font-weight: 800;
  color: #131820;
  background: #ffe34d;
  border: 1px solid #e4c900;
  border-radius: 4px;
}

.marker-buttons button.active {
  color: #fff;
  background: var(--field-accent, #c51f3a);
  border-color: var(--field-accent, #c51f3a);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--field-accent, #c51f3a) 28%, transparent);
}

.editor-viewport {
  display: grid;
  place-items: center;
  height: min(68vh, 720px);
  overflow: auto;
  background: #171c20;
  border-radius: 12px;
}

.editor-canvas-stack {
  display: grid;
  max-width: 100%;
  max-height: 100%;
  transform-origin: center;
}

.editor-canvas-stack img,
.editor-canvas-stack canvas {
  grid-area: 1 / 1;
  width: 100%;
  height: auto;
  max-height: 66vh;
  object-fit: contain;
}

.editor-canvas-stack canvas {
  touch-action: none;
  cursor: crosshair;
}

.editor-footer {
  justify-content: space-between;
  padding-top: 12px;
  font-size: 14px;
  color: #6e7a82;
}

.capture-toolbar :deep(.ant-input-number) {
  width: 70px;
}

.capture-preview-frame {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 420px;
  overflow: hidden;
  background: #11171b;
  border-radius: 12px;
}

.capture-preview-frame video {
  width: 100%;
  max-height: 68vh;
}

.capture-preview-frame.cropped {
  display: block;
  min-height: 0;
}

.capture-preview-frame.cropped video {
  display: block;
}

.capture-inline-panel {
  padding: 8px;
  background: #10171c;
  border: 1px solid #25343d;
  border-radius: 12px;
}

.capture-preview-frame.inline {
  min-height: 170px;
  background:
    radial-gradient(circle at 35% 25%, rgb(71 116 134 / 26%), transparent 42%),
    #071017;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 8px;
}

.capture-preview-frame.inline video,
.capture-preview-frame.inline img {
  display: block;
  width: 100%;
  max-height: 260px;
  object-fit: contain;
}

.capture-placeholder {
  display: grid;
  place-items: center;
  max-width: 210px;
  color: #87a1ad;
  text-align: center;
}

.capture-placeholder svg {
  margin-bottom: 8px;
  font-size: 30px;
  color: #61b7ca;
}

.capture-placeholder p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
}

.capture-direct-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 7px;
}

.capture-direct-actions.utility-row {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.capture-direct-actions :deep(.ant-btn) {
  min-width: 0;
  padding-inline: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  color: #d7e5e9;
  background: #1a272e;
  border-color: #34454e;
}

.capture-direct-actions :deep(.ant-btn-primary) {
  color: #fff;
  background: var(--field-accent);
  border-color: var(--field-accent);
}

.capture-status {
  padding: 7px 8px;
  margin-top: 7px;
  font-size: 12px;
  color: #8eb0bd;
  background: rgb(255 255 255 / 4%);
  border-radius: 7px;
}

.area-guide {
  margin: 0 0 12px;
  font-size: 12px;
  color: #6e7a82;
}

.area-canvas-frame {
  display: grid;
  place-items: center;
  max-height: 68vh;
  overflow: auto;
  background: #11171b;
  border-radius: 12px;
}

.area-canvas-frame canvas {
  width: auto;
  max-width: 100%;
  height: auto;
  max-height: 68vh;
  touch-action: none;
  cursor: crosshair;
}

.area-actions {
  display: flex;
  gap: 8px;
}
</style>
