<script lang="ts" setup>
import type { CameraView } from '#/modules/platform/camera-views';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Checkbox, message, Popover, Select } from 'ant-design-vue';

import {
  distanceCameraPresets,
  horizontalCameraPresets,
  verticalCameraPresets,
} from '#/modules/platform/camera-angles';
import {
  cameraViewDescription,
  cameraViewLabel,
  cameraViewValues,
} from '#/modules/platform/camera-views';
import { platformUiIcons } from '#/modules/platform/ui-icons';

const props = defineProps<{ count?: unknown; value: unknown }>();
const emit = defineEmits<{ change: [value: CameraView[]] }>();
const open = ref(false);
const editing = ref<CameraView>();
const views = computed(() => cameraViewValues(props.value));
const selected = computed(() => views.value.filter(({ enabled }) => enabled));
const horizontalOptions = horizontalCameraPresets.map(({ label, value }) => ({
  label,
  value,
}));
const verticalOptions = verticalCameraPresets.map(({ label, value }) => ({
  label,
  value,
}));
const distanceOptions = distanceCameraPresets.map(({ label, value }) => ({
  label,
  value: value === 4 ? 5 : value,
}));
const outputPlan = computed(() => {
  const total =
    typeof props.count === 'number' ? props.count : selected.value.length;
  return selected.value
    .map(
      (view, index) =>
        `${cameraViewLabel(view)} ${Math.floor(total / selected.value.length) + (index < total % selected.value.length ? 1 : 0)} 张`,
    )
    .join(' / ');
});
function update(next: CameraView[]) {
  const signatures = next
    .filter(({ enabled }) => enabled)
    .map(
      ({ horizontal, vertical, zoom }) => `${horizontal}/${vertical}/${zoom}`,
    );
  if (new Set(signatures).size !== signatures.length) {
    message.warning('已选视角的方向、俯仰和景别不能完全相同');
    return false;
  }
  emit('change', next);
  return true;
}
function toggle(view: CameraView, enabled: boolean) {
  update(
    views.value.map((item) =>
      item.id === view.id ? { ...item, enabled } : item,
    ),
  );
}
function saveEdit() {
  const next = editing.value;
  if (
    next &&
    update(
      views.value.map((item) => (item.id === next.id ? { ...next } : item)),
    )
  )
    editing.value = undefined;
}
</script>
<template>
  <Popover
    v-model:open="open"
    placement="top"
    trigger="click"
    overlay-class-name="camera-view-popover"
    @open-change="editing = undefined"
  >
    <template #content>
      <section
        class="camera-view-picker"
        aria-label="视角选择"
        data-testid="camera-view-picker"
      >
        <header>
          <strong>视角选择</strong>
          <small>可多选，每项均可调整</small>
        </header>
        <div v-for="view in views" :key="view.id" class="view-item">
          <div class="view-row">
            <Checkbox
              :checked="view.enabled"
              :aria-label="`选择${cameraViewLabel(view)}`"
              @update:checked="toggle(view, $event)"
            >
              <span>{{ cameraViewLabel(view) }}</span>
              <small>
                {{
                  verticalCameraPresets.find(
                    (item) => item.value === view.vertical,
                  )?.label
                }}
                ·
                {{
                  view.zoom === 1 ? '远景' : view.zoom === 8 ? '特写' : '中景'
                }}
              </small>
            </Checkbox>
            <Button
              type="text"
              size="small"
              :aria-label="`调整${cameraViewLabel(view)}`"
              @click="editing = { ...view }"
            >
              调整
            </Button>
          </div>
          <div
            v-if="editing?.id === view.id"
            class="view-editor"
            aria-label="调整视角"
          >
            <div class="view-editor-fields">
              <label>
                <span>方向</span>
                <Select
                  v-model:value="editing.horizontal"
                  aria-label="方向"
                  :options="horizontalOptions"
                />
              </label>
              <label>
                <span>俯仰</span>
                <Select
                  v-model:value="editing.vertical"
                  aria-label="俯仰"
                  :options="verticalOptions"
                />
              </label>
              <label>
                <span>景别</span>
                <Select
                  v-model:value="editing.zoom"
                  aria-label="景别"
                  :options="distanceOptions"
                />
              </label>
            </div>
            <div class="view-editor-actions">
              <Button size="small" @click="editing = undefined">取消</Button>
              <Button size="small" type="primary" @click="saveEdit">
                保存调整
              </Button>
            </div>
          </div>
        </div>
        <p v-if="selected.length" class="view-plan" aria-live="polite">
          本次出图 {{ outputPlan }}
        </p>
        <p v-else class="view-plan" role="status">请至少选择一个视角</p>
        <footer>
          <span>已选 {{ selected.length }} 个视角 · 最多 8 张</span>
          <Button type="primary" size="small" @click="open = false">
            完成
          </Button>
        </footer>
      </section>
    </template>
    <button
      class="camera-view-trigger"
      type="button"
      data-param-key="cameraViews"
      :title="selected.map(cameraViewDescription).join('；')"
    >
      <IconifyIcon :icon="platformUiIcons.slidersHorizontal" />
      <span>视角选择</span>
      <strong>
        {{ selected.length ? `已选 ${selected.length} 项` : '请选择' }}
      </strong>
      <IconifyIcon :icon="platformUiIcons.chevronDown" />
    </button>
  </Popover>
</template>
<style scoped>
.camera-view-picker {
  width: min(360px, calc(100vw - 64px));
  color: var(--rail-theme-text, #32323b);
}

.camera-view-picker header,
.view-row,
.camera-view-picker footer,
.view-editor-actions,
.camera-view-trigger {
  display: flex;
  gap: 8px;
  align-items: center;
}

.camera-view-picker header {
  margin-bottom: 10px;
}

.camera-view-picker strong {
  font-weight: 500;
}

.camera-view-picker small,
.camera-view-picker footer,
.view-plan {
  font-size: 12px;
  color: var(--rail-theme-secondary, #7a858c);
}

.view-row {
  justify-content: space-between;
  min-height: 38px;
}

.view-row small {
  margin-left: 8px;
}

.view-row :deep(.ant-checkbox-wrapper) {
  flex: 1;
}

.view-editor {
  padding: 10px;
  margin: 4px 0 8px;
  background: var(--rail-theme-surface, #f7f4f4);
  border-radius: 8px;
}

.view-editor-fields {
  display: grid;
  grid-template-columns: 1.3fr 1fr 1fr;
  gap: 8px;
}

.view-editor-fields label {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.view-editor-fields :deep(.ant-select) {
  width: 100%;
}

.view-editor-actions {
  justify-content: flex-end;
  margin-top: 10px;
}

.view-plan {
  margin: 10px 0;
  overflow-wrap: anywhere;
}

.camera-view-picker footer {
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--rail-theme-border, #e5e7eb);
}

.camera-view-trigger {
  padding: 6px 2px;
  color: var(--rail-theme-text, #32323b);
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.camera-view-trigger strong {
  font-weight: 500;
  color: var(--rail-theme-accent, #bb1b21);
}

.camera-view-trigger :deep(svg) {
  width: 14px;
  height: 14px;
}
</style>
