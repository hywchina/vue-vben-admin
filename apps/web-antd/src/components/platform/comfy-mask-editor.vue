<script lang="ts" setup>
import type {
  ColorComparisonMethod,
  PixelBuffer,
  Point,
  RgbColor,
} from './comfy-mask-editor-utils';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { IconifyIcon } from '@vben/icons';

import { message, Modal } from 'ant-design-vue';

import {
  colorSelectFill,
  invertMask,
  paintBucketFill,
  recolorMask,
  transformedPixels,
} from './comfy-mask-editor-utils';

type BrushShape = 'circle' | 'square';
type DrawingLayer = 'mask' | 'paint';
type MaskBlendMode = 'black' | 'negative' | 'white';
type MaskTool = 'erase' | 'fill' | 'mask' | 'paint' | 'select';

interface CanvasHistoryState {
  base: PixelBuffer;
  mask: PixelBuffer;
  paint: PixelBuffer;
}

const props = defineProps<{
  onSave: (file: File) => Promise<unknown>;
  open: boolean;
  src?: string;
  title?: string;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const baseCanvasRef = ref<HTMLCanvasElement>();
const maskCanvasRef = ref<HTMLCanvasElement>();
const paintCanvasRef = ref<HTMLCanvasElement>();
const viewportRef = ref<HTMLElement>();
const imageWidth = ref(0);
const imageHeight = ref(0);
const loading = ref(false);
const saving = ref(false);
const tool = ref<MaskTool>('mask');
const activeLayer = ref<DrawingLayer>('mask');
const brushShape = ref<BrushShape>('circle');
const brushColor = ref('#ff0000');
const brushSize = ref(20);
const brushOpacity = ref(1);
const brushHardness = ref(1);
const brushSpacing = ref(5);
const fillTolerance = ref(5);
const fillOpacity = ref(100);
const selectTolerance = ref(20);
const selectionOpacity = ref(100);
const selectLivePreview = ref(false);
const applyWholeImage = ref(false);
const comparisonMethod = ref<ColorComparisonMethod>('simple');
const stopAtMask = ref(false);
const maskTolerance = ref(0);
const maskOpacity = ref(0.8);
const maskBlendMode = ref<MaskBlendMode>('black');
const maskVisible = ref(true);
const paintVisible = ref(true);
const baseVisible = ref(true);
const zoom = ref(1);
const pan = ref<Point>({ x: 0, y: 0 });
const cursor = ref<Point>({ x: 0, y: 0 });
const cursorVisible = ref(false);
const drawing = ref(false);
const panning = ref(false);
const adjustingBrush = ref(false);
const spacePressed = ref(false);
const lastDrawPoint = ref<Point>();
const lineStartPoint = ref<Point>();
const panStart = ref<Point>();
const panOrigin = ref<Point>();
const adjustmentStart = ref<Point>();
const adjustmentBrushSize = ref(20);
const adjustmentHardness = ref(1);
const touchPoints = new Map<number, Point>();
const pinchStartDistance = ref(0);
const pinchStartZoom = ref(1);
const pinchStartPan = ref<Point>();
const pinchStartMidpoint = ref<Point>();
const history = ref<CanvasHistoryState[]>([]);
const historyIndex = ref(-1);
const lastSelectionPoint = ref<Point>();
const selectionBaseline = ref<PixelBuffer>();
const imageSource = ref('');
let loadGeneration = 0;
let resizeObserver: ResizeObserver | undefined;

const canUndo = computed(() => historyIndex.value > 0);
const canRedo = computed(
  () =>
    historyIndex.value >= 0 && historyIndex.value < history.value.length - 1,
);
const zoomLabel = computed(() => `${Math.round(zoom.value * 100)}%`);
const dimensionsLabel = computed(() =>
  imageWidth.value && imageHeight.value
    ? `${imageWidth.value}×${imageHeight.value}`
    : '—',
);
const layerStackStyle = computed(() => ({
  height: `${Math.max(1, imageHeight.value)}px`,
  transform: `translate(${pan.value.x}px, ${pan.value.y}px) scale(${zoom.value})`,
  width: `${Math.max(1, imageWidth.value)}px`,
}));
const maskColor = computed<RgbColor>(() =>
  maskBlendMode.value === 'black'
    ? { b: 0, g: 0, r: 0 }
    : { b: 255, g: 255, r: 255 },
);
const effectiveMaskOpacity = computed(
  () =>
    Number(maskVisible.value) *
    (maskBlendMode.value === 'negative' ? 1 : maskOpacity.value),
);
const maskLayerStyle = computed(() => ({
  mixBlendMode:
    maskBlendMode.value === 'negative' ? ('difference' as const) : undefined,
  opacity: effectiveMaskOpacity.value,
}));
const canvasBackgroundStyle = computed(() => ({
  backgroundColor: maskBlendMode.value === 'black' ? '#000' : '#fff',
}));
const effectiveBrushRadius = computed(
  () => brushSize.value * (1 + (1 - brushHardness.value) * 0.5),
);
const cursorStyle = computed(() => {
  const diameter = effectiveBrushRadius.value * zoom.value * 2;
  return {
    borderRadius: brushShape.value === 'circle' ? '50%' : '0',
    display:
      cursorVisible.value &&
      !panning.value &&
      ['erase', 'mask', 'paint'].includes(tool.value)
        ? 'block'
        : 'none',
    height: `${diameter}px`,
    left: `${cursor.value.x - diameter / 2}px`,
    top: `${cursor.value.y - diameter / 2}px`,
    width: `${diameter}px`,
  };
});
const cursorGradientStyle = computed(() => {
  const effectiveHardness =
    (brushSize.value * brushHardness.value) / effectiveBrushRadius.value;
  const midpoint = effectiveHardness * 100;
  const fadeMidpoint = midpoint + (100 - midpoint) * 0.5;
  return {
    background:
      brushHardness.value === 1
        ? 'rgb(255 0 0 / 50%)'
        : `radial-gradient(circle, rgb(255 0 0 / 50%) 0%, rgb(255 0 0 / 50%) ${midpoint}%, rgb(255 0 0 / 12.5%) ${fadeMidpoint}%, transparent 100%)`,
    display: adjustingBrush.value ? 'block' : 'none',
  };
});
const toolCursorStyle = computed(() => ({
  display:
    cursorVisible.value && ['fill', 'select'].includes(tool.value)
      ? 'grid'
      : 'none',
  left: `${cursor.value.x - 15}px`,
  top: `${cursor.value.y - 25}px`,
}));

function closeEditor() {
  emit('update:open', false);
}

function canvasContext(canvas?: HTMLCanvasElement) {
  return canvas?.getContext('2d', { willReadFrequently: true }) ?? undefined;
}

function capturePixels(canvas: HTMLCanvasElement): PixelBuffer {
  const context = canvasContext(canvas);
  if (!context) throw new Error('浏览器无法读取遮罩画布');
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    data: new Uint8ClampedArray(imageData.data),
    height: imageData.height,
    width: imageData.width,
  };
}

