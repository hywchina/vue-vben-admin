<script lang="ts" setup>
import type { LoraCatalog, OptionalLora } from '#/api/platform/workflows';

import { computed, ref, watch } from 'vue';

import { Button, InputNumber, Popover, Select, Spin } from 'ant-design-vue';

import { getWorkflowLorasApi } from '#/api/platform/workflows';

const props = defineProps<{
  code: string;
  modelUpdateId?: string;
  parameters?: Record<string, unknown>;
  value: unknown;
}>();
const emit = defineEmits<{ change: [value: OptionalLora] }>();
const open = ref(false);
const loading = ref(false);
const loadError = ref('');
const catalog = ref<LoraCatalog>();
let requestGeneration = 0;
const selected = computed<OptionalLora>(() => {
  const value = props.value as OptionalLora | undefined;
  return value?.enabled && Array.isArray(value.selections)
    ? value
    : { enabled: false, selections: [] };
});
const parameterSignature = computed(() =>
  JSON.stringify({ ...props.parameters, optionalLora: undefined }),
);
async function load() {
  const generation = ++requestGeneration;
  loading.value = true;
  catalog.value = undefined;
  loadError.value = '';
  try {
    const result = await getWorkflowLorasApi(
      props.code,
      JSON.parse(parameterSignature.value),
      props.modelUpdateId,
    );
    if (generation === requestGeneration) catalog.value = result;
  } catch (error) {
    if (generation === requestGeneration)
      loadError.value =
        error instanceof Error ? error.message : '读取失败，请重试';
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}
watch([() => props.code, () => props.modelUpdateId, parameterSignature], () => {
  ++requestGeneration;
  catalog.value = undefined;
  if (open.value) void load();
});
watch(open, (value) => {
  if (value) void load();
  else ++requestGeneration;
});
function choose(target: LoraCatalog['targets'][number], name?: string) {
  const next = selected.value.selections.filter(
    (item) => item.targetId !== target.id,
  );
  const option = target.options.find((item) => item.name === name);
  if (option)
    next.push({
      targetId: target.id,
      ...option,
      baseFingerprint: target.baseFingerprint,
      strength: 1,
    });
  emit('change', { enabled: next.length > 0, selections: next });
}
function strength(targetId: string, value: null | number | string) {
  if (value === null) return;
  emit('change', {
    enabled: true,
    selections: selected.value.selections.map((item) =>
      item.targetId === targetId ? { ...item, strength: Number(value) } : item,
    ),
  });
}
function selection(target: LoraCatalog['targets'][number]) {
  return selected.value.selections.find((item) => item.targetId === target.id);
}
function stale(target: LoraCatalog['targets'][number]) {
  const item = selection(target);
  return (
    item &&
    (item.baseFingerprint !== target.baseFingerprint ||
      !target.options.some(
        (option) => option.name === item.name && option.sha256 === item.sha256,
      ))
  );
}
</script>

<template>
  <Popover
    v-model:open="open"
    trigger="click"
    placement="top"
    overlay-class-name="workflow-lora-popover"
  >
    <template #content>
      <section
        class="lora-panel"
        aria-label="LoRA 加载设置"
        data-testid="workflow-lora-picker"
      >
        <header>
          <strong>可选 LoRA</strong>
          <Button
            size="small"
            :disabled="!selected.enabled"
            @click="emit('change', { enabled: false, selections: [] })"
          >
            全部关闭
          </Button>
        </header>
        <p>仅列出适配当前基础模型的 LoRA，不选择则沿用原工作流。</p>
        <div v-if="loading">
          <Spin />
          <p>正在校验模型，首次读取大文件可能需要稍候。</p>
        </div>
        <div v-else-if="loadError" role="alert">
          {{ loadError }}
          <Button size="small" @click="load">重试</Button>
        </div>
        <template v-else>
          <div
            v-for="target in catalog?.targets"
            :key="target.id"
            class="lora-branch"
          >
            <strong>{{ target.label }}</strong>
            <small :title="target.base">{{ target.base }}</small>
            <Select
              class="lora-select"
              allow-clear
              placeholder="不使用额外 LoRA"
              :aria-label="`${target.label} LoRA`"
              :value="selection(target)?.name"
              :options="
                target.options.map((item) => ({
                  label: item.name,
                  value: item.name,
                }))
              "
              @change="choose(target, $event as string | undefined)"
            />
            <span v-if="selection(target)" class="lora-strength">
              强度
              <InputNumber
                :aria-label="`${target.label} LoRA 强度`"
                :min="0.05"
                :max="2"
                :step="0.05"
                :value="selection(target)?.strength"
                @update:value="strength(target.id, $event)"
              />
            </span>
            <small v-if="stale(target)" role="alert">
              所选文件或基础模型已变化，请重新选择；提交时会再次校验。
            </small>
            <small v-if="target.reason">{{ target.reason }}</small>
            <small v-if="target.rejected">
              已过滤 {{ target.rejected }} 个不兼容或信息不足的文件。
            </small>
          </div>
          <small v-if="catalog && !catalog.targets.length">
            当前版本没有可识别的模型加载分支，需要管理员适配。
          </small>
        </template>
      </section>
    </template>
    <button
      type="button"
      class="lora-trigger"
      :class="{ active: selected.enabled }"
      aria-label="LoRA 加载设置"
    >
      LoRA ·
      {{ selected.enabled ? `已选 ${selected.selections.length}` : '关闭' }}
      <span aria-hidden="true">⌄</span>
    </button>
  </Popover>
</template>

<style scoped>
.lora-panel {
  width: min(380px, calc(100vw - 48px));
  max-height: 480px;
  padding: 4px;
  overflow-y: auto;
}

.lora-panel header,
.lora-strength {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.lora-panel p,
.lora-panel small {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.lora-branch {
  display: grid;
  gap: 8px;
  padding: 12px 0;
  border-top: 1px solid hsl(var(--border));
}

.lora-branch small {
  overflow-wrap: anywhere;
}

.lora-select {
  width: 100%;
}

.lora-trigger {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 7px 10px;
  font-size: 13px;
  white-space: nowrap;
  background: transparent;
  border: 0;
  border-radius: 8px;
}

.lora-trigger:hover,
.lora-trigger.active {
  color: hsl(var(--primary));
}

.lora-trigger:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
</style>
