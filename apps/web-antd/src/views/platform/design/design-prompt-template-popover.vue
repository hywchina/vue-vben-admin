<script lang="ts" setup>
import type {
  DesignPromptTemplateCategory,
  DesignPromptTemplateMode,
  DesignPromptTemplateOption,
  PromptTemplateContext,
  PromptTemplatePreview,
} from '#/modules/platform/types';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { Button, message, Popover, Spin } from 'ant-design-vue';

import {
  getDesignPromptTemplateCatalogApi,
  previewDesignPromptTemplateApi,
} from '#/api';
import {
  imageRatios,
  linkedSize,
  sizeRatio,
  syncPromptRatio,
  validDimension,
} from '#/modules/platform/image-dimensions';

import TemplateEditor from './prompt-template-editor.vue';

const props = withDefaults(
  defineProps<{
    categoryIds?: readonly string[];
    context?: PromptTemplateContext;
    mode: DesignPromptTemplateMode;
  }>(),
  { categoryIds: undefined, context: undefined },
);
const emit = defineEmits<{
  apply: [
    text: string,
    size?: { aspectRatio?: string; height?: number; width?: number },
  ];
  sizeChange: [size: { height: number; width: number }];
}>();
const userStore = useUserStore();
const loading = ref(false);
const open = ref(false);
const manageOpen = ref(false);
const previewing = ref(false);
const categories = ref<DesignPromptTemplateCategory[]>([]);
const activeCategoryId = ref('');
const revision = ref(0);
const selected = ref<string[]>([]);
const ratioSelected = ref(false);
const currentSize = computed(() => ({
  width: context.value.width ?? 0,
  height: context.value.height ?? 0,
}));
const currentRatio = computed(() =>
  sizeRatio(currentSize.value.width, currentSize.value.height),
);
const canSize = computed(
  () => currentSize.value.width > 0 && currentSize.value.height > 0,
);
function isSizeCategory(category: DesignPromptTemplateCategory) {
  return (
    category.section === 'parameters' ||
    (!category.section && /(^|-)(size|ratio)(-|$)/.test(category.id))
  );
}
function chooseRatio(ratio: string) {
  try {
    const size =
      ratio === 'auto'
        ? {
            width: context.value.defaultWidth ?? 0,
            height: context.value.defaultHeight ?? 0,
          }
        : linkedSize(
            ratio,
            currentSize.value.width,
            'width',
            context.value.widthLimit,
            context.value.heightLimit,
          );
    if (
      !validDimension(size.width, context.value.widthLimit) ||
      !validDimension(size.height, context.value.heightLimit)
    )
      throw new Error('当前工作流未提供有效默认尺寸');
    ratioSelected.value = true;
    emit('sizeChange', size);
  } catch (error) {
    message.warning(error instanceof Error ? error.message : '比例不可用');
  }
}
const preview = ref<PromptTemplatePreview>();
const isPlatformAdmin = computed(() => userStore.userRoles.includes('admin'));
const context = computed(
  () => props.context ?? { workflowKey: '', editing: false, maxLength: 10_000 },
);
const visibleCategories = computed(() =>
  categories.value
    .filter(
      (category) =>
        !props.categoryIds?.length || props.categoryIds.includes(category.id),
    )
    .map((category) => ({
      ...category,
      options: category.options.filter(
        (option) =>
          option.enabled !== false &&
          (!option.workflows?.length ||
            option.workflows.includes(context.value.workflowKey)),
      ),
    }))
    .filter((category) =>
      isSizeCategory(category) ? canSize.value : category.options.length,
    ),
);
const activeCategory = computed(() =>
  visibleCategories.value.find(
    (category) => category.id === activeCategoryId.value,
  ),
);
const selectedItems = computed(() =>
  categories.value.flatMap((category) =>
    category.options
      .filter((option) =>
        selected.value.includes(`${category.id}/${option.id}`),
      )
      .map((option) => ({
        id: `${category.id}/${option.id}`,
        label: `${category.name}：${option.label}`,
      })),
  ),
);
let loadSequence = 0;
let previewSequence = 0;
async function loadCatalog() {
  const sequence = ++loadSequence;
  loading.value = true;
  try {
    const catalog = await getDesignPromptTemplateCatalogApi(props.mode);
    if (sequence !== loadSequence) return;
    categories.value = catalog.categories;
    revision.value = catalog.revision;
    selected.value = [];
    ratioSelected.value = false;
    activeCategoryId.value = visibleCategories.value[0]?.id ?? '';
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载模板失败');
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}
function selectOption(
  category: DesignPromptTemplateCategory,
  option: DesignPromptTemplateOption,
) {
  const id = `${category.id}/${option.id}`;
  if (selected.value.includes(id))
    selected.value = selected.value.filter((item) => item !== id);
  else {
    if (category.selection !== 'multiple')
      selected.value = selected.value.filter(
        (item) => !item.startsWith(`${category.id}/`),
      );
    selected.value.push(id);
  }
}
async function refreshPreview() {
  const sequence = ++previewSequence;
  preview.value = undefined;
  if (selected.value.length === 0 && !ratioSelected.value) {
    previewing.value = false;
    return;
  }
  previewing.value = true;
  try {
    const result: PromptTemplatePreview =
      selected.value.length > 0
        ? await previewDesignPromptTemplateApi(
            props.mode,
            context.value,
            selected.value,
          )
        : {
            text: '',
            errors: [],
            expanded: [],
            length: 0,
            revision: revision.value,
          };
    // Current workflow dimensions are the single source of truth, including changes outside the template.
    if (ratioSelected.value && canSize.value) {
      result.size = { ...currentSize.value };
      result.text = syncPromptRatio(result.text, currentSize.value, true);
      result.length = result.text.length;
      if (result.length > context.value.maxLength)
        result.errors.push('提示词超出长度限制');
    }
    if (sequence === previewSequence) preview.value = result;
  } catch (error) {
    if (sequence === previewSequence)
      message.error(error instanceof Error ? error.message : '预览失败');
  } finally {
    if (sequence === previewSequence) previewing.value = false;
  }
}
async function applySelection() {
  await refreshPreview();
  const result = preview.value;
  if (!result || result.errors.length > 0) return;
  if (result.revision !== revision.value) {
    message.warning('模板已更新，请重新选择后预览');
    await loadCatalog();
    return;
  }
  emit('apply', result.text, result.size);
  open.value = false;
}
watch(
  () => [props.mode, ...(props.categoryIds ?? [])],
  () => void loadCatalog(),
  { immediate: true },
);
watch(
  () => JSON.stringify([selected.value, context.value, ratioSelected.value]),
  () => void refreshPreview(),
);
watch(visibleCategories, () => {
  if (
    !visibleCategories.value.some(
      (category) => category.id === activeCategoryId.value,
    )
  )
    activeCategoryId.value = visibleCategories.value[0]?.id ?? '';
});
</script>

<template>
  <Popover
    v-model:open="open"
    overlay-class-name="cmf-template-overlay"
    placement="topLeft"
    trigger="click"
  >
    <template #content>
      <div
        class="prompt-template-panel"
        :data-testid="`${mode}-prompt-template-panel`"
      >
        <header>
          <div>
            <strong>提示词模板</strong>
            <small>按分类选择需求，预览后替换输入框内容</small>
          </div>
          <button
            v-if="isPlatformAdmin"
            :data-testid="`manage-${mode}-prompt-templates`"
            title="维护提示词模板"
            type="button"
            @click="
              open = false;
              manageOpen = true;
            "
          >
            <IconifyIcon icon="lucide:settings-2" />
            维护
          </button>
        </header>
        <Spin :spinning="loading">
          <div v-if="visibleCategories.length" class="prompt-template-browser">
            <nav aria-label="提示词模板分类">
              <button
                v-for="category in visibleCategories"
                :key="category.id"
                :class="{ active: category.id === activeCategoryId }"
                type="button"
                @click="activeCategoryId = category.id"
              >
                {{ category.name }}
                <IconifyIcon icon="lucide:chevron-right" />
              </button>
            </nav>
            <section v-if="activeCategory">
              <h4>{{ activeCategory.name }}</h4>
              <div
                v-if="isSizeCategory(activeCategory)"
                class="prompt-template-options template-ratios"
              >
                <button
                  v-for="ratio in ['auto', ...imageRatios]"
                  :key="ratio"
                  type="button"
                  :aria-label="`模板比例 ${ratio === 'auto' ? '自动' : ratio}`"
                  :class="{ selected: ratio === currentRatio }"
                  @click="chooseRatio(ratio)"
                >
                  <span
                    class="template-ratio-icon"
                    :style="{
                      aspectRatio:
                        ratio === 'auto' ? '1' : ratio.replace(':', '/'),
                      height: '24px',
                    }"
                  ></span>
                  {{ ratio === 'auto' ? '自动' : ratio }}
                </button>
                <small class="template-current-size">
                  {{ currentSize.width }}×{{ currentSize.height }}
                </small>
              </div>
              <div v-else class="prompt-template-options">
                <button
                  v-for="option in activeCategory.options"
                  :key="option.id"
                  :class="{
                    selected: selected.includes(
                      `${activeCategory.id}/${option.id}`,
                    ),
                  }"
                  :title="option.description || option.value"
                  type="button"
                  @click="selectOption(activeCategory, option)"
                >
                  {{ option.label }}
                </button>
              </div>
            </section>
          </div>
          <div v-else class="prompt-template-empty">暂无可用模板</div>
        </Spin>
        <div
          v-if="selectedItems.length"
          aria-label="已选提示词标签"
          class="prompt-template-selected"
        >
          <span>已选</span>
          <button
            v-for="item in selectedItems"
            :key="item.id"
            :aria-label="`删除已选标签：${item.label}`"
            type="button"
            @click="selected = selected.filter((id) => id !== item.id)"
          >
            {{ item.label }}
            <IconifyIcon icon="lucide:x" />
          </button>
        </div>
        <section
          v-if="selected.length || ratioSelected"
          class="template-preview"
          aria-label="提示词预览"
        >
          <strong>最终提示词预览（替换当前输入）</strong>
          <pre>{{ previewing ? '正在组织提示词…' : preview?.text }}</pre>
          <p v-if="preview?.size">
            当前图片尺寸：{{
              preview.size.width && preview.size.height
                ? `${preview.size.width}×${preview.size.height}`
                : `比例 ${preview.size.aspectRatio}`
            }}
          </p>
          <p v-for="error in preview?.errors" :key="error" role="alert">
            {{ error }}
          </p>
          <small v-if="preview">
            {{ preview.length }} / {{ context.maxLength }} 字 · 展开
            {{ preview.expanded.length }} 项
          </small>
        </section>
        <footer>
          <span>已选 {{ selected.length + (ratioSelected ? 1 : 0) }} 项</span>
          <Button
            size="small"
            type="primary"
            :disabled="!preview || previewing || !!preview.errors.length"
            @click="applySelection"
          >
            应用到提示词
          </Button>
        </footer>
      </div>
    </template>
    <button
      class="cmf-template-trigger"
      :data-testid="`${mode}-prompt-template-trigger`"
      title="提示词模板"
      type="button"
    >
      <IconifyIcon icon="lucide:notebook-tabs" />
      提示词模板
    </button>
  </Popover>

  <TemplateEditor
    v-if="manageOpen"
    :mode="mode"
    :context="context"
    @close="manageOpen = false"
    @saved="loadCatalog"
  />