function putPixels(canvas: HTMLCanvasElement, pixels: PixelBuffer) {
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const context = canvasContext(canvas);
  if (!context) throw new Error('浏览器无法写入遮罩画布');
  const imageData = context.createImageData(pixels.width, pixels.height);
  imageData.data.set(pixels.data);
  context.putImageData(imageData, 0, 0);
}

function clonePixels(pixels: PixelBuffer): PixelBuffer {
  return {
    data: new Uint8ClampedArray(pixels.data),
    height: pixels.height,
    width: pixels.width,
  };
}

function captureState(): CanvasHistoryState | undefined {
  const base = baseCanvasRef.value;
  const mask = maskCanvasRef.value;
  const paint = paintCanvasRef.value;
  if (!base || !mask || !paint || !imageWidth.value) return undefined;
  return {
    base: capturePixels(base),
    mask: capturePixels(mask),
    paint: capturePixels(paint),
  };
}

function commitHistory() {
  const state = captureState();
  if (!state) return;
  history.value = history.value.slice(0, historyIndex.value + 1);
  history.value.push(state);
  if (history.value.length > 20) history.value.shift();
  historyIndex.value = history.value.length - 1;
}

function restoreState(state: CanvasHistoryState, resetView = false) {
  const base = baseCanvasRef.value;
  const mask = maskCanvasRef.value;
  const paint = paintCanvasRef.value;
  if (!base || !mask || !paint) return;
  putPixels(base, state.base);
  putPixels(mask, state.mask);
  putPixels(paint, state.paint);
  imageWidth.value = state.base.width;
  imageHeight.value = state.base.height;
  if (resetView) void nextTick(fitToViewport);
}

function undo() {
  if (!canUndo.value) return;
  historyIndex.value -= 1;
  const state = history.value[historyIndex.value];
  if (state) restoreState(state, true);
}

function redo() {
  if (!canRedo.value) return;
  historyIndex.value += 1;
  const state = history.value[historyIndex.value];
  if (state) restoreState(state, true);
}

function resetBrush() {
  brushShape.value = 'circle';
  brushColor.value = '#ff0000';
  brushSize.value = 20;
  brushOpacity.value = 1;
  brushHardness.value = 1;
  brushSpacing.value = 5;
}

function selectTool(nextTool: MaskTool) {
  tool.value = nextTool;
  lastSelectionPoint.value = undefined;
  selectionBaseline.value = undefined;
  if (nextTool === 'mask' || nextTool === 'fill' || nextTool === 'select') {
    activeLayer.value = 'mask';
  } else if (nextTool === 'paint') {
    activeLayer.value = 'paint';
  }
}

function activateLayer(layer: DrawingLayer) {
  activeLayer.value = layer;
  if (layer === 'paint' && ['fill', 'mask', 'select'].includes(tool.value)) {
    tool.value = 'paint';
  }
  if (layer === 'mask' && tool.value === 'paint') tool.value = 'mask';
}

function fitToViewport() {
  const viewport = viewportRef.value;
  if (!viewport || !imageWidth.value || !imageHeight.value) return;
  const nextZoom = Math.min(
    viewport.clientWidth / imageWidth.value,
    viewport.clientHeight / imageHeight.value,
  );
  zoom.value = nextZoom;
  pan.value = {
    x: (viewport.clientWidth - imageWidth.value * zoom.value) / 2,
    y: (viewport.clientHeight - imageHeight.value * zoom.value) / 2,
  };
}

function screenPoint(event: PointerEvent | WheelEvent): Point {
  const bounds = viewportRef.value?.getBoundingClientRect();
  return {
    x: event.clientX - (bounds?.left ?? 0),
    y: event.clientY - (bounds?.top ?? 0),
  };
}

function imagePoint(event: PointerEvent): Point {
  const point = screenPoint(event);
  return {
    x: (point.x - pan.value.x) / zoom.value,
    y: (point.y - pan.value.y) / zoom.value,
  };
}

function pointInsideImage(point: Point) {
  return (
    point.x >= 0 &&
    point.y >= 0 &&
    point.x < imageWidth.value &&
    point.y < imageHeight.value
  );
}

function hexToRgb(color: string): RgbColor {
  const value = color.replace('#', '');
  return {
    b: Number.parseInt(value.slice(4, 6), 16) || 0,
    g: Number.parseInt(value.slice(2, 4), 16) || 0,
    r: Number.parseInt(value.slice(0, 2), 16) || 0,
  };
}

function squareBrushTexture(
  radius: number,
  hardness: number,
  color: RgbColor,
  opacity: number,
) {
  const size = Math.max(1, Math.ceil(radius * 2));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvasContext(canvas);
  if (!context) return canvas;
  const pixels = context.createImageData(size, size);
  const hardRadius = radius * hardness;
  const fadeRange = Math.max(0.0001, radius - hardRadius);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.max(
        Math.abs(x + 0.5 - size / 2),
        Math.abs(y + 0.5 - size / 2),
      );
      let alpha = 0;
      if (distance <= hardRadius) alpha = opacity;
      else if (distance <= radius)
        alpha = opacity * (1 - (distance - hardRadius) / fadeRange) ** 2;
      const index = (y * size + x) * 4;
      pixels.data[index] = color.r;
      pixels.data[index + 1] = color.g;
      pixels.data[index + 2] = color.b;
      pixels.data[index + 3] = alpha * 255;
    }
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}

function stampBrush(point: Point, erase: boolean) {
  const canvas =
    activeLayer.value === 'paint' ? paintCanvasRef.value : maskCanvasRef.value;
  const context = canvasContext(canvas);
  if (!context || !pointInsideImage(point)) return;
  const radius = effectiveBrushRadius.value;
  const hardness =
    (brushSize.value * brushHardness.value) / Math.max(0.0001, radius);
  const color =
    activeLayer.value === 'paint'
      ? hexToRgb(brushColor.value)
      : maskColor.value;
  context.save();
  context.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  if (brushShape.value === 'square' && hardness < 1) {
    context.drawImage(
      squareBrushTexture(radius, hardness, color, brushOpacity.value),
      point.x - radius,
      point.y - radius,
    );
  } else {
    context.beginPath();
    if (brushShape.value === 'square') {
      context.rect(point.x - radius, point.y - radius, radius * 2, radius * 2);
    } else {
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    }
    if (hardness === 1) {
      context.fillStyle = `rgb(${color.r} ${color.g} ${color.b} / ${brushOpacity.value})`;
    } else {
      const gradient = context.createRadialGradient(
        point.x,
        point.y,
        0,
        point.x,
        point.y,
        radius,
      );
      gradient.addColorStop(
        0,
        `rgb(${color.r} ${color.g} ${color.b} / ${brushOpacity.value})`,
      );
      gradient.addColorStop(
        hardness,
        `rgb(${color.r} ${color.g} ${color.b} / ${brushOpacity.value})`,
      );
      gradient.addColorStop(1, `rgb(${color.r} ${color.g} ${color.b} / 0)`);
      context.fillStyle = gradient;
    }
    context.fill();
  }
  context.restore();
}

