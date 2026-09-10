<script lang="ts" setup>
import type { Material, Object3D } from 'three';

import type { ModelExportFormat } from './model3d-export';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  Sphere,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

import { exportModel, modelExportFormats } from './model3d-export';

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    format?: string;
    name: string;
    url: string;
  }>(),
  { compact: false, format: undefined },
);
const exporting = ref(false);
const exportError = ref('');

type Panel = 'camera' | 'control' | 'export' | 'light' | 'model' | 'scene';
type ViewerStatus = 'error' | 'loading' | 'ready';

const root = ref<HTMLElement>();
const viewport = ref<HTMLElement>();
const status = ref<ViewerStatus>('loading');
const errorMessage = ref('');
const activePanel = ref<Panel>('scene');
const gridVisible = ref(true);
const autoRotate = ref(false);
const backgroundColor = ref('#302020');
const lightIntensity = ref(3);
const cameraFov = ref(45);
const wireframe = ref(false);
const meshCount = ref(0);
const vertexCount = ref(0);
const fullscreen = ref(false);

let renderer: undefined | WebGLRenderer;
let scene: Scene | undefined;
let camera: PerspectiveCamera | undefined;
let controls: OrbitControls | undefined;
let grid: GridHelper | undefined;
let ambientLight: AmbientLight | undefined;
let keyLight: DirectionalLight | undefined;
let fillLight: DirectionalLight | undefined;
let modelRoot: Object3D | undefined;
let resizeObserver: ResizeObserver | undefined;
let animationFrame = 0;
let loadGeneration = 0;
let destroyed = false;

const panels: { icon: string; key: Panel; label: string }[] = [
  { icon: 'lucide:image', key: 'scene', label: '场景' },
  { icon: 'lucide:box', key: 'model', label: '模型' },
  { icon: 'lucide:camera', key: 'camera', label: '摄影机' },
  { icon: 'lucide:sun', key: 'light', label: '灯光' },
  { icon: 'lucide:move-3d', key: 'control', label: '控制' },
  { icon: 'lucide:download', key: 'export', label: '导出' },
];

const format = computed(() => {
  if (props.format) return props.format.toLowerCase().replace(/^\./, '');
  const match = props.name.toLowerCase().match(/\.([a-z\d]+)$/);
  return match?.[1] ?? '';
});

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    if (value instanceof Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

function disposeObject(object?: Object3D) {
  object?.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.geometry) return;
    mesh.geometry.dispose();
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) disposeMaterial(material);
  });
}

function clearModel() {
  if (modelRoot && scene) scene.remove(modelRoot);
  disposeObject(modelRoot);
  modelRoot = undefined;
  meshCount.value = 0;
  vertexCount.value = 0;
}

function updateViewport() {
  if (!viewport.value || !renderer || !camera) return;
  const width = Math.max(viewport.value.clientWidth, 1);
  const height = Math.max(viewport.value.clientHeight, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function fitModel() {
  if (!modelRoot || !camera || !controls) return;
  const bounds = new Box3().setFromObject(modelRoot);
  if (bounds.isEmpty()) return;
  const sphere = bounds.getBoundingSphere(new Sphere());
  const radius = Math.max(sphere.radius, 0.1);
  const distance = radius / Math.sin((camera.fov * Math.PI) / 360);
  camera.position.copy(
    sphere.center
      .clone()
      .add(new Vector3(distance * 0.72, distance * 0.5, distance)),
  );
  camera.near = Math.max(radius / 100, 0.001);
  camera.far = Math.max(radius * 100, 1000);
  camera.updateProjectionMatrix();
  controls.target.copy(sphere.center);
  controls.minDistance = radius * 0.05;
  controls.maxDistance = radius * 20;
  controls.update();
}

function updateModelInfo(object: Object3D) {
  let meshes = 0;
  let vertices = 0;
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.geometry) return;
    meshes += 1;
    vertices += mesh.geometry.getAttribute('position')?.count ?? 0;
  });
  meshCount.value = meshes;
  vertexCount.value = vertices;
}

