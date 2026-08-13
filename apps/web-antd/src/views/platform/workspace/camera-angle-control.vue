<script lang="ts" setup>
import type { CapabilityField } from '#/modules/platform/types';

import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, InputNumber } from 'ant-design-vue';

import {
  cameraPrompt,
  closestCameraPreset,
  distanceCameraPresets,
  horizontalCameraPresets,
  normalizeCameraAngle,
  verticalCameraPresets,
} from './camera-angle-control';

const props = defineProps<{
  accent: string;
  fields: CapabilityField[];
  previewUrl?: string;
  values: Record<string, unknown>;
}>();

const emit = defineEmits<{
  update: [field: CapabilityField, value: number];
}>();

interface CameraGroup {
  horizontal?: CapabilityField;
  id: string;
  label: string;
  vertical?: CapabilityField;
  zoom?: CapabilityField;
}

interface OrbitDrag {
  group: CameraGroup;
  height: number;
  horizontal: number;
  vertical: number;
  width: number;
  x: number;
  y: number;
}

const orbitDrag = ref<OrbitDrag>();

const groups = computed(() => {
  const result = new Map<string, CameraGroup>();
  for (const field of props.fields) {
    const id = field.uiGroup ?? '镜头 1';
    const group = result.get(id) ?? { id, label: id };
    if (field.uiControl === 'camera-horizontal') group.horizontal = field;
    if (field.uiControl === 'camera-vertical') group.vertical = field;
    if (field.uiControl === 'camera-zoom') group.zoom = field;
    result.set(id, group);
  }
  return [...result.values()];
});

function fieldValue(field?: CapabilityField) {
  if (!field) return 0;
  const value = props.values[field.key];
  if (typeof value === 'number') return value;
  if (typeof field.defaultValue === 'number') return field.defaultValue;
  return 0;
}

function clamp(field: CapabilityField, value: number) {
  const bounded = Math.min(
    field.max ?? value,
    Math.max(field.min ?? value, value),
  );
  if (!field.integer) return Number(bounded.toFixed(4));
  return Math.round(bounded);
}

function setValue(
  field: CapabilityField | undefined,
  value: null | number | string,
) {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!field || numeric === null || !Number.isFinite(numeric)) return;
  emit('update', field, clamp(field, numeric));
}

function stepValue(field: CapabilityField | undefined, direction: -1 | 1) {
  if (!field) return;
  setValue(field, fieldValue(field) + (field.step ?? 1) * direction);
}

function cameraPoint(group: CameraGroup) {
  const angle = ((fieldValue(group.horizontal) - 90) * Math.PI) / 180;
  return {
    x: 160 + Math.cos(angle) * 103,
    y: 139 + Math.sin(angle) * 49,
  };
}

function verticalPoint(group: CameraGroup) {
  const normalized = (fieldValue(group.vertical) + 30) / 90;
  const angle = (-54 + normalized * 108) * (Math.PI / 180);
  return {
    x: 49 - Math.cos(angle) * 9,
    y: 137 - Math.sin(angle) * 69,
  };
}

function distancePoint(group: CameraGroup) {
  const zoom = Math.min(10, Math.max(0, fieldValue(group.zoom)));
  const distance = 1 - zoom / 12;
  return {
    x: 178 + distance * 77,
    y: 110 - distance * 66,
  };
}

function cameraTransform(group: CameraGroup) {
  const point = cameraPoint(group);
  return `translate(${point.x} ${point.y})`;
}

function verticalTransform(group: CameraGroup) {
  const point = verticalPoint(group);
  return `translate(${point.x} ${point.y})`;
}

function distanceTransform(group: CameraGroup) {
  const point = distancePoint(group);
  return `translate(${point.x} ${point.y})`;
}

function distanceLine(group: CameraGroup) {
  const point = distancePoint(group);
  return `M160 122L${point.x} ${point.y}`;
}