function drawSegment(from: Point, to: Point, erase: boolean) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const stepPercentage = 100 ** (brushSpacing.value / 100) / 100;
  const spacing = Math.max(1, brushSize.value * stepPercentage);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    stampBrush(
      {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      },
      erase,
    );
  }
}

function maskPixels() {
  const canvas = maskCanvasRef.value;
  return canvas ? capturePixels(canvas) : undefined;
}

function basePixels() {
  const canvas = baseCanvasRef.value;
  return canvas ? capturePixels(canvas) : undefined;
}

function applyBucket(point: Point) {
  const canvas = maskCanvasRef.value;
  const pixels = maskPixels();
  if (!canvas || !pixels) return;
  if (
    paintBucketFill(
      pixels,
      point,
      fillTolerance.value,
      Math.floor((fillOpacity.value / 100) * 255),
      maskColor.value,
    )
  ) {
    putPixels(canvas, pixels);
    commitHistory();
  }
}

function selectionSettings() {
  return {
    applyWholeImage: applyWholeImage.value,
    maskBoundary: stopAtMask.value,
    maskTolerance: maskTolerance.value,
    method: comparisonMethod.value,
    opacity: Math.floor((selectionOpacity.value / 100) * 255),
    tolerance: selectTolerance.value,
  };
}

function applyColorSelection(point: Point, replaceHistory = false) {
  const image = basePixels();
  const canvas = maskCanvasRef.value;
  if (!image || !canvas) return;
  if (!replaceHistory || !selectionBaseline.value) {
    selectionBaseline.value = maskPixels();
  }
  const baseline = selectionBaseline.value;
  if (!baseline) return;
  const mask = clonePixels(baseline);
  if (
    !colorSelectFill(image, mask, point, selectionSettings(), maskColor.value)
  )
    return;
  putPixels(canvas, mask);
  if (replaceHistory && historyIndex.value >= 0) {
    const state = captureState();
    if (state) history.value[historyIndex.value] = state;
  } else {
    commitHistory();
  }
  lastSelectionPoint.value = { ...point };
}

function refreshLiveSelection() {
  if (
    tool.value === 'select' &&
    selectLivePreview.value &&
    lastSelectionPoint.value &&
    selectionBaseline.value
  ) {
    applyColorSelection(lastSelectionPoint.value, true);
  }
}

function startPointer(event: PointerEvent) {
  event.preventDefault();
  cursor.value = screenPoint(event);
  cursorVisible.value = true;
  if (event.pointerType === 'touch') {
    viewportRef.value?.setPointerCapture(event.pointerId);
    touchPoints.set(event.pointerId, screenPoint(event));
    if (touchPoints.size === 1) {
      panning.value = true;
      panStart.value = screenPoint(event);
      panOrigin.value = { ...pan.value };
    } else if (touchPoints.size === 2) {
      const [first, second] = [...touchPoints.values()];
      if (!first || !second) return;
      pinchStartDistance.value = Math.hypot(
        second.x - first.x,
        second.y - first.y,
      );
      pinchStartMidpoint.value = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      pinchStartZoom.value = zoom.value;
      pinchStartPan.value = { ...pan.value };
    }
    return;
  }
  const point = imagePoint(event);
  if (event.button === 1 || (event.button === 0 && spacePressed.value)) {
    panning.value = true;
    panStart.value = screenPoint(event);
    panOrigin.value = { ...pan.value };
    viewportRef.value?.setPointerCapture(event.pointerId);
    return;
  }
  if (
    event.altKey &&
    event.button === 2 &&
    ['erase', 'mask'].includes(tool.value)
  ) {
    adjustingBrush.value = true;
    adjustmentStart.value = point;
    adjustmentBrushSize.value = brushSize.value;
    adjustmentHardness.value = brushHardness.value;
    viewportRef.value?.setPointerCapture(event.pointerId);
    return;
  }
  if (!pointInsideImage(point)) return;
  if (tool.value === 'fill') {
    applyBucket(point);
    return;
  }
  if (tool.value === 'select') {
    applyColorSelection(point);
    return;
  }
  if (!['erase', 'mask', 'paint'].includes(tool.value)) return;
  if (tool.value === 'mask') activeLayer.value = 'mask';
  if (tool.value === 'paint') activeLayer.value = 'paint';
  const erase = tool.value === 'erase' || event.button === 2;
  drawing.value = true;
  viewportRef.value?.setPointerCapture(event.pointerId);
  if (event.shiftKey && lineStartPoint.value) {
    drawSegment(lineStartPoint.value, point, erase);
  } else {
    stampBrush(point, erase);
  }
  lastDrawPoint.value = point;
  lineStartPoint.value = point;
}