function applyWireframe() {
  modelRoot?.traverse((child) => {
    if (!('material' in child) || !child.material) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if ('wireframe' in material) material.wireframe = wireframe.value;
    }
  });
}

function addLoadedModel(object: Object3D, generation: number) {
  if (generation !== loadGeneration || !scene) {
    disposeObject(object);
    return;
  }
  clearModel();
  modelRoot = object;
  scene.add(object);
  updateModelInfo(object);
  applyWireframe();
  fitModel();
  status.value = 'ready';
}

function loadModel() {
  const generation = ++loadGeneration;
  status.value = 'loading';
  errorMessage.value = '';
  exportError.value = '';
  clearModel();
  const onError = (error: unknown) => {
    if (generation !== loadGeneration) return;
    console.error('3D model loading failed', error);
    status.value = 'error';
    errorMessage.value = '模型读取失败，请检查文件格式或下载后查看';
  };
  try {
    if (format.value === 'glb' || format.value === 'gltf') {
      new GLTFLoader().load(
        props.url,
        (result) => addLoadedModel(result.scene, generation),
        undefined,
        onError,
      );
      return;
    }
    if (format.value === 'obj') {
      new OBJLoader().load(
        props.url,
        (result) => addLoadedModel(result, generation),
        undefined,
        onError,
      );
      return;
    }
    if (format.value === 'fbx') {
      new FBXLoader().load(
        props.url,
        (result) => addLoadedModel(result, generation),
        undefined,
        onError,
      );
      return;
    }
    if (format.value === 'stl') {
      new STLLoader().load(
        props.url,
        (geometry) => {
          geometry.computeVertexNormals();
          const group = new Group();
          group.add(
            new Mesh(
              geometry,
              new MeshStandardMaterial({ color: '#d9d9d9', roughness: 0.72 }),
            ),
          );
          addLoadedModel(group, generation);
        },
        undefined,
        onError,
      );
      return;
    }
    if (format.value === 'ply') {
      new PLYLoader().load(
        props.url,
        (geometry) => {
          geometry.computeVertexNormals();
          const group = new Group();
          if (geometry.index) {
            group.add(
              new Mesh(
                geometry,
                new MeshStandardMaterial({
                  color: '#d9d9d9',
                  roughness: 0.72,
                  vertexColors: Boolean(geometry.getAttribute('color')),
                }),
              ),
            );
          } else {
            group.add(
              new Points(
                geometry,
                new PointsMaterial({
                  color: '#e6e6e6',
                  size: 0.015,
                  vertexColors: Boolean(geometry.getAttribute('color')),
                }),
              ),
            );
          }
          addLoadedModel(group, generation);
        },
        undefined,
        onError,
      );
      return;
    }
    status.value = 'error';
    errorMessage.value = `暂不支持在线预览 .${format.value || '未知'} 格式`;
  } catch (error) {
    onError(error);
  }
}

function renderFrame() {
  if (destroyed) return;
  animationFrame = requestAnimationFrame(renderFrame);
  if (!renderer || !scene || !camera || !controls) return;
  controls.autoRotate = autoRotate.value;
  controls.update();
  renderer.render(scene, camera);
}

