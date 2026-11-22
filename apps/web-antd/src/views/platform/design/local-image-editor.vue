<script setup lang="ts">
import type {
  LocalEditDraft,
  LocalEditMode,
} from '#/modules/platform/local-image-edit';
import type { CapabilityField } from '#/modules/platform/types';

import { reactive, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Modal } from 'ant-design-vue';

import ComfyMaskEditor from '#/components/platform/comfy-mask-editor.vue';
import { localEditTools } from '#/modules/platform/local-image-edit';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { platformUiIcons } from '#/modules/platform/ui-icons';

import CapabilityMediaField from '../workspace/capability-media-field.vue';

const props = defineProps<{
  assetId: string;
  assetName?: string;
  baseUrl: string;
  draft: LocalEditDraft;
  enabledTools: LocalEditMode[];
  maskUrl?: string;
  mode: LocalEditMode;
  saveMask: (file: File) => Promise<unknown>;
}>();

const emit = defineEmits<{
  close: [];
  saveRegion: [mode: 'color' | 'number', value: string];
}>();

const toolIcons = {
  color: platformUiIcons.scanLine,
  mask: platformSemanticIcons.mask,
  number: platformUiIcons.tags,
};
const active = ref(props.mode);
const visited = reactive(new Set([props.mode]));
const savingMask = ref(false);
const regionValues = reactive({
  color: props.draft.color,
  number: props.draft.number,
});
const regionField: CapabilityField = {
  acceptedKinds: ['image'],
  advanced: false,
  assetIndex: 0,
  integer: false,
  key: 'regionMarks',
  label: '分区标记',
  options: [],
  required: true,
  type: 'region',
  uiControl: 'default',
};

function switchTool(mode: LocalEditMode) {
  visited.add(mode);
  active.value = mode;
}

async function applyMask(file: File) {
  savingMask.value = true;
  try {
    await props.saveMask(file);
  } finally {
    savingMask.value = false;
  }
}

function close() {
  if (!savingMask.value) emit('close');
}
</script>

<template>
  <Modal
    :closable="!savingMask"
    :footer="null"
    :keyboard="!savingMask"
    :mask-closable="false"
    :open="true"
    title="局部编辑"
    width="min(1360px, 96vw)"
    @cancel="close"
  >
    <div class="local-image-editor">
      <nav aria-label="局部编辑工具" class="local-image-editor__tools">
        <button
          v-for="tool in localEditTools"
          :key="tool.mode"
          :aria-pressed="active === tool.mode"
          :disabled="savingMask || !enabledTools.includes(tool.mode)"
          type="button"
          @click="switchTool(tool.mode)"
        >
          <IconifyIcon :icon="toolIcons[tool.mode]" />
          {{ tool.label }}
        </button>
      </nav>
      <div class="local-image-editor__workarea">
        <ComfyMaskEditor
          v-if="visited.has('mask')"
          v-show="active === 'mask'"
          :active="active === 'mask'"
          :mask-src="maskUrl"
          :on-save="applyMask"
          :open="true"
          :src="baseUrl"
          :title="assetName"
          embedded
          @update:open="close"
        />
        <template v-for="tool in localEditTools" :key="tool.mode">
          <CapabilityMediaField
            v-if="tool.mode !== 'mask' && visited.has(tool.mode)"
            v-show="active === tool.mode"
            :assets="[]"
            :editor-preview-url="baseUrl"
            :embedded-region="tool.mode"
            :field="regionField"
            :selected-asset-id="assetId"
            :value="regionValues[tool.mode]"
            accent="#c51f3a"
            @region-applied="emit('saveRegion', tool.mode, $event)"
            @update:value="regionValues[tool.mode] = $event"
          />
        </template>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.local-image-editor {
  display: grid;
  grid-template-columns: minmax(90px, 118px) minmax(0, 1fr);
  gap: 12px;
  min-height: min(62vh, 580px);
}

.local-image-editor__tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.local-image-editor__tools button {
  display: flex;
  gap: 6px;
  align-items: center;
  min-height: 38px;
  padding: 6px 10px;
  text-align: start;
  border: 1px solid var(--rail-theme-border, #dadde2);
  border-radius: 7px;
}

.local-image-editor__tools button[aria-pressed='true'] {
  color: var(--rail-theme-accent, #b62547);
  background: color-mix(in srgb, #c51f3a 10%, transparent);
  border-color: currentcolor;
}

.local-image-editor__tools button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.local-image-editor__workarea {
  min-width: 0;
}

.local-image-editor__workarea :deep(.embedded-mask-editor) {
  height: min(72vh, 820px);
  overflow: hidden;
  border-radius: 8px;
}

@media (width <= 660px) {
  .local-image-editor {
    grid-template-columns: minmax(0, 1fr);
  }

  .local-image-editor__tools {
    flex-direction: row;
  }
}
</style>