function movePointer(event: PointerEvent) {
  event.preventDefault();
  cursor.value = screenPoint(event);
  cursorVisible.value = true;
  if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
    touchPoints.set(event.pointerId, screenPoint(event));
    const points = [...touchPoints.values()];
    if (
      points.length === 2 &&
      pinchStartMidpoint.value &&
      pinchStartPan.value &&
      pinchStartDistance.value > 0
    ) {
      const [first, second] = points;
      if (!first || !second) return;
      const midpoint = {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      };
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      const nextZoom = Math.max(
        0.2,
        Math.min(
          10,
          pinchStartZoom.value * (distance / pinchStartDistance.value),
        ),
      );
      const worldPoint = {
        x:
          (pinchStartMidpoint.value.x - pinchStartPan.value.x) /
          pinchStartZoom.value,
        y:
          (pinchStartMidpoint.value.y - pinchStartPan.value.y) /
          pinchStartZoom.value,
      };
      zoom.value = nextZoom;
      pan.value = {
        x: midpoint.x - worldPoint.x * nextZoom,
        y: midpoint.y - worldPoint.y * nextZoom,
      };
    } else if (points.length === 1 && panStart.value && panOrigin.value) {
      const current = points[0];
      if (!current) return;
      pan.value = {
        x: panOrigin.value.x + current.x - panStart.value.x,
        y: panOrigin.value.y + current.y - panStart.value.y,
      };
    }
    return;
  }
  if (panning.value && panStart.value && panOrigin.value) {
    const current = screenPoint(event);
    pan.value = {
      x: panOrigin.value.x + current.x - panStart.value.x,
      y: panOrigin.value.y + current.y - panStart.value.y,
    };
    return;
  }
  if (adjustingBrush.value && adjustmentStart.value) {
    const point = imagePoint(event);
    const deltaX =
      Math.abs(point.x - adjustmentStart.value.x) < 5
        ? 0
        : point.x - adjustmentStart.value.x;
    const deltaY =
      Math.abs(point.y - adjustmentStart.value.y) < 5
        ? 0
        : point.y - adjustmentStart.value.y;
    brushSize.value = Math.max(
      1,
      Math.min(250, adjustmentBrushSize.value + deltaX / 35),
    );
    brushHardness.value = Math.max(
      0,
      Math.min(1, adjustmentHardness.value - deltaY / 4000),
    );
    return;
  }
  if (!drawing.value || !lastDrawPoint.value) return;
  const point = imagePoint(event);
  drawSegment(
    lastDrawPoint.value,
    point,
    tool.value === 'erase' || event.buttons === 2,
  );
  lastDrawPoint.value = point;
  lineStartPoint.value = point;
}

function endPointer(event?: PointerEvent) {
  if (event?.pointerType === 'touch') {
    touchPoints.delete(event.pointerId);
    const remaining = [...touchPoints.values()][0];
    if (remaining) {
      panStart.value = remaining;
      panOrigin.value = { ...pan.value };
    } else {
      panning.value = false;
    }
    if (viewportRef.value?.hasPointerCapture(event.pointerId)) {
      viewportRef.value.releasePointerCapture(event.pointerId);
    }
    return;
  }
  if (drawing.value) commitHistory();
  drawing.value = false;
  panning.value = false;
  adjustingBrush.value = false;
  lastDrawPoint.value = undefined;
  if (event && viewportRef.value?.hasPointerCapture(event.pointerId)) {
    viewportRef.value.releasePointerCapture(event.pointerId);
  }
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();
  const focal = screenPoint(event);
  const nextZoom = Math.max(
    0.2,
    Math.min(10, zoom.value * (event.deltaY < 0 ? 1.1 : 0.9)),
  );
  const scale = nextZoom / zoom.value;
  pan.value = {
    x: focal.x - (focal.x - pan.value.x) * scale,
    y: focal.y - (focal.y - pan.value.y) * scale,
  };
  zoom.value = nextZoom;
}

function transformAll(
  operation:
    | 'mirror-horizontal'
    | 'mirror-vertical'
    | 'rotate-left'
    | 'rotate-right',
) {
  const state = captureState();
  const base = baseCanvasRef.value;
  const mask = maskCanvasRef.value;
  const paint = paintCanvasRef.value;
  if (!state || !base || !mask || !paint) return;
  putPixels(base, transformedPixels(state.base, operation));
  putPixels(mask, transformedPixels(state.mask, operation));
  putPixels(paint, transformedPixels(state.paint, operation));
  imageWidth.value = base.width;
  imageHeight.value = base.height;
  commitHistory();
  void nextTick(fitToViewport);
}

function invertCurrentMask() {
  const canvas = maskCanvasRef.value;
  const pixels = maskPixels();
  if (!canvas || !pixels) return;
  invertMask(pixels, maskColor.value);
  putPixels(canvas, pixels);
  commitHistory();
}

function clearAll() {
  for (const canvas of [maskCanvasRef.value, paintCanvasRef.value]) {
    if (!canvas) continue;
    canvasContext(canvas)?.clearRect(0, 0, canvas.width, canvas.height);
  }
  commitHistory();
}

function updateMaskBlend() {
  const canvas = maskCanvasRef.value;
  const pixels = maskPixels();
  if (!canvas || !pixels) return;
  recolorMask(pixels, maskColor.value);
  putPixels(canvas, pixels);
}

async function toggleFullscreen() {
  try {
    await (document.fullscreenElement
      ? document.exitFullscreen()
      : document.documentElement.requestFullscreen());
  } catch {
    message.warning('当前浏览器不允许切换全屏');
  }
}

async function initializeEditor() {
  const generation = ++loadGeneration;
  history.value = [];
  historyIndex.value = -1;
  imageWidth.value = 0;
  imageHeight.value = 0;
  lineStartPoint.value = undefined;
  lastSelectionPoint.value = undefined;
  selectionBaseline.value = undefined;
  if (!props.open || !props.src) return;
  loading.value = true;
  try {
    await nextTick();
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = props.src;
    await image.decode();
    if (generation !== loadGeneration || !props.open) return;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const base = baseCanvasRef.value;
    const mask = maskCanvasRef.value;
    const paint = paintCanvasRef.value;
    if (!base || !mask || !paint) throw new Error('遮罩编辑器画布初始化失败');
    for (const canvas of [base, mask, paint]) {
      canvas.width = width;
      canvas.height = height;
    }
    const baseContext = canvasContext(base);
    const maskContext = canvasContext(mask);
    const paintContext = canvasContext(paint);
    if (!baseContext || !maskContext || !paintContext)
      throw new Error('浏览器无法创建遮罩画布');
    baseContext.clearRect(0, 0, width, height);
    baseContext.drawImage(image, 0, 0, width, height);
    paintContext.clearRect(0, 0, width, height);
    const sourcePixels = baseContext.getImageData(0, 0, width, height);
    const maskPixels = maskContext.createImageData(width, height);
    for (let index = 0; index < sourcePixels.data.length; index += 4) {
      maskPixels.data[index] = maskColor.value.r;
      maskPixels.data[index + 1] = maskColor.value.g;
      maskPixels.data[index + 2] = maskColor.value.b;
      maskPixels.data[index + 3] = 255 - (sourcePixels.data[index + 3] ?? 255);
    }
    maskContext.putImageData(maskPixels, 0, 0);
    imageWidth.value = width;
    imageHeight.value = height;
    imageSource.value = props.src;
    commitHistory();
    await nextTick();
    fitToViewport();
  } catch (error) {
    message.error((error as Error).message || '图片读取失败');
    closeEditor();
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('遮罩图片导出失败'));
    }, 'image/png');
  });
}