function horizontalPreset(group: CameraGroup) {
  return closestCameraPreset(
    normalizeCameraAngle(fieldValue(group.horizontal)),
    horizontalCameraPresets,
    true,
  );
}

function verticalPreset(group: CameraGroup) {
  return closestCameraPreset(fieldValue(group.vertical), verticalCameraPresets);
}

function distancePreset(group: CameraGroup) {
  return closestCameraPreset(fieldValue(group.zoom), distanceCameraPresets);
}

function viewLabel(group: CameraGroup) {
  return `${horizontalPreset(group).label} · ${verticalPreset(group).label}`;
}

function groupPrompt(group: CameraGroup) {
  return cameraPrompt(
    fieldValue(group.horizontal),
    fieldValue(group.vertical),
    fieldValue(group.zoom),
  );
}

function changePreset(field: CapabilityField | undefined, event: Event) {
  setValue(field, (event.target as HTMLSelectElement).value);
}

function resetGroup(group: CameraGroup) {
  setValue(
    group.horizontal,
    typeof group.horizontal?.defaultValue === 'number'
      ? group.horizontal.defaultValue
      : 0,
  );
  setValue(
    group.vertical,
    typeof group.vertical?.defaultValue === 'number'
      ? group.vertical.defaultValue
      : 0,
  );
  setValue(
    group.zoom,
    typeof group.zoom?.defaultValue === 'number' ? group.zoom.defaultValue : 5,
  );
}

function beginOrbit(group: CameraGroup, event: MouseEvent) {
  if (event.button !== 0) return;
  const target = event.currentTarget as HTMLDivElement;
  const bounds = target.querySelector('svg')?.getBoundingClientRect();
  if (!bounds) return;
  orbitDrag.value = {
    group,
    height: bounds.height,
    horizontal: fieldValue(group.horizontal),
    vertical: fieldValue(group.vertical),
    width: bounds.width,
    x: event.clientX,
    y: event.clientY,
  };
  event.preventDefault();
}

function moveOrbit(event: MouseEvent) {
  const drag = orbitDrag.value;
  if (!drag) return;
  const horizontal =
    drag.horizontal +
    ((event.clientX - drag.x) / Math.max(drag.width, 1)) * 360;
  const vertical =
    drag.vertical - ((event.clientY - drag.y) / Math.max(drag.height, 1)) * 120;
  setValue(drag.group.horizontal, normalizeCameraAngle(horizontal));
  setValue(drag.group.vertical, vertical);
  event.preventDefault();
}

function endOrbit() {
  if (!orbitDrag.value) return;
  orbitDrag.value = undefined;
}

onMounted(() => {
  window.addEventListener('mousemove', moveOrbit, { passive: false });
  window.addEventListener('mouseup', endOrbit);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', moveOrbit);
  window.removeEventListener('mouseup', endOrbit);
});

function zoomByWheel(group: CameraGroup, event: WheelEvent) {
  const direction = event.deltaY > 0 ? -1 : 1;
  const step = Math.max(group.zoom?.step ?? 0.1, 0.2);
  setValue(group.zoom, fieldValue(group.zoom) + direction * step);
}
</script>