</template>

<style scoped>
.cmf-template-trigger {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 5px;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 4px 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--rail-theme-text, #17191c);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.cmf-template-trigger:hover {
  color: var(--rail-theme-accent, #bd1934);
  background: var(--rail-theme-surface, #fff1f3);
}

.prompt-template-panel {
  width: min(680px, 82vw);
}

.prompt-template-panel > header,
.prompt-template-panel > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.prompt-template-panel > header {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rail-theme-border, #eceef0);
}

.prompt-template-panel > header > div {
  display: grid;
  gap: 2px;
}

.prompt-template-panel > header strong {
  font-size: 15px;
}

.prompt-template-panel > header small,
.prompt-template-panel > footer,
.prompt-template-empty,
.template-manager-description {
  font-size: 12px;
  color: var(--rail-theme-secondary, #74808a);
}

.prompt-template-panel > header button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 6px 9px;
  font-size: 12px;
  color: var(--rail-theme-accent, #b91c32);
  cursor: pointer;
  background: var(--rail-theme-surface, #fff2f4);
  border: 0;
  border-radius: 7px;
}

.prompt-template-browser {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  min-height: 260px;
  margin: 10px 0;
  border: 1px solid var(--rail-theme-border, #eceef0);
  border-radius: 10px;
}

.prompt-template-browser nav {
  padding: 8px;
  background: var(--rail-theme-surface, #f6f7f8);
  border-right: 1px solid var(--rail-theme-border, #eceef0);
  border-radius: 10px 0 0 10px;
}

.prompt-template-browser nav button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 9px;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 7px;
}

.prompt-template-browser nav button.active {
  color: var(--rail-theme-accent, #b91c32);
  background: var(--rail-theme-surface, #fff);
  box-shadow: 0 2px 8px rgb(20 28 34 / 7%);
}

.prompt-template-browser section {
  padding: 16px;
}

.prompt-template-browser h4 {
  margin: 0 0 12px;
  font-size: 14px;
}

.prompt-template-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.prompt-template-options button {
  min-height: 34px;
  padding: 6px 8px;
  font-size: 12px;
  color: var(--rail-theme-secondary, #52606a);
  cursor: pointer;
  background: var(--rail-theme-surface, #f7f8f9);
  border: 1px solid var(--rail-theme-border, #eceef0);
  border-radius: 7px;
}

.prompt-template-options button.selected {
  color: var(--rail-theme-accent, #b91c32);
  background: var(--rail-theme-surface, #fff1f3);
  border-color: #df8e9d;
}

.prompt-template-empty {
  display: grid;
  place-items: center;
  min-height: 180px;
}

.prompt-template-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  min-height: 38px;
  padding: 9px 0 7px;
}

.prompt-template-selected > span {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 650;
  color: var(--rail-theme-secondary, #5f6b73);
}

.prompt-template-selected > button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  max-width: 100%;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.35;
  color: var(--rail-theme-accent, #a5162e);
  cursor: pointer;
  background: var(--rail-theme-surface, #fff1f3);
  border: 1px solid #efb6c0;
  border-radius: 999px;
}

.prompt-template-selected > button:hover,
.prompt-template-selected > button:focus-visible {
  color: #fff;
  outline: 0;
  background: #bd1934;
  border-color: var(--rail-theme-accent, #bd1934);
}

.prompt-template-selected svg {
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
}

.prompt-template-panel > footer {
  padding-top: 2px;
}

.template-manager-description {
  margin: 0 0 14px;
}

.template-manager-list {
  display: grid;
  gap: 12px;
  max-height: 58vh;
  margin-bottom: 12px;
  overflow-y: auto;
}

.template-manager-list > article {
  padding: 12px;
  background: var(--rail-theme-surface, #f7f8f9);
  border: 1px solid var(--rail-theme-border, #eceef0);
  border-radius: 10px;
}

.template-manager-list > article > header,
.template-manager-options > div {
  display: grid;
  gap: 6px;
  align-items: center;
}

.template-manager-list > article > header {
  grid-template-columns: minmax(0, 1fr) 32px 32px 32px;
  margin-bottom: 10px;
}

.template-manager-options {
  display: grid;
  gap: 7px;
}

.template-manager-options > div {
  grid-template-columns: 150px minmax(0, 1fr) 32px 32px 32px;
}

@media (max-width: 680px) {
  .prompt-template-browser {
    grid-template-columns: 118px minmax(0, 1fr);
  }

  .prompt-template-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .template-manager-options > div {
    grid-template-columns: 1fr 1fr;
  }
}
</style>

<style scoped>
.template-preview {
  max-height: 220px;
  padding: 12px;
  overflow: auto;
  background: var(--rail-theme-surface, #f7f8fa);
  border-radius: 8px;
}

.template-preview pre {
  margin: 8px 0;
  font: inherit;
  white-space: pre-wrap;
}

.template-preview p {
  margin: 4px 0;
  color: var(--rail-theme-accent, #b91c32);
}
</style>

<style scoped>
.template-ratios {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.template-ratios button {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 72px;
}

.template-ratio-icon {
  display: block;
  border: 1px solid currentcolor;
  border-radius: 2px;
}

.template-current-size {
  grid-column: 1 / -1;
}
</style>