async function save() {
  const base = baseCanvasRef.value;
  const mask = maskCanvasRef.value;
  if (!base || !mask) return;
  saving.value = true;
  try {
    const output = document.createElement('canvas');
    output.width = base.width;
    output.height = base.height;
    const context = canvasContext(output);
    if (!context) throw new Error('浏览器无法创建遮罩输出');
    context.drawImage(base, 0, 0);
    if (paintCanvasRef.value) context.drawImage(paintCanvasRef.value, 0, 0);
    const outputPixels = context.getImageData(
      0,
      0,
      output.width,
      output.height,
    );
    const maskPixels = canvasContext(mask)?.getImageData(
      0,
      0,
      mask.width,
      mask.height,
    );
    if (!maskPixels) throw new Error('浏览器无法读取遮罩图层');
    for (let index = 0; index < outputPixels.data.length; index += 4) {
      outputPixels.data[index + 3] = 255 - (maskPixels.data[index + 3] ?? 0);
    }
    context.putImageData(outputPixels, 0, 0);
    const blob = await canvasBlob(output);
    const basename = (props.title || 'workflow-output')
      .replace(/\.[^.]+$/, '')
      .replaceAll(/[^\p{L}\p{N}._-]+/gu, '-');
    await props.onSave(
      new File([blob], `${basename}-mask-${Date.now()}.png`, {
        type: 'image/png',
      }),
    );
    closeEditor();
  } catch (error) {
    message.error((error as Error).message || '遮罩资产保存失败');
  } finally {
    saving.value = false;
  }
}