<template>
  <section class="camera-control" :style="{ '--camera-accent': accent }">
    <header>
      <div>
        <span>CAMERA ORBIT</span>
        <h3>镜头角度控制</h3>
      </div>
      <IconifyIcon icon="lucide:orbit" />
    </header>

    <details
      v-for="(group, index) in groups"
      :key="group.id"
      :open="groups.length === 1 || index === 0"
      class="camera-group"
    >
      <summary>
        <span>{{ group.label }}</span>
        <small>{{ viewLabel(group) }}</small>
      </summary>

      <div
        class="camera-visual"
        @mousedown="beginOrbit(group, $event)"
        @wheel.prevent="zoomByWheel(group, $event)"
      >
        <code>{{ groupPrompt(group) }}</code>
        <img
          v-if="previewUrl"
          :alt="`${group.label}输入图片预览`"
          class="camera-subject-preview"
          :src="previewUrl"
        />
        <svg
          :class="{ dragging: orbitDrag?.group.id === group.id }"
          aria-label="镜头方位交互控制，拖动可自由调整水平与俯仰角度"
          role="application"
          viewBox="0 0 320 250"
        >
          <defs>
            <radialGradient id="camera-floor" cx="50%" cy="45%" r="58%">
              <stop offset="0" stop-color="#29475a" stop-opacity=".38" />
              <stop offset="1" stop-color="#07121b" stop-opacity="0" />
            </radialGradient>
          </defs>
          <ellipse
            cx="160"
            cy="143"
            fill="url(#camera-floor)"
            rx="145"
            ry="82"
          />
          <path
            class="grid"
            d="M15 143h290M160 52v174M47 84l226 118M273 84 47 202M83 61l154 164M237 61 83 225"
          />
          <ellipse class="orbit" cx="160" cy="143" rx="103" ry="49" />
          <ellipse class="orbit inner" cx="160" cy="143" rx="35" ry="17" />
          <path class="vertical-orbit" d="M48 202c-32-41-32-104 0-143" />
          <path class="distance-line" :d="distanceLine(group)" />
          <g class="subject" :class="{ 'has-preview': previewUrl }">
            <polygon points="118,69 202,88 202,179 118,160" />
            <g v-if="!previewUrl" class="subject-placeholder">
              <path d="M151 105h18v15h-18zM154 116l4-4 3 3 3-5 5 6" />
              <text x="160" y="126">上传图片后显示在这里</text>
            </g>
            <polygon
              class="subject-frame"
              points="118,69 202,88 202,179 118,160"
            />
          </g>
          <g class="camera-marker" :transform="cameraTransform(group)">
            <circle r="12" />
            <path d="M-8 14 0 29 8 14Z" />
          </g>
          <g class="vertical-marker" :transform="verticalTransform(group)">
            <circle r="9" />
          </g>
          <g class="distance-marker" :transform="distanceTransform(group)">
            <circle r="9" />
          </g>
        </svg>
        <div class="camera-help">
          <IconifyIcon icon="lucide:move-3d" />
          拖动画布自由环绕，滚轮调节距离
        </div>
      </div>

      <div class="camera-presets">
        <label class="azimuth">
          <span>水平</span>
          <select
            :value="horizontalPreset(group).value"
            @change="changePreset(group.horizontal, $event)"
          >
            <option
              v-for="preset in horizontalCameraPresets"
              :key="preset.value"
              :value="preset.value"
            >
              {{ preset.label }}
            </option>
          </select>
          <strong>{{ Math.round(fieldValue(group.horizontal)) }}°</strong>
        </label>
        <label class="elevation">
          <span>垂直</span>
          <select
            :value="verticalPreset(group).value"
            @change="changePreset(group.vertical, $event)"
          >
            <option
              v-for="preset in verticalCameraPresets"
              :key="preset.value"
              :value="preset.value"
            >
              {{ preset.label }}
            </option>
          </select>
          <strong>{{ Math.round(fieldValue(group.vertical)) }}°</strong>
        </label>
        <label class="distance">
          <span>距离</span>
          <select
            :value="distancePreset(group).value"
            @change="changePreset(group.zoom, $event)"
          >
            <option
              v-for="preset in distanceCameraPresets"
              :key="preset.value"
              :value="preset.value"
            >
              {{ preset.label }}
            </option>
          </select>
          <strong>{{ fieldValue(group.zoom).toFixed(1) }}</strong>
        </label>
        <Button
          class="camera-reset"
          size="small"
          title="恢复默认镜头"
          @click="resetGroup(group)"
        >
          <IconifyIcon icon="lucide:rotate-ccw" />
        </Button>
      </div>

      <details class="camera-precision">
        <summary>精确调节</summary>
        <div
          v-for="field in [group.horizontal, group.vertical, group.zoom].filter(
            Boolean,
          )"
          :key="field!.key"
          class="camera-slider"
        >
          <label>
            <span>{{ field!.label.split('·').at(-1)?.trim() }}</span>
            <small>
              {{ fieldValue(field!)
              }}{{ field!.uiControl === 'camera-zoom' ? '' : '°' }}
            </small>
          </label>
          <div>
            <Button size="small" @click="stepValue(field, -1)">−</Button>
            <input
              :max="field!.max"
              :min="field!.min"
              :step="field!.step"
              :value="fieldValue(field!)"
              type="range"
              @input="
                setValue(
                  field,
                  Number(($event.target as HTMLInputElement).value),
                )
              "
            />
            <Button size="small" @click="stepValue(field, 1)">+</Button>
            <InputNumber
              :max="field!.max"
              :min="field!.min"
              :step="field!.step"
              :value="fieldValue(field!)"
              size="small"
              @update:value="setValue(field, $event)"
            />
          </div>
        </div>
      </details>
    </details>
  </section>
