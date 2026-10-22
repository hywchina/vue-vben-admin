<script setup lang="ts">
import type { PlatformCapability } from '#/modules/platform/types';

import { computed, ref } from 'vue';

import { Button, Checkbox, Input, message, Modal, Spin } from 'ant-design-vue';

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
const labels = ref<Record<string, string>>({});
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
    labels.value = Object.fromEntries(
      fields.value.map((field) => [field.key, field.label]),
    );
  } catch {
    message.error('读取参数配置失败，请重新打开');
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
      fieldLabels: Object.fromEntries(
        fields.value.flatMap((field) => {
          const label = labels.value[field.key]?.trim();
          return label && label !== (field.defaultLabel ?? field.label)
            ? [[field.key, label]]
            : [];
        }),
      ),
      quickFieldKeys: keys.value,
      workflowVersionId: current.presentation.workflowVersionId,
    });
    message.success('已保存，用户重新进入或切换该功能后生效');
    open.value = false;
  } catch {
    // 请求层展示服务端错误，保留弹窗与未保存内容以便重试。
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
    :width="860"
    :style="{ top: '24px' }"
    :confirm-loading="saving"
    :cancel-button-props="{ disabled: saving }"
    :closable="!saving"
    :keyboard="!saving"
    :ok-button-props="{ disabled: loading || !capability }"
    :mask-closable="!saving"
    @ok="save"
  >
    <Spin :spinning="loading">
      <p class="presentation-help">
        勾选的参数显示在输入框下方，使用箭头调整顺序。“更多”始终包含全部参数。提示词在主输入框填写，图片等输入保留专用素材入口。展示名称可修改，清空或点击“恢复默认”使用预设名称；保存后用于前端参数展示。
      </p>
      <div class="presentation-field presentation-header">
        <span>快捷显示</span>
        <span>原始 JSON 参数名</span>
        <span>展示名称</span>
        <span>顺序</span>
      </div>
      <div class="presentation-fields">
        <div
          v-for="field in orderedFields"
          :key="field.key"
          class="presentation-field"
          :data-presentation-key="field.key"
        >
          <Checkbox
            :checked="keys.includes(field.key)"
            :disabled="saving"
            :aria-label="`快捷显示${field.label}`"
            @update:checked="toggle(field.key, $event)"
          />
          <div class="presentation-source">
            <code>{{ field.source?.inputName ?? field.key }}</code>
            <small v-if="field.source">
              节点 {{ field.source.nodeId }} · {{ field.source.nodeTitle }}
            </small>
          </div>
          <div class="presentation-name">
            <Input
              v-model:value="labels[field.key]"
              :aria-label="`${field.source?.inputName ?? field.key}的展示名称`"
              :placeholder="field.defaultLabel ?? field.label"
              :maxlength="100"
              :disabled="saving"
              allow-clear
            />
            <Button
              type="link"
              size="small"
              :disabled="saving"
              @click="labels[field.key] = ''"
            >
              恢复默认
            </Button>
          </div>
          <div v-if="keys.includes(field.key)" class="presentation-order">
            <Button
              size="small"
              :aria-label="`上移${field.label}`"
              :disabled="saving || keys.indexOf(field.key) === 0"
              @click="move(field.key, -1)"
            >
              ↑
            </Button>
            <Button
              size="small"
              :aria-label="`下移${field.label}`"
              :disabled="saving || keys.indexOf(field.key) === keys.length - 1"
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
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr) minmax(0, 1.2fr) 72px;
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid var(--rail-theme-border, #eee);
}

.presentation-field small {
  font-size: 12px;
  color: var(--rail-theme-secondary, #77838f);
}

.presentation-source,
.presentation-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.presentation-source small {
  display: block;
  margin-top: 4px;
}

.presentation-header {
  font-weight: 600;
}

@media (max-width: 600px) {
  .presentation-field {
    grid-template-columns: 32px minmax(0, 1fr) minmax(0, 1.2fr) 48px;
    gap: 6px;
  }

  .presentation-header {
    font-size: 12px;
  }

  .presentation-order {
    flex-direction: column;
  }
}

.presentation-order {
  display: flex;
  flex-shrink: 0;
  gap: 6px;
}
</style>