function keyDown(event: KeyboardEvent) {
  if (!props.open) return;
  if (event.key === ' ') {
    event.preventDefault();
    spacePressed.value = true;
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
  if ((event.ctrlKey || event.metaKey) && !event.altKey) {
    const key = event.key.toUpperCase();
    if ((key === 'Y' && !event.shiftKey) || (key === 'Z' && event.shiftKey)) {
      event.preventDefault();
      redo();
    } else if (key === 'Z') {
      event.preventDefault();
      undo();
    }
  }
}

function keyUp(event: KeyboardEvent) {
  if (event.key === ' ') spacePressed.value = false;
}

watch(() => [props.open, props.src], initializeEditor, { immediate: true });
watch(maskBlendMode, updateMaskBlend);
watch(
  [selectTolerance, selectionOpacity, comparisonMethod],
  refreshLiveSelection,
);
onMounted(() => {
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  resizeObserver = new ResizeObserver(() => {
    if (props.open && imageWidth.value && !drawing.value) fitToViewport();
  });
  if (viewportRef.value) resizeObserver.observe(viewportRef.value);
});
onBeforeUnmount(() => {
  loadGeneration += 1;
  window.removeEventListener('keydown', keyDown);
  window.removeEventListener('keyup', keyUp);
  resizeObserver?.disconnect();
});
</script>

<template>
  <Modal
    :closable="false"
    :footer="null"
    :keyboard="false"
    :mask-closable="false"
    :open="open"
    width="100vw"
    wrap-class-name="comfy-mask-editor-modal"
    @cancel="closeEditor"
  >
    <section class="comfy-mask-editor-shell" @contextmenu.prevent>
      <header class="mask-editor-topbar">
        <div class="mask-editor-title">遮罩编辑器</div>
        <div class="mask-editor-top-tools">
          <button :disabled="!canUndo" title="撤销" @click="undo">
            <svg viewBox="0 0 15 15">
              <path
                d="M8.77 12.18a.46.46 0 1 1 0-.92 2.67 2.67 0 0 0 0-5.34H4.2l1.43 1.43a.46.46 0 0 1-.64.64L2.78 5.78a.45.45 0 0 1 0-.64l2.21-2.21a.46.46 0 0 1 .64.64L4.2 5h3.98c2.45 0 4.17 1.47 4.17 3.58a3.59 3.59 0 0 1-3.58 3.6Z"
              />
            </svg>
          </button>
          <button :disabled="!canRedo" title="重做" @click="redo">
            <svg viewBox="0 0 15 15">
              <path
                d="M6.23 12.18a3.59 3.59 0 0 1-3.58-3.58c0-2.11 1.71-3.58 4.17-3.58h3.98L9.37 3.59a.46.46 0 0 1 .64-.64l2.21 2.21a.45.45 0 0 1 0 .64l-2.21 2.21a.46.46 0 0 1-.64-.64l1.43-1.43H6.82c-1.92 0-3.26 1.1-3.26 2.67a2.67 2.67 0 0 0 2.67 2.67.46.46 0 1 1 0 .9Z"
              />
            </svg>
          </button>
          <i></i>
          <button title="向左旋转" @click="transformAll('rotate-left')">
            <IconifyIcon icon="lucide:rotate-ccw" />
          </button>
          <button title="向右旋转" @click="transformAll('rotate-right')">
            <IconifyIcon icon="lucide:rotate-cw" />
          </button>
          <button title="水平翻转" @click="transformAll('mirror-horizontal')">
            <svg viewBox="0 0 15 15">
              <path
                d="M7 2a.5.5 0 0 1 1 0v11a.5.5 0 0 1-1 0V2ZM3.5 4.5l-2 3 2 3v-6Zm8 0v6l2-3-2-3Z"
              />
            </svg>
          </button>
          <button title="垂直翻转" @click="transformAll('mirror-vertical')">
            <svg viewBox="0 0 15 15">
              <path
                d="M2 7.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5Zm2.5-3 3-2 3 2h-6Zm0 6h6l-3 2-3-2Z"
              />
            </svg>
          </button>
          <i></i>
          <button class="text-tool" @click="invertCurrentMask">反转</button>
          <button class="text-tool" @click="clearAll">清除</button>
          <button class="save-tool" :disabled="saving" @click="save">
            <IconifyIcon icon="lucide:check" />
            {{ saving ? '保存中' : '保存' }}
          </button>
          <button class="cancel-tool" @click="closeEditor">
            <IconifyIcon icon="lucide:x" />
            取消
          </button>
        </div>
        <div class="mask-editor-window-tools">
          <button title="切换全屏" @click="toggleFullscreen">
            <IconifyIcon icon="lucide:panel-top-open" />
          </button>
          <button title="关闭遮罩编辑器" @click="closeEditor">
            <IconifyIcon icon="lucide:x" />
          </button>
        </div>
      </header>

      <div class="mask-editor-body">
        <aside class="mask-tool-rail" aria-label="遮罩工具">
          <button
            :class="{ active: tool === 'mask' }"
            title="遮罩画笔"
            @click="selectTool('mask')"
          >
            <svg viewBox="0 0 44 44">
              <path
                d="M10.97 15.98v14.04c0 .825.675 1.5 1.5 1.5h23.07c.825 0 1.5-.675 1.5-1.5V15.98c0-.825-.675-1.5-1.5-1.5H12.47c-.825 0-1.5.675-1.5 1.5Zm14.82 12.18c-4.365 1.41-8.355-2.58-6.945-6.945.51-1.575 1.785-2.85 3.36-3.36 4.365-1.41 8.355 2.58 6.945 6.945-.51 1.575-1.785 2.85-3.36 3.36Z"
              />
            </svg>
          </button>
          <button
            :class="{ active: tool === 'paint' }"
            title="绘画画笔"
            @click="selectTool('paint')"
          >
            <svg viewBox="0 0 44 44">
              <path
                d="M34 13.93c0 .47-.19.94-.55 1.31L20.43 28.28l-.27.22a2.62 2.62 0 0 0-2.61-2.49c.07-.12.16-.24.27-.34l13.04-13.04a1.84 1.84 0 0 1 3.14 1.3ZM19.64 29.03c0 4.46-6.46 3.18-9.64 0 3.3-.47 4.75-2.58 7.06-2.58a2.58 2.58 0 0 1 2.58 2.58Z"
              />
            </svg>
          </button>
          <button
            :class="{ active: tool === 'erase' }"
            title="橡皮"
            @click="selectTool('erase')"
          >
            <svg viewBox="0 0 44 44">
              <path
                d="M17.27 34.27c-.42 0-.85-.16-1.17-.48l-5.88-5.88a1.65 1.65 0 0 1 0-2.34l15.34-15.34a1.65 1.65 0 0 1 2.34 0l5.88 5.88c.65.65.65 1.7 0 2.34L18.44 33.79c-.32.32-.75.48-1.17.48Z"
              />
            </svg>
          </button>
          <button
            :class="{ active: tool === 'fill' }"
            title="填充"
            @click="selectTool('fill')"
          >
            <svg viewBox="0 0 44 44">
              <path
                d="m33.4 21.76-11.42 11.41a1.56 1.56 0 0 1-2.25.05l-8.91-8.91a1.56 1.56 0 0 1 0-2.21l.34-.34H33.4Zm-.64 2.23s-1.52 2.02-1.52 2.86a1.52 1.52 0 1 0 3.04 0c0-.84-1.52-2.86-1.52-2.86Z"
              />
              <path
                d="M20.83 34.17c-.55 0-1.07-.21-1.46-.6l-8.91-8.91a2.07 2.07 0 0 1 0-2.92l11.31-11.31a2.07 2.07 0 0 1 2.92 0l8.91 8.91c.8.8.8 2.12 0 2.92L22.29 33.57c-.39.39-.91.6-1.46.6Z"
                fill="none"
                stroke="currentColor"
              />
            </svg>
          </button>
          <button
            :class="{ active: tool === 'select' }"
            title="颜色选取"
            @click="selectTool('select')"
          >
            <svg viewBox="0 0 44 44">
              <path
                d="M30.29 13.72a2.78 2.78 0 0 0-3.94 0l-2.88 2.88-.75-.75a.5.5 0 0 0-.71.71l1.4 1.4-9.59 9.59a1.87 1.87 0 0 0-.49 1.73l-.15.13a.99.99 0 0 0 1.4 1.4l.11-.13a1.87 1.87 0 0 0 1.77-.49l9.59-9.59 1.38 1.38a.5.5 0 0 0 .7-.71l-.71-.72 2.88-2.89a2.78 2.78 0 0 0-.01-3.94Zm-10.86 12.1h-2.46l7.15-7.15 1.23 1.23-5.92 5.92Z"
              />
            </svg>
          </button>
          <div
            class="mask-zoom-readout"
            title="点击适应窗口"
            @click="fitToViewport"
          >
            <strong>{{ zoomLabel }}</strong>
            <small>{{ dimensionsLabel }}</small>
          </div>
        </aside>

        <div
          ref="viewportRef"
          class="mask-editor-viewport"
          :class="{ panning }"
          @pointercancel="endPointer"
          @pointerdown="startPointer"
          @pointerenter="cursorVisible = true"
          @pointerleave="cursorVisible = false"
          @pointermove="movePointer"
          @pointerup="endPointer"
          @wheel="handleWheel"
        >
          <div v-if="loading" class="mask-editor-loading">
            <IconifyIcon icon="lucide:loader-circle" />
            正在读取图片
          </div>
          <div
            v-show="!loading && imageWidth"
            class="mask-canvas-stack"
            :style="[layerStackStyle, canvasBackgroundStyle]"
          >
            <canvas
              ref="baseCanvasRef"
              :style="{ opacity: baseVisible ? 1 : 0 }"
            ></canvas>
            <canvas
              ref="paintCanvasRef"
              :style="{ opacity: paintVisible ? 1 : 0 }"
            ></canvas>
            <canvas ref="maskCanvasRef" :style="maskLayerStyle"></canvas>
          </div>
          <div class="mask-brush-cursor" :style="cursorStyle">
            <i :style="cursorGradientStyle"></i>
          </div>
          <div class="mask-tool-cursor" :style="toolCursorStyle">
            <IconifyIcon
              :icon="tool === 'fill' ? 'lucide:paint-bucket' : 'lucide:pipette'"
            />
          </div>
        </div>

        <aside class="mask-settings-panel">
          <section v-if="tool === 'fill'" class="tool-settings">
            <h3>填充设置</h3>
            <label class="simple-slider">
              <span>阈值</span>
              <input
                v-model.number="fillTolerance"
                max="255"
                min="0"
                type="range"
              />
            </label>
            <label class="simple-slider">
              <span>填充不透明度</span>
              <input
                v-model.number="fillOpacity"
                max="100"
                min="0"
                type="range"
              />
            </label>
          </section>

          <section v-else-if="tool === 'select'" class="tool-settings">
            <h3>色彩选取设置</h3>
            <label class="simple-slider">
              <span>阈值</span>
              <input
                v-model.number="selectTolerance"
                max="255"
                min="0"
                type="range"
              />
            </label>
            <label class="simple-slider">
              <span>选取不透明度</span>
              <input
                v-model.number="selectionOpacity"
                max="100"
                min="0"
                type="range"
              />
            </label>
            <label class="toggle-row">
              <span>实时预览</span>
              <input v-model="selectLivePreview" type="checkbox" />
              <i></i>
            </label>
            <label class="toggle-row">
              <span>应用到图像整体</span>
              <input v-model="applyWholeImage" type="checkbox" />
              <i></i>
            </label>
            <label class="dropdown-row">
              <span>方法</span>
              <select v-model="comparisonMethod">
                <option value="simple">simple</option>
                <option value="hsl">hsl</option>
                <option value="lab">lab</option>
              </select>
            </label>
            <label class="toggle-row">
              <span>遇到遮罩时停止</span>
              <input v-model="stopAtMask" type="checkbox" />
              <i></i>
            </label>
            <label class="simple-slider">
              <span>遮罩阈值</span>
              <input
                v-model.number="maskTolerance"
                max="255"
                min="0"
                type="range"
              />
            </label>
          </section>

          <section v-else class="tool-settings brush-settings">
            <h3>笔刷设置</h3>
            <button class="reset-brush" @click="resetBrush">重置为默认</button>
            <label>笔刷形状</label>
            <div class="brush-shapes">
              <button
                :class="{ active: brushShape === 'circle' }"
                title="圆形笔刷"
                @click="brushShape = 'circle'"
              >
                <i class="circle"></i>
              </button>
              <button
                :class="{ active: brushShape === 'square' }"
                title="方形笔刷"
                @click="brushShape = 'square'"
              >
                <i class="square"></i>
              </button>
            </div>
            <label>
              色彩选取
              <input v-model="brushColor" type="color" />
            </label>
            <label class="range-label">
              <span>
                厚度
                <input
                  v-model.number="brushSize"
                  max="250"
                  min="1"
                  type="number"
                />
              </span>
              <input
                :value="Math.log(brushSize) / Math.log(250)"
                max="1"
                min="0"
                step="0.001"
                type="range"
                @input="
                  brushSize = Math.round(
                    250 ** Number(($event.target as HTMLInputElement).value),
                  )
                "
              />
            </label>
            <label class="range-label">
              <span>
                不透明度
                <input
                  v-model.number="brushOpacity"
                  max="1"
                  min="0"
                  step="0.01"
                  type="number"
                />
              </span>
              <input
                v-model.number="brushOpacity"
                max="1"
                min="0"
                step="0.01"
                type="range"
              />
            </label>
            <label class="range-label">
              <span>
                硬度
                <input
                  v-model.number="brushHardness"
                  max="1"
                  min="0"
                  step="0.01"
                  type="number"
                />
              </span>
              <input
                v-model.number="brushHardness"
                max="1"
                min="0"
                step="0.01"
                type="range"
              />
            </label>
            <label class="range-label">
              <span>
                间距
                <input
                  v-model.number="brushSpacing"
                  max="100"
                  min="1"
                  type="number"
                />
              </span>
              <input
                v-model.number="brushSpacing"
                max="100"
                min="1"
                type="range"
              />
            </label>
          </section>

          <section class="layer-settings">
            <h3>图层</h3>
            <label class="simple-slider">
              <span>遮罩不透明度</span>
              <input
                v-model.number="maskOpacity"
                max="1"
                min="0"
                step="0.01"
                type="range"
              />
            </label>
            <label class="dropdown-row blend-row">
              <span>遮罩混合设置</span>
              <select v-model="maskBlendMode">
                <option value="black">黑</option>
                <option value="white">白</option>
                <option value="negative">负片</option>
              </select>
            </label>
            <label class="layer-label">遮罩层</label>
            <div :class="{ active: activeLayer === 'mask' }" class="layer-card">
              <input v-model="maskVisible" type="checkbox" />
              <svg viewBox="0 0 20 20">
                <path
                  d="M1.31 5.32v9.36c0 .55.45 1 1 1h15.38c.55 0 1-.45 1-1V5.32c0-.55-.45-1-1-1H2.31c-.55 0-1 .45-1 1Zm9.88 8.12c-2.91.94-5.57-1.72-4.63-4.63.34-1.05 1.19-1.9 2.24-2.24 2.91-.94 5.57 1.72 4.63 4.63-.34 1.05-1.19 1.9-2.24 2.24Z"
                />
              </svg>
              <button
                :disabled="activeLayer === 'mask'"
                @click="activateLayer('mask')"
              >
                {{ activeLayer === 'mask' ? '活跃层' : '激活层' }}
              </button>
            </div>
            <label class="layer-label">绘画层</label>
            <div
              :class="{ active: activeLayer === 'paint' }"
              class="layer-card"
            >
              <input v-model="paintVisible" type="checkbox" />
              <svg viewBox="0 0 20 20">
                <path
                  d="M17 6.965c0 .235-.095.47-.275.655l-6.51 6.52-.135.11a1.31 1.31 0 0 0-1.305-1.245l.135-.17 6.52-6.52a.92.92 0 0 1 1.575.65ZM9.82 14.515c0 2.23-3.23 1.59-4.82 0 1.65-.235 2.375-1.29 3.53-1.29.715 0 1.29.58 1.29 1.29Z"
                />
              </svg>
              <button
                v-show="tool === 'erase' || activeLayer === 'paint'"
                :disabled="activeLayer === 'paint'"
                @click="activateLayer('paint')"
              >
                {{ activeLayer === 'paint' ? '活跃层' : '激活层' }}
              </button>
            </div>
            <label class="layer-label">基础图像层</label>
            <div class="layer-card base-layer">
              <input v-model="baseVisible" type="checkbox" />
              <img alt="基础图像层" :src="imageSource" />
            </div>
          </section>
        </aside>
      </div>
    </section>
  </Modal>
</template>

<style scoped>
:global(.comfy-mask-editor-modal) {
  padding: 0;
}

:global(.comfy-mask-editor-modal .ant-modal) {
  top: 0;
  max-width: none;
  height: 100vh;
  padding: 0;
  margin: 0;
}

:global(.comfy-mask-editor-modal .ant-modal-content),
:global(.comfy-mask-editor-modal .ant-modal-body) {
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: #15171a;
  border-radius: 0;
}

.comfy-mask-editor-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: #e8e8e8;
  user-select: none;
  background: #15171a;
}