function initialize() {
  if (!viewport.value) return;
  scene = new Scene();
  scene.background = new Color(backgroundColor.value);
  camera = new PerspectiveCamera(cameraFov.value, 1, 0.01, 10_000);
  camera.position.set(3, 2, 4);
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: false });
  } catch (error) {
    console.error('WebGL renderer initialization failed', error);
    status.value = 'error';
    errorMessage.value = '浏览器无法创建 WebGL 画布，请启用硬件加速后重试';
    return;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  viewport.value.append(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 2;

  grid = new GridHelper(20, 20, '#87909a', '#555d66');
  scene.add(grid);
  ambientLight = new AmbientLight('#ffffff', 0.9);
  keyLight = new DirectionalLight('#ffffff', lightIntensity.value);
  keyLight.position.set(4, 8, 6);
  fillLight = new DirectionalLight('#a9c7ff', lightIntensity.value * 0.45);
  fillLight.position.set(-5, 3, -4);
  scene.add(ambientLight, keyLight, fillLight);

  resizeObserver = new ResizeObserver(updateViewport);
  resizeObserver.observe(viewport.value);
  updateViewport();
  renderFrame();
  loadModel();
}

function updateLighting() {
  if (keyLight) keyLight.intensity = lightIntensity.value;
  if (fillLight) fillLight.intensity = lightIntensity.value * 0.45;
}

function resetCamera() {
  fitModel();
}

async function toggleFullscreen() {
  if (!root.value) return;
  await (document.fullscreenElement
    ? document.exitFullscreen()
    : root.value.requestFullscreen());
}

async function downloadFormat(targetFormat: ModelExportFormat) {
  if (!modelRoot || exporting.value || status.value !== 'ready') return;
  exporting.value = true;
  exportError.value = '';
  const generation = loadGeneration;
  const name = props.name.replace(
    /\.(glb|gltf|obj|fbx|stl|ply|step|stp)$/i,
    '',
  );
  try {
    const blob = await exportModel(modelRoot, targetFormat);
    if (destroyed || generation !== loadGeneration) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name}.${targetFormat}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    if (generation === loadGeneration) {
      exportError.value =
        error instanceof Error ? error.message : '模型导出失败，请重试';
    }
  } finally {
    exporting.value = false;
  }
}

function downloadOriginal() {
  const anchor = document.createElement('a');
  anchor.href = props.url;
  anchor.download = props.name;
  anchor.rel = 'noopener';
  anchor.target = '_blank';
  anchor.click();
}

function handleFullscreenChange() {
  fullscreen.value = document.fullscreenElement === root.value;
  nextTick(updateViewport);
}

watch(
  () => props.url,
  () => {
    if (renderer) loadModel();
  },
);
watch(backgroundColor, (value) => {
  if (scene?.background instanceof Color) scene.background.set(value);
});
watch(gridVisible, (value) => {
  if (grid) grid.visible = value;
});
watch(lightIntensity, updateLighting);
watch(cameraFov, (value) => {
  if (!camera) return;
  camera.fov = value;
  camera.updateProjectionMatrix();
});
watch(wireframe, applyWireframe);

watch(
  viewport,
  (element) => {
    if (element && !renderer) initialize();
  },
  { flush: 'post' },
);

document.addEventListener('fullscreenchange', handleFullscreenChange);

onBeforeUnmount(() => {
  destroyed = true;
  loadGeneration += 1;
  cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  controls?.dispose();
  clearModel();
  scene?.clear();
  scene = undefined;
  camera = undefined;
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer?.domElement.remove();
  renderer = undefined;
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
});
</script>