</template>

<style scoped>
.camera-control {
  padding: 12px;
  margin-bottom: 12px;
  color: #e9f6fa;
  background:
    radial-gradient(circle at 50% 25%, rgb(42 91 111 / 55%), transparent 46%),
    linear-gradient(155deg, #172731, #071119 70%);
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 15px;
  box-shadow: 0 14px 28px rgb(7 17 25 / 18%);
}

.camera-control > header,
.camera-control > header > div,
.camera-group summary,
.camera-slider label,
.camera-slider > div {
  display: flex;
  align-items: center;
}

.camera-control > header {
  justify-content: space-between;
  margin-bottom: 9px;
}

.camera-control > header > div {
  flex-direction: column;
  align-items: flex-start;
}

.camera-control > header span {
  font-size: 12px;
  font-weight: 800;
  color: #80c5d6;
  letter-spacing: 0.16em;
}

.camera-control h3 {
  margin: 1px 0 0;
  font-size: 14px;
}

.camera-control > header > svg {
  width: 19px;
  height: 19px;
  color: var(--camera-accent);
}

.camera-group {
  margin-top: 8px;
  overflow: hidden;
  background: rgb(2 8 12 / 34%);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 11px;
}

.camera-group > summary {
  justify-content: space-between;
  padding: 9px 10px;
  cursor: pointer;
  list-style: none;
}

.camera-group > summary span {
  font-size: 12px;
  font-weight: 750;
}

.camera-group > summary small {
  font-size: 12px;
  color: #8da7b2;
}

.camera-visual {
  position: relative;
  margin: 0 8px 8px;
  overflow: hidden;
  touch-action: none;
  background: #05070d;
  border: 1px solid rgb(74 221 206 / 22%);
  border-radius: 10px;
}

.camera-visual > code {
  position: absolute;
  top: 7px;
  right: 7px;
  left: 7px;
  z-index: 2;
  padding: 5px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: #f35c8c;
  white-space: nowrap;
  pointer-events: none;
  background: rgb(5 7 13 / 84%);
  border: 1px solid rgb(239 79 134 / 34%);
  border-radius: 6px;
}

.camera-visual svg {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  padding-top: 18px;
  cursor: grab;
  user-select: none;
}

.camera-visual svg.dragging {
  cursor: grabbing;
}

.grid {
  fill: none;
  stroke: #38606d;
  stroke-opacity: 0.24;
  stroke-width: 1;
}

.orbit,
.vertical-orbit {
  filter: drop-shadow(
    0 0 5px color-mix(in srgb, var(--camera-accent) 65%, transparent)
  );
  fill: none;
  stroke: var(--camera-accent);
  stroke-width: 5;
}

.orbit.inner {
  opacity: 0.55;
  stroke-width: 2;
}

.vertical-orbit {
  stroke: #2dd4bf;
  stroke-linecap: round;
}

.subject > polygon:first-child {
  fill: #37414e;
}

.camera-subject-preview {
  position: absolute;
  top: 32.8%;
  left: 36.9%;
  z-index: 0;
  width: 26.3%;
  height: 40.7%;
  pointer-events: none;
  object-fit: cover;
  clip-path: polygon(0 0, 100% 17%, 100% 100%, 0 83%);
}

.subject.has-preview > polygon:first-child {
  fill: transparent;
}

.subject {
  pointer-events: none;
}

.subject-frame {
  fill: transparent;
  stroke: #f05b86;
  stroke-width: 3;
}

.subject-placeholder path {
  fill: none;
  stroke: #71818d;
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.subject-placeholder text {
  font-size: 8px;
  text-anchor: middle;
  fill: #8798a2;
}

.camera-marker circle,
.camera-marker path {
  fill: #ef4f86;
  stroke: #ff9fbd;
  stroke-width: 2;
}

.vertical-marker circle {
  fill: #2dd4bf;
  stroke: #99f6e4;
  stroke-width: 2;
}

.distance-line {
  fill: none;
  stroke: #ffb800;
  stroke-width: 4;
  stroke-linecap: round;
}

.distance-marker circle {
  filter: drop-shadow(0 0 6px rgb(255 184 0 / 72%));
  fill: #ffb800;
  stroke: #ffe47a;
  stroke-width: 2;
}

.camera-help {
  position: absolute;
  right: 8px;
  bottom: 6px;
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 10px;
  color: #8da7b2;
  pointer-events: none;
}

.camera-presets {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.85fr auto;
  gap: 6px;
  align-items: end;
  padding: 0 9px 9px;
}

.camera-presets label {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 5px;
  min-width: 0;
}

.camera-presets label span {
  font-size: 9px;
}

.camera-presets label strong {
  grid-column: 1 / -1;
  font-size: 12px;
  text-align: center;
}

.camera-presets select {
  min-width: 0;
  height: 25px;
  padding: 0 3px;
  font-size: 10px;
  color: #edf4f6;
  cursor: pointer;
  outline: none;
  background: #0a1118;
  border: 1px solid #40515c;
  border-radius: 5px;
}

.camera-presets select:focus-visible {
  border-color: currentcolor;
  box-shadow: 0 0 0 2px rgb(255 255 255 / 12%);
}

.camera-presets .azimuth span,
.camera-presets .azimuth strong {
  color: #f35c8c;
}

.camera-presets .elevation span,
.camera-presets .elevation strong {
  color: #2dd4bf;
}

.camera-presets .distance span,
.camera-presets .distance strong {
  color: #ffca28;
}

.camera-reset {
  width: 27px;
  min-width: 27px;
  padding: 0;
  color: #f35c8c;
  background: #0a1118;
  border-color: rgb(243 92 140 / 48%);
}

.camera-precision {
  margin: 0 9px 9px;
  border-top: 1px solid rgb(255 255 255 / 8%);
}

.camera-precision > summary {
  padding: 7px 0 4px;
  font-size: 11px;
  color: #9bb0ba;
  cursor: pointer;
  list-style-position: inside;
}

.camera-slider {
  padding: 5px 0;
}

.camera-slider label {
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 12px;
}

.camera-slider label small {
  color: #7dd3fc;
}

.camera-slider > div {
  gap: 5px;
}

.camera-slider input[type='range'] {
  flex: 1;
  min-width: 0;
  accent-color: var(--camera-accent);
}

.camera-slider :deep(.ant-btn) {
  width: 26px;
  min-width: 26px;
  padding: 0;
  color: #d9edf1;
  background: #20343e;
  border-color: #36505a;
}

.camera-slider :deep(.ant-input-number) {
  width: 67px;
}

@media (max-width: 420px) {
  .camera-presets {
    grid-template-columns: 1fr 1fr;
  }

  .camera-reset {
    justify-self: end;
  }
}
</style>