.mask-editor-topbar {
  z-index: 5;
  display: flex;
  gap: 14px;
  align-items: center;
  min-height: 54px;
  padding: 7px 8px;
  background: #17191d;
  border-bottom: 1px solid #292c31;
}

.mask-editor-title {
  font-size: 17px;
  font-weight: 650;
  white-space: nowrap;
}

.mask-editor-top-tools {
  display: flex;
  gap: 10px;
  align-items: center;
}

.mask-editor-top-tools button {
  display: flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  width: 50px;
  height: 30px;
  color: #e7e7e7;
  cursor: pointer;
  background: #202328;
  border: 1px solid #484b51;
  border-radius: 10px;
}

.mask-editor-top-tools button:hover {
  background: #30343a;
}

.mask-editor-top-tools button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.mask-editor-top-tools button svg {
  width: 25px;
  height: 25px;
  fill: currentcolor;
}

.mask-editor-top-tools > i {
  width: 1px;
  height: 20px;
  margin: 0 2px;
  background: #484b51;
}

.mask-editor-top-tools button.text-tool {
  width: 60px;
  font-size: 13px;
}

.mask-editor-top-tools button.save-tool {
  width: auto;
  padding: 0 11px;
  color: #fff;
  background: #078cea;
  border-color: #078cea;
  border-radius: 6px;
}