<template>
  <div
    ref="root"
    :class="{ 'is-compact': compact, 'is-fullscreen': fullscreen }"
    :data-model-status="status"
    class="model3d-viewer"
  >
    <div ref="viewport" class="model3d-viewport"></div>

    <div class="model3d-toolbar" role="toolbar" aria-label="3D 查看工具">
      <button
        v-for="panel in panels"
        :key="panel.key"
        :aria-label="panel.label"
        :class="{ active: activePanel === panel.key }"
        :title="panel.label"
        type="button"
        @click="activePanel = panel.key"
      >
        <IconifyIcon :icon="panel.icon" />
        <span>{{ panel.label }}</span>
      </button>
    </div>

    <button
      aria-label="切换全屏"
      class="model3d-fullscreen"
      title="切换全屏"
      type="button"
      @click="toggleFullscreen"
    >
      <IconifyIcon
        :icon="fullscreen ? 'lucide:minimize-2' : 'lucide:maximize-2'"
      />
    </button>

    <aside class="model3d-panel">
      <template v-if="activePanel === 'scene'">
        <strong>场景设置</strong>
        <label>
          <span>背景颜色</span>
          <input v-model="backgroundColor" type="color" />
        </label>
        <label>
          <span>显示网格</span>
          <input v-model="gridVisible" type="checkbox" />
        </label>
      </template>
      <template v-else-if="activePanel === 'model'">
        <strong>模型设置</strong>
        <label>
          <span>线框模式</span>
          <input v-model="wireframe" type="checkbox" />
        </label>
        <small>
          {{ meshCount }} 个网格 · {{ vertexCount.toLocaleString() }} 个顶点
        </small>
      </template>
      <template v-else-if="activePanel === 'camera'">
        <strong>摄影机设置</strong>
        <label class="range-field">
          <span>视野 {{ cameraFov }}°</span>
          <input v-model.number="cameraFov" max="90" min="20" type="range" />
        </label>
        <button type="button" @click="resetCamera">适应模型</button>
      </template>
      <template v-else-if="activePanel === 'light'">
        <strong>灯光设置</strong>
        <label class="range-field">
          <span>强度 {{ lightIntensity.toFixed(1) }}</span>
          <input
            v-model.number="lightIntensity"
            max="10"
            min="0.5"
            step="0.5"
            type="range"
          />
        </label>
      </template>
      <template v-else-if="activePanel === 'control'">
        <strong>控制设置</strong>
        <label>
          <span>自动旋转</span>
          <input v-model="autoRotate" type="checkbox" />
        </label>
        <small>左键旋转 · 右键平移 · 滚轮缩放</small>
      </template>
      <template v-else>
        <strong>导出模型</strong>
        <small>保留工作流生成的原始 {{ format.toUpperCase() }} 文件。</small>
        <button type="button" @click="downloadOriginal">
          <IconifyIcon icon="lucide:download" />
          下载原始模型（{{ format.toUpperCase() }}）
        </button>
        <div class="model3d-export-formats" aria-label="模型下载格式">
          <button
            v-for="targetFormat in modelExportFormats"
            :key="targetFormat"
            :disabled="exporting || status !== 'ready'"
            type="button"
            @click="downloadFormat(targetFormat)"
          >
            {{ targetFormat.toUpperCase() }}
          </button>
        </div>
        <small>
          GLB 支持材质；OBJ、STL、FBX 为静态网格转换，不包含完整材质与动画。FBX
          使用 ASCII 格式。
        </small>
        <small v-if="exporting" role="status">正在导出…</small>
        <small v-if="exportError" role="alert">{{ exportError }}</small>
      </template>
    </aside>

    <div class="model3d-axis" aria-hidden="true">
      <i class="axis-x"></i>
      <i class="axis-y"></i>
      <i class="axis-z"></i>
    </div>

    <div v-if="status !== 'ready'" class="model3d-state">
      <IconifyIcon
        :class="{ 'is-loading': status === 'loading' }"
        :icon="
          status === 'loading' ? 'lucide:loader-circle' : 'lucide:package-x'
        "
      />
      <strong>
        {{ status === 'loading' ? '正在加载 3D 模型' : '无法显示模型' }}
      </strong>
      <span v-if="errorMessage">{{ errorMessage }}</span>
    </div>
  </div>
</template>

<style scoped>
.model3d-viewer {
  position: relative;
  width: 100%;
  min-height: 520px;
  overflow: hidden;
  color: #f6f7f8;
  background: #302020;
  border: 1px solid #59616a;
  border-radius: 16px;
}

.model3d-viewer.is-compact {
  min-height: 360px;
}

.model3d-viewer.is-fullscreen {
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  border: 0;
  border-radius: 0;
}

