<script lang="ts" setup>
import type {
  DesignPromptTemplateCategory,
  DesignPromptTemplateMode,
  DesignPromptTemplateOption,
} from '#/modules/platform/types';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import { Button, Input, message, Modal, Popover, Spin } from 'ant-design-vue';

import {
  getDesignPromptTemplateCatalogApi,
  updateDesignPromptTemplateCatalogApi,
} from '#/api';

const props = withDefaults(
  defineProps<{
    categoryIds?: readonly string[];
    mode: DesignPromptTemplateMode;
  }>(),
  { categoryIds: undefined },
);
const emit = defineEmits<{
  apply: [values: string[]];
}>();
const userStore = useUserStore();
const loading = ref(false);
const saving = ref(false);
const open = ref(false);
const manageOpen = ref(false);
const categories = ref<DesignPromptTemplateCategory[]>([]);
const editableCategories = ref<DesignPromptTemplateCategory[]>([]);
const activeCategoryId = ref('');
const selectedOptionIds = ref<Record<string, string>>({});

const isPlatformAdmin = computed(() => userStore.userRoles.includes('admin'));
const modeLabel = computed(
  () =>
    ({ cabin: '客室效果', cmf: 'CMF', component: '客室零部件' })[props.mode],
);
const visibleCategories = computed(() => {
  const categoryIds = props.categoryIds;
  if (!categoryIds?.length) return categories.value;
  const allowed = new Set(categoryIds);
  return categories.value.filter((category) => allowed.has(category.id));
});
const activeCategory = computed(() =>
  visibleCategories.value.find(
    (category) => category.id === activeCategoryId.value,
  ),
);
const selectedValues = computed(() =>
  visibleCategories.value.flatMap((category) => {
    const selectedId = selectedOptionIds.value[category.id];
    const option = category.options.find((item) => item.id === selectedId);
    return option ? [option.value] : [];
  }),
);
const selectedItems = computed(() =>
  visibleCategories.value.flatMap((category) => {
    const selectedId = selectedOptionIds.value[category.id];
    const option = category.options.find((item) => item.id === selectedId);
    return option
      ? [
          {
            categoryId: category.id,
            label: `${category.name}：${option.label}`,
            optionId: option.id,
            value: option.value,
          },
        ]
      : [];
  }),
);

function createIdentifier(prefix: 'category' | 'option') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function cloneCategories(value: DesignPromptTemplateCategory[]) {
  return value.map((category) => ({
    ...category,
    options: category.options.map((option) => ({ ...option })),
  }));
}

async function loadCatalog() {
  loading.value = true;
  try {
    const catalog = await getDesignPromptTemplateCatalogApi(props.mode);
    categories.value = cloneCategories(catalog.categories);
    activeCategoryId.value =
      visibleCategories.value.find((item) => item.id === activeCategoryId.value)
        ?.id ??
      visibleCategories.value[0]?.id ??
      '';
    selectedOptionIds.value = {};
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '加载提示词模板失败',
    );
  } finally {
    loading.value = false;
  }
}

function selectOption(
  category: DesignPromptTemplateCategory,
  option: DesignPromptTemplateOption,
) {
  if (selectedOptionIds.value[category.id] === option.id) {
    Reflect.deleteProperty(selectedOptionIds.value, category.id);
    return;
  }
  selectedOptionIds.value[category.id] = option.id;
}

function removeSelection(categoryId: string) {
  Reflect.deleteProperty(selectedOptionIds.value, categoryId);
}

function applySelection() {
  if (selectedValues.value.length === 0) {
    message.info('请至少选择一个提示词参数');
    return;
  }
  emit('apply', selectedValues.value);
  open.value = false;
}

function openManager() {
  editableCategories.value = cloneCategories(categories.value);
  manageOpen.value = true;
}

function addCategory() {
  editableCategories.value.push({
    id: createIdentifier('category'),
    name: '新分类',
    options: [
      {
        id: createIdentifier('option'),
        label: '新选项',
        value: '新选项',
      },
    ],
  });
}

function addOption(category: DesignPromptTemplateCategory) {
  category.options.push({
    id: createIdentifier('option'),
    label: '新选项',
    value: '新选项',
  });
}

function removeCategory(index: number) {
  editableCategories.value.splice(index, 1);
}

function removeOption(category: DesignPromptTemplateCategory, index: number) {
  category.options.splice(index, 1);
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= items.length) return;
  const [item] = items.splice(index, 1);
  if (item) items.splice(targetIndex, 0, item);
}

async function saveCatalog() {
  const invalidCategory = editableCategories.value.find(
    (category) => !category.name.trim() || category.options.length === 0,
  );
  const invalidOption = editableCategories.value
    .flatMap((category) => category.options)
    .find((option) => !option.label.trim() || !option.value.trim());
  if (
    editableCategories.value.length === 0 ||
    invalidCategory ||
    invalidOption
  ) {
    message.warning('每个分类至少需要一个名称、一个选项及有效提示词');
    return;
  }
  saving.value = true;
  try {
    const normalized = editableCategories.value.map((category) => ({
      ...category,
      name: category.name.trim(),
      options: category.options.map((option) => ({
        ...option,
        label: option.label.trim(),
        value: option.value.trim(),
      })),
    }));
    const result = await updateDesignPromptTemplateCatalogApi(
      props.mode,
      normalized,
    );
    categories.value = cloneCategories(result.categories);
    activeCategoryId.value = visibleCategories.value[0]?.id ?? '';
    selectedOptionIds.value = {};
    manageOpen.value = false;
    message.success(`${modeLabel.value}提示词模板已保存`);
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '保存提示词模板失败',
    );
  } finally {
    saving.value = false;
  }
}

