<script setup lang="ts">
import type { PlatformCapability } from '#/modules/platform/types';

import { computed, ref } from 'vue';

import { Button, Checkbox, message, Modal, Spin } from 'ant-design-vue';

import {
  getCapabilityApi,
  saveCapabilityPresentationApi,
} from '#/api/platform';
import { configurableQuickFields } from '#/modules/platform/parameter-presentation';

const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const capability = ref<PlatformCapability>();
const keys = ref<string[]>([]);
const fields = computed(() =>
  configurableQuickFields(capability.value?.fields ?? []),
);
const orderedFields = computed(() => [
  ...keys.value.flatMap(
    (key) => fields.value.find((field) => field.key === key) ?? [],
  ),
  ...fields.value.filter((field) => !keys.value.includes(field.key)),
]);
async function show(code: string) {
  open.value = true;
  loading.value = true;
  capability.value = undefined;
  try {
    capability.value = await getCapabilityApi(code);
    keys.value = [...(capability.value.presentation?.quickFieldKeys ?? [])];
  } finally {
    loading.value = false;
  }
}
function toggle(key: string, checked: boolean) {
  keys.value = checked
    ? [...keys.value, key]
    : keys.value.filter((item) => item !== key);
}
function move(key: string, direction: number) {
  const index = keys.value.indexOf(key);
  const next = index + direction;
  if (index === -1 || next < 0 || next >= keys.value.length) return;
  const ordered = [...keys.value];
  ordered.splice(index, 1);
  ordered.splice(next, 0, key);
  keys.value = ordered;
}
async function save() {
  const current = capability.value;
  if (!current?.presentation) return;
  saving.value = true;
  try {
    await saveCapabilityPresentationApi(current.code, {
      quickFieldKeys: keys.value,
      workflowVersionId: current.presentation.workflowVersionId,
    });
    message.success('已保存，用户重新进入或切换该功能后生效');
    open.value = false;
  } finally {
    saving.value = false;
  }
}
defineExpose({ show });
</script>
<template>
  <Modal
    v-model:open="open"
    :title="`${capability?.name ?? '功能'} · 参数展示`"
    :confirm-loading="saving"
    :ok-button-props="{ disabled: loading || !capability }"
    :mask-closable="!saving"
    @ok="save"
  >
    <Spin :spinning="loading">
      <p class="presentation-help">
        勾选的参数显示在输入框下方，使用箭头调整顺序。“更多”始终包含全部参数。提示词在主输入框填写，图片等输入保留专用素材入口。
      </p>
      <div class="presentation-fields">
        <div
          v-for="field in orderedFields"
          :key="field.key"
          class="presentation-field"
          :data-presentation-key="field.key"
        >
          <Checkbox
            :checked="keys.includes(field.key)"
            @update:checked="toggle(field.key, $event)"
          >
            {{ field.label }}
            <small>{{ field.key }}</small>
          </Checkbox>
          <div v-if="keys.includes(field.key)" class="presentation-order">
            <Button
              size="small"
              :aria-label="`上移${field.label}`"
              :disabled="keys.indexOf(field.key) === 0"
              @click="move(field.key, -1)"
            >
              ↑
            </Button>
            <Button
              size="small"
              :aria-label="`下移${field.label}`"
              :disabled="keys.indexOf(field.key) === keys.length - 1"
              @click="move(field.key, 1)"
            >
              ↓
            </Button>
          </div>
          <small v-else>仅在更多中显示</small>
        </div>
      </div>
    </Spin>
  </Modal>
</template>
<style scoped>
.presentation-help {
  margin: 12px 0;
  line-height: 1.7;
  color: var(--rail-theme-secondary, #677482);
}

.presentation-fields {
  max-height: 55vh;
  overflow-y: auto;
}

.presentation-field {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--rail-theme-border, #eee);
}

.presentation-field small {
  margin-left: 8px;
  font-size: 12px;
  color: var(--rail-theme-secondary, #77838f);
}

.presentation-order {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}
</style>