.model3d-viewport,
.model3d-viewport :deep(canvas) {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.model3d-toolbar {
  position: absolute;
  top: 18px;
  left: 18px;
  z-index: 2;
  display: grid;
  overflow: hidden;
  background: rgb(20 22 24 / 92%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgb(0 0 0 / 24%);
}

.model3d-toolbar button {
  display: flex;
  gap: 9px;
  align-items: center;
  min-width: 108px;
  padding: 9px 12px;
  font-size: 13px;
  color: #f2f3f4;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.model3d-toolbar button:hover,
.model3d-toolbar button.active {
  color: #fff;
  background: #bd1835;
}

.model3d-toolbar svg {
  font-size: 18px;
}

.model3d-fullscreen {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  font-size: 18px;
  color: #fff;
  cursor: pointer;
  background: rgb(20 22 24 / 82%);
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 10px;
}

.model3d-panel {
  position: absolute;
  top: 18px;
  right: 68px;
  z-index: 2;
  display: grid;
  gap: 13px;
  width: 210px;
  padding: 15px;
  color: #f3f4f5;
  background: rgb(20 22 24 / 88%);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgb(0 0 0 / 24%);
  backdrop-filter: blur(8px);
}

.model3d-panel strong {
  font-size: 14px;
}

.model3d-panel label {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.model3d-panel .range-field {
  display: grid;
}

.model3d-panel input[type='range'] {
  width: 100%;
  accent-color: #d11d3e;
}

.model3d-panel input[type='checkbox'] {
  accent-color: #d11d3e;
}

.model3d-panel small {
  font-size: 11px;
  line-height: 1.55;
  color: #bfc4ca;
}

.model3d-panel button {
  display: flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
  padding: 8px 10px;
  font-size: 12px;
  color: #fff;
  cursor: pointer;
  background: #bd1835;
  border: 0;
  border-radius: 7px;
}

.model3d-export-formats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.model3d-panel button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.model3d-axis {
  position: absolute;
  bottom: 30px;
  left: 34px;
  z-index: 1;
  width: 54px;
  height: 54px;
  pointer-events: none;
}

.model3d-axis i {
  position: absolute;
  bottom: 12px;
  left: 24px;
  width: 31px;
  height: 3px;
  border-radius: 2px;
  transform-origin: left center;
}

.model3d-axis i::after {
  position: absolute;
  top: -4px;
  right: -3px;
  width: 11px;
  height: 11px;
  content: '';
  border-radius: 50%;
}

.model3d-axis .axis-x {
  background: #ef476f;
  transform: rotate(-12deg);
}

.model3d-axis .axis-x::after {
  background: #ef476f;
}

.model3d-axis .axis-y {
  background: #73e052;
  transform: rotate(-90deg);
}

.model3d-axis .axis-y::after {
  background: #73e052;
}

.model3d-axis .axis-z {
  background: #4c8dff;
  transform: rotate(152deg);
}

.model3d-axis .axis-z::after {
  background: #4c8dff;
}

.model3d-state {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: grid;
  gap: 10px;
  place-content: center;
  justify-items: center;
  padding: 30px;
  text-align: center;
  background: rgb(24 27 30 / 78%);
}

.model3d-state svg {
  font-size: 34px;
}

.model3d-state span {
  max-width: 340px;
  font-size: 12px;
  color: #c6cbd0;
}

.model3d-state .is-loading {
  animation: model3d-spin 900ms linear infinite;
}

@keyframes model3d-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 760px) {
  .model3d-viewer,
  .model3d-viewer.is-compact {
    min-height: 430px;
  }

  .model3d-toolbar button {
    min-width: auto;
  }

  .model3d-toolbar button span {
    display: none;
  }

  .model3d-panel {
    top: auto;
    right: 14px;
    bottom: 14px;
    width: min(220px, calc(100% - 90px));
  }
}
</style>