watch(
  () => [props.mode, ...(props.categoryIds ?? [])],
  () => void loadCatalog(),
  { immediate: true },
);
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
            <small>每个分类可选择一项，组合后填入编辑框</small>
          </div>
          <button
            v-if="isPlatformAdmin"
            :data-testid="`manage-${mode}-prompt-templates`"
            title="维护提示词模板"
            type="button"
            @click="openManager"
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
              <div class="prompt-template-options">
                <button
                  v-for="option in activeCategory.options"
                  :key="option.id"
                  :class="{
                    selected:
                      selectedOptionIds[activeCategory.id] === option.id,
                  }"
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
            :key="`${item.categoryId}:${item.optionId}`"
            :aria-label="`删除已选标签：${item.label}`"
            type="button"
            @click="removeSelection(item.categoryId)"
          >
            {{ item.label }}
            <IconifyIcon icon="lucide:x" />
          </button>
        </div>
        <footer>
          <span>已选 {{ selectedValues.length }} 项</span>
          <Button size="small" type="primary" @click="applySelection">
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

  <Modal
    v-model:open="manageOpen"
    :confirm-loading="saving"
    ok-text="保存模板"
    :title="`维护${modeLabel}提示词模板`"
    width="min(900px, 94vw)"
    @ok="saveCatalog"
  >
    <p class="template-manager-description">
      分类与选项将按当前顺序展示。选项名称用于界面显示，提示词内容会填入设计输入框。
    </p>
    <div class="template-manager-list">
      <article
        v-for="(category, categoryIndex) in editableCategories"
        :key="category.id"
      >
        <header>
          <Input v-model:value="category.name" :maxlength="40" />
          <Button
            :disabled="categoryIndex === 0"
            title="上移分类"
            type="text"
            @click="moveItem(editableCategories, categoryIndex, -1)"
          >
            <IconifyIcon icon="lucide:arrow-up" />
          </Button>
          <Button
            :disabled="categoryIndex === editableCategories.length - 1"
            title="下移分类"
            type="text"
            @click="moveItem(editableCategories, categoryIndex, 1)"
          >
            <IconifyIcon icon="lucide:arrow-down" />
          </Button>
          <Button
            danger
            title="删除分类"
            type="text"
            @click="removeCategory(categoryIndex)"
          >
            <IconifyIcon icon="lucide:trash-2" />
          </Button>
        </header>
        <div class="template-manager-options">
          <div
            v-for="(option, optionIndex) in category.options"
            :key="option.id"
          >
            <Input
              v-model:value="option.label"
              :maxlength="60"
              placeholder="选项名称"
            />
            <Input
              v-model:value="option.value"
              :maxlength="240"
              placeholder="填入提示词的内容"
            />
            <Button
              :disabled="optionIndex === 0"
              title="上移选项"
              type="text"
              @click="moveItem(category.options, optionIndex, -1)"
            >
              <IconifyIcon icon="lucide:arrow-up" />
            </Button>
            <Button
              :disabled="optionIndex === category.options.length - 1"
              title="下移选项"
              type="text"
              @click="moveItem(category.options, optionIndex, 1)"
            >
              <IconifyIcon icon="lucide:arrow-down" />
            </Button>
            <Button
              danger
              title="删除选项"
              type="text"
              @click="removeOption(category, optionIndex)"
            >
              <IconifyIcon icon="lucide:x" />
            </Button>
          </div>
          <Button block type="dashed" @click="addOption(category)">
            <IconifyIcon icon="lucide:plus" />
            添加选项
          </Button>
        </div>
      </article>
    </div>
    <Button block type="dashed" @click="addCategory">
      <IconifyIcon icon="lucide:plus" />
      添加分类
    </Button>
  </Modal>
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
  color: #17191c;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.cmf-template-trigger:hover {
  color: #bd1934;
  background: #fff1f3;
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
  border-bottom: 1px solid #eceef0;
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
  color: #74808a;
}

.prompt-template-panel > header button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 6px 9px;
  font-size: 12px;
  color: #b91c32;
  cursor: pointer;
  background: #fff2f4;
  border: 0;
  border-radius: 7px;
}

.prompt-template-browser {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  min-height: 260px;
  margin: 10px 0;
  border: 1px solid #eceef0;
  border-radius: 10px;
}

.prompt-template-browser nav {
  padding: 8px;
  background: #f6f7f8;
  border-right: 1px solid #eceef0;
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
  color: #b91c32;
  background: #fff;
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
  color: #52606a;
  cursor: pointer;
  background: #f7f8f9;
  border: 1px solid #eceef0;
  border-radius: 7px;
}

.prompt-template-options button.selected {
  color: #b91c32;
  background: #fff1f3;
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
  color: #5f6b73;
}

.prompt-template-selected > button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  max-width: 100%;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.35;
  color: #a5162e;
  cursor: pointer;
  background: #fff1f3;
  border: 1px solid #efb6c0;
  border-radius: 999px;
}

.prompt-template-selected > button:hover,
.prompt-template-selected > button:focus-visible {
  color: #fff;
  outline: 0;
  background: #bd1934;
  border-color: #bd1934;
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
  background: #f7f8f9;
  border: 1px solid #eceef0;
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
