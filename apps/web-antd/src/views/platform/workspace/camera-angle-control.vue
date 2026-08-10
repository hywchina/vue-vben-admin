<script lang="ts" setup>
import type { CapabilityField } from '#/modules/platform/types';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, InputNumber } from 'ant-design-vue';

const props = defineProps<{
  accent: string;
  fields: CapabilityField[];
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
  const zoom = Math.max(0.1, fieldValue(group.zoom));
  const radius = Math.min(96, 57 + zoom * 4.2);
  return {
    x: 130 + Math.cos(angle) * radius,
    y: 105 + Math.sin(angle) * radius * 0.48,
  };
}

function verticalPoint(group: CameraGroup) {
  const angle = (fieldValue(group.vertical) * Math.PI) / 180;
  return {
    x: 36 + Math.cos(angle) * 21,
    y: 106 - Math.sin(angle) * 53,
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

function viewLabel(group: CameraGroup) {
  const normalized = ((fieldValue(group.horizontal) % 360) + 360) % 360;
  const directions = [
    '正面',
    '右前侧',
    '右侧',
    '右后侧',
    '背面',
    '左后侧',
    '左侧',
    '左前侧',
  ];
  const direction = directions[Math.floor((normalized + 22.5) / 45) % 8];
  const vertical = fieldValue(group.vertical);
  let elevation = '平视';
  if (vertical > 8) elevation = '俯视';
  if (vertical < -8) elevation = '仰视';
  return `${direction} · ${elevation}`;
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

      <div class="camera-visual">
        <svg aria-label="镜头方位可视化" viewBox="0 0 260 190">
          <defs>
            <radialGradient id="camera-floor" cx="50%" cy="45%" r="58%">
              <stop offset="0" stop-color="#29475a" stop-opacity=".38" />
              <stop offset="1" stop-color="#07121b" stop-opacity="0" />
            </radialGradient>
          </defs>
          <ellipse
            cx="130"
            cy="108"
            fill="url(#camera-floor)"
            rx="116"
            ry="66"
          />
          <path
            class="grid"
            d="M20 108h220M130 38v136M52 63l156 90M208 63 52 153"
          />
          <ellipse class="orbit" cx="130" cy="108" rx="84" ry="42" />
          <ellipse class="orbit inner" cx="130" cy="108" rx="32" ry="16" />
          <path class="vertical-orbit" d="M36 159c-27-36-23-88 0-106" />
          <g class="subject">
            <polygon points="113,79 151,91 151,139 113,127" />
            <line x1="132" x2="132" y1="63" y2="145" />
          </g>
          <g class="camera-marker" :transform="cameraTransform(group)">
            <circle r="11" />
            <path d="M-7 13 0 26 7 13Z" />
          </g>
          <g class="vertical-marker" :transform="verticalTransform(group)">
            <circle r="8" />
          </g>
        </svg>
        <div class="camera-readout">
          <strong>{{ viewLabel(group) }}</strong>
          <span>
            {{ fieldValue(group.horizontal) }}° /
            {{ fieldValue(group.vertical) }}° /
            {{ fieldValue(group.zoom).toFixed(1) }}x
          </span>
        </div>
      </div>

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
            }}{{ field!.uiControl === 'camera-zoom' ? 'x' : '°' }}
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
              setValue(field, Number(($event.target as HTMLInputElement).value))
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
.camera-slider > div,
.camera-readout {
  display: flex;
  align-items: center;
}

.camera-control > header {
  justify-content: space-between;
  margin-bottom: 9px;
}

.camera-control > header > div,
.camera-readout {
  flex-direction: column;
  align-items: flex-start;
}

.camera-control > header span {
  font-size: 9px;
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

.camera-group summary {
  justify-content: space-between;
  padding: 9px 10px;
  cursor: pointer;
  list-style: none;
}

.camera-group summary span {
  font-size: 12px;
  font-weight: 750;
}

.camera-group summary small {
  font-size: 10px;
  color: #8da7b2;
}

.camera-visual {
  position: relative;
  margin: 0 8px 9px;
  overflow: hidden;
  background: #050b11;
  border: 1px solid rgb(74 221 206 / 22%);
  border-radius: 10px;
}

.camera-visual svg {
  display: block;
  width: 100%;
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
  stroke-width: 4;
}

.orbit.inner {
  opacity: 0.55;
  stroke-width: 2;
}

.vertical-orbit {
  stroke: #2dd4bf;
  stroke-linecap: round;
}

.subject polygon {
  fill: #62717c;
  stroke: #f05b86;
  stroke-width: 2;
}

.subject line {
  stroke: #ffca28;
  stroke-width: 4;
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

.camera-readout {
  position: absolute;
  right: 8px;
  bottom: 7px;
  padding: 5px 7px;
  background: rgb(0 0 0 / 62%);
  border-radius: 7px;
}

.camera-readout strong {
  font-size: 10px;
}

.camera-readout span {
  font-size: 9px;
  color: #9dd6df;
}

.camera-slider {
  padding: 0 9px 9px;
}

.camera-slider label {
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 10px;
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
</style>