.mask-editor-top-tools button.cancel-tool {
  width: auto;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
}

.mask-editor-window-tools {
  display: flex;
  gap: 12px;
  margin-left: auto;
}

.mask-editor-window-tools button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: #aeb2b8;
  background: transparent;
  border: 0;
}

.mask-editor-window-tools button:hover {
  color: #fff;
}

.mask-editor-body {
  display: grid;
  flex: 1;
  grid-template-columns: 64px minmax(0, 1fr) 220px;
  min-height: 0;
}

.mask-tool-rail {
  z-index: 3;
  display: flex;
  flex-direction: column;
  background: #17191d;
}

.mask-tool-rail > button {
  position: relative;
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  color: #aeb2b8;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.mask-tool-rail > button:hover {
  background: #25282d;
}

.mask-tool-rail > button.active {
  color: #58a9ff;
  background: #25282d;
}

.mask-tool-rail > button.active::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  content: '';
  background: #4299f7;
}

.mask-tool-rail svg {
  width: 48px;
  height: 48px;
  fill: currentcolor;
}

.mask-zoom-readout {
  display: flex;
  flex-direction: column;
  gap: 1px;
  align-items: center;
  padding: 8px 1px;
  margin-top: auto;
  font-size: 12px;
  color: #aeb2b8;
  cursor: pointer;
}

.mask-zoom-readout small {
  font-size: 12px;
}

.mask-editor-viewport {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
  cursor: none;
  background: #15171a;
}

.mask-editor-viewport.panning {
  cursor: grabbing;
}

.mask-canvas-stack {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  transform-origin: top left;
}

.mask-canvas-stack canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.mask-editor-loading {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: center;
  color: #b8bbc1;
  background: #15171a;
}

.mask-editor-loading svg {
  animation: mask-spin 1s linear infinite;
}

.mask-brush-cursor {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  outline: 1px dashed #000;
  box-shadow: 0 0 0 1px #fff;
}

.mask-brush-cursor i {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}

.mask-tool-cursor {
  position: absolute;
  z-index: 10;
  place-items: center;
  width: 30px;
  height: 30px;
  font-size: 25px;
  color: #f0f0f0;
  pointer-events: none;
  filter: drop-shadow(0 1px 1px #000);
}

.mask-settings-panel {
  min-height: 0;
  padding: 0 12px 20px;
  overflow-y: auto;
  color: #d9dadd;
  background: #17191d;
  border-left: 1px solid #292c31;
}

.mask-settings-panel section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 14px;
}

.mask-settings-panel h3 {
  margin: 10px 0 3px;
  font-size: 15px;
  font-weight: 600;
  text-align: center;
}

.mask-settings-panel label {
  font-size: 12px;
  color: #b3b5ba;
}

.reset-brush {
  align-self: center;
  width: 128px;
  height: 30px;
  color: #e6e7e8;
  cursor: pointer;
  background: #1d2024;
  border: 1px solid #60636a;
  border-radius: 10px;
}

.brush-shapes {
  display: flex;
  align-items: center;
  height: 50px;
  padding: 0 8px;
  background: #26292e;
  border-radius: 10px;
}

.brush-shapes button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 42px;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.brush-shapes button i {
  display: block;
  width: 35px;
  height: 35px;
  background: transparent;
  border: 1px solid #555960;
}

.brush-shapes button i.circle {
  border-radius: 50%;
}

.brush-shapes button.active i {
  background: #58a9ff;
}

.brush-settings > label:not(.range-label) {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.brush-settings input[type='color'] {
  width: 48px;
  height: 39px;
  padding: 3px;
  cursor: pointer;
  background: #292c31;
  border: 1px solid #777b82;
  border-radius: 6px;
}

.range-label,
.simple-slider {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.range-label > span {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.range-label input[type='number'] {
  width: 58px;
  height: 28px;
  padding: 0 7px;
  color: #e7e8ea;
  text-align: center;
  background: #1d2024;
  border: 1px solid #555960;
  border-radius: 6px;
}

.mask-settings-panel input[type='range'] {
  width: 100%;
  accent-color: #80bfff;
}

.toggle-row,
.dropdown-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 30px;
}

.toggle-row input {
  position: absolute;
  visibility: hidden;
}

.toggle-row i {
  position: relative;
  width: 40px;
  height: 24px;
  cursor: pointer;
  background: #585b62;
  border-radius: 16px;
}

.toggle-row i::before {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 16px;
  height: 16px;
  content: '';
  background: #eee;
  border-radius: 50%;
  transition: left 0.2s;
}

.toggle-row input:checked + i {
  background: #3794f6;
}

.toggle-row input:checked + i::before {
  left: 20px;
  background: #1b1e22;
}

.dropdown-row select {
  height: 25px;
  padding: 0 6px;
  color: #e5e6e8;
  background: #111317;
  border: 1px solid #555960;
  border-radius: 6px;
}

.layer-settings {
  padding-top: 10px;
  border-top: 2px solid #3c3f45;
}

.blend-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.blend-row select {
  align-self: flex-start;
}

.layer-label {
  margin-bottom: -7px;
}

.layer-card {
  display: grid;
  grid-template-columns: 25px 40px 1fr;
  gap: 8px;
  align-items: center;
  height: 50px;
  padding: 0 8px;
  background: #292c31;
  border: 2px solid transparent;
  border-radius: 10px;
}

.layer-card.active {
  border-color: #168cff;
}

.layer-card input {
  accent-color: #168cff;
}

.layer-card svg,
.layer-card img {
  width: 40px;
  height: 30px;
  object-fit: contain;
  fill: #f3f3f3;
}

.layer-card button {
  font-size: 12px;
  color: #e3e4e6;
  background: transparent;
  border: 0;
}

.layer-card button:disabled {
  opacity: 0.55;
}

.base-layer {
  grid-template-columns: 25px 40px 1fr;
}

@keyframes mask-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .mask-editor-title {
    display: none;
  }

  .mask-editor-topbar {
    overflow-x: auto;
  }

  .mask-editor-window-tools {
    display: none;
  }

  .mask-editor-body {
    grid-template-columns: 52px minmax(0, 1fr);
  }

  .mask-tool-rail > button {
    width: 52px;
    height: 52px;
  }

  .mask-settings-panel {
    display: none;
  }
}
</style>
