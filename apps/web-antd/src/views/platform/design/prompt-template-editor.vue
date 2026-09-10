<script setup lang="ts">
import type {
  DesignPromptTemplateCategory,
  DesignPromptTemplateMode,
  PromptTemplateContext,
  PromptTemplateMaintenance,
  PromptTemplatePreview,
} from '#/modules/platform/types';

import { computed, onMounted, ref } from 'vue';

import {
  Button,
  Checkbox,
  Input,
  message,
  Modal,
  Select,
  Spin,
  Switch,
  Textarea,
} from 'ant-design-vue';

import {
  getDesignPromptTemplateCatalogApi,
  getDesignPromptTemplateMaintenanceApi,
  previewDesignPromptTemplateApi,
  updateDesignPromptTemplateCatalogApi,
} from '#/api';
import {
  cloneTemplateCategories,
  restoreTemplateDefaults,
  templateChangeSummary,
} from '#/modules/platform/prompt-template-maintenance';
import { usePlatformStore } from '#/store/platform';
const props = defineProps<{
  context: PromptTemplateContext;
  mode: DesignPromptTemplateMode;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const store = usePlatformStore();
const baseline = ref<DesignPromptTemplateCategory[]>([]);
const categories = ref<DesignPromptTemplateCategory[]>([]);
const maintenance = ref<PromptTemplateMaintenance>();
const busy = ref(false);
const categoryId = ref('');
const optionId = ref('');
const revision = ref(0);
const reason = ref<'restore-defaults' | 'restore-version' | 'save'>('save');
const activeCategory = computed(() =>
  categories.value.find((item) => item.id === categoryId.value),
);
const activeOption = computed(() =>
  activeCategory.value?.options.find((item) => item.id === optionId.value),
);
const pendingRestore = ref<DesignPromptTemplateCategory[]>();
const pendingReason = ref<'restore-defaults' | 'restore-version'>(
  'restore-defaults',
);
const difference = computed(() =>
  pendingRestore.value
    ? templateChangeSummary(categories.value, pendingRestore.value)
    : undefined,
);
const restoreVersion = ref<number>();
const preview = ref<PromptTemplatePreview>();
const previewing = ref(false);
const simulation = ref<string[]>([]);
const simulationContext = ref({ ...props.context });
const references = computed(() =>
  categories.value.flatMap((category) =>
    category.options.map((option) => ({
      label: `${category.name} / ${option.label}`,
      value: `${category.id}/${option.id}`,
    })),
  ),
);
const referenceChoices = computed(() =>
  references.value.filter(
    (item) => item.value !== `${categoryId.value}/${optionId.value}`,
  ),
);
const workflows = computed(() =>
  store.applications.map((app) => ({ label: app.name, value: app.key })),
);
const sectionChoices = [
  ['subject', '主体'],
  ['scene', '场景'],
  ['camera', '视角与构图'],
  ['appearance', '部件/材质/颜色'],
  ['style', '风格'],
  ['lighting', '光照与环境'],
  ['constraints', '保留与限制'],
  ['parameters', '比例与尺寸'],
  ['preset', '组合预设'],
].map(([value, label]) => ({ value, label }));
function identify() {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
function chooseCategory(id: string) {
  categoryId.value = id;
  optionId.value = activeCategory.value?.options[0]?.id ?? '';
}
async function load() {
  busy.value = true;
  try {
    const [current, extra] = await Promise.all([
      getDesignPromptTemplateCatalogApi(props.mode),
      getDesignPromptTemplateMaintenanceApi(props.mode),
    ]);
    baseline.value = cloneTemplateCategories(current.categories);
    categories.value = cloneTemplateCategories(current.categories);
    revision.value = current.revision;
    maintenance.value = extra;
    chooseCategory(categories.value[0]?.id ?? '');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '加载维护数据失败');
  } finally {
    busy.value = false;
  }
}
function addCategory() {
  const category = {
    id: identify(),
    name: `新分类 ${categories.value.length + 1}`,
    section: 'appearance' as const,
    selection: 'single' as const,
    options: [{ id: identify(), label: '新选项', value: '请填写完整扩展内容' }],
  };
  categories.value.push(category);
  chooseCategory(category.id);
}
function addOption() {
  if (!activeCategory.value) return;
  const option = {
    id: identify(),
    label: '新选项',
    value: '请填写完整扩展内容',
  };
  activeCategory.value.options.push(option);
  optionId.value = option.id;
}
function move<T>(items: T[], index: number, direction: number) {
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= items.length) return;
  const [item] = items.splice(index, 1);
  if (item) items.splice(destination, 0, item);
}
function removeCategory() {
  categories.value = categories.value.filter(
    (item) => item.id !== categoryId.value,
  );
  chooseCategory(categories.value[0]?.id ?? '');
}
function removeOption() {
  if (!activeCategory.value) return;
  activeCategory.value.options = activeCategory.value.options.filter(
    (item) => item.id !== optionId.value,
  );
  optionId.value = activeCategory.value.options[0]?.id ?? '';
}
function prepareDefaults(
  scope: { categoryId?: string; full?: boolean; optionId?: string } = {},
) {
  if (!maintenance.value) return;
  pendingRestore.value = restoreTemplateDefaults(
    categories.value,
    maintenance.value.defaults.categories,
    scope,
  );
  pendingReason.value = 'restore-defaults';
}
function prepareVersion() {
  const version = maintenance.value?.versions.find(
    (item) => item.revision === restoreVersion.value,
  );
  if (!version) return;
  pendingRestore.value = cloneTemplateCategories(version.categories);
  pendingReason.value = 'restore-version';
}
function confirmRestore() {
  if (!pendingRestore.value) return;
  categories.value = pendingRestore.value;
  pendingRestore.value = undefined;
  reason.value = pendingReason.value;
  simulation.value = [];
  preview.value = undefined;
  chooseCategory(categories.value[0]?.id ?? '');
}
async function save() {
  busy.value = true;
  try {
    await updateDesignPromptTemplateCatalogApi(
      props.mode,
      categories.value,
      revision.value,
      reason.value,
    );
    message.success('模板已保存，新配置将在下次预览时使用');
    emit('saved');
    emit('close');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    busy.value = false;
  }
}
async function simulate() {
  previewing.value = true;
  preview.value = undefined;
  try {
    preview.value = await previewDesignPromptTemplateApi(
      props.mode,
      simulationContext.value,
      simulation.value,
      categories.value,
    );
  } catch (error) {
    message.error(
      error instanceof Error ? error.message : '预览失败，请检查配置',
    );
  } finally {
    previewing.value = false;
  }
}
function referenceLabel(id: string) {
  return (
    references.value.find((item) => item.value === id)?.label ??
    pendingRestore.value
      ?.flatMap((category) =>
        category.options.map((option) => ({
          id: `${category.id}/${option.id}`,
          label: `${category.name} / ${option.label}`,
        })),
      )
      .find((item) => item.id === id)?.label ??
    categories.value.find((category) => category.id === id)?.name ??
    pendingRestore.value?.find((category) => category.id === id)?.name ??
    id
  );
}
onMounted(load);
</script>
<template>
  <Modal
    :open="true"
    :title="`维护提示词模板 · ${{ cabin: '客室效果', cmf: 'CMF', component: '客室零部件' }[mode]}`"
    width="min(1160px, 96vw)"
    :style="{ top: '12px' }"
    :body-style="{ maxHeight: 'calc(100dvh - 110px)', overflowY: 'auto' }"
    :footer="null"
    @cancel="emit('close')"
  >
    <Spin :spinning="busy">
      <div class="editor-actions">
        <span>
          当前版本 {{ revision }} · 系统默认 {{ maintenance?.defaults.version }}
        </span>
        <Button
          size="small"
          @click="
            categories = cloneTemplateCategories(baseline);
            chooseCategory(categories[0]?.id ?? '');
            reason = 'save';
          "
        >
          撤销本次修改
        </Button>
        <Button size="small" @click="prepareDefaults()">
          恢复系统默认（保留自定义）
        </Button>
        <Button size="small" danger @click="prepareDefaults({ full: true })">
          完整重置
        </Button>
      </div>
      <div class="template-editor-layout">
        <nav class="editor-tree" aria-label="维护分类列表">
          <Button block @click="addCategory">添加分类</Button>
          <section v-for="category in categories" :key="category.id">
            <button
              :class="{ active: category.id === categoryId }"
              type="button"
              @click="chooseCategory(category.id)"
            >
              {{ category.name }}
            </button>
            <div v-if="category.id === categoryId">
              <button
                v-for="option in category.options"
                :key="option.id"
                :class="{ active: option.id === optionId }"
                type="button"
                @click="optionId = option.id"
              >
                {{ option.label
                }}{{ option.enabled === false ? '（停用）' : '' }}
              </button>
            </div>
          </section>
        </nav>
        <section class="editor-detail">
          <template v-if="activeCategory">
            <div class="editor-fields">
              <label>
                分类名称
                <Input
                  v-model:value="activeCategory.name"
                  aria-label="分类名称"
                  :maxlength="40"
                />
              </label>
              <label>
                语义位置
                <Select
                  option-filter-prop="label"
                  v-model:value="activeCategory.section"
                  aria-label="语义位置"
                  :options="sectionChoices"
                  placeholder="兼容旧分类自动推断"
                />
              </label>
              <label>
                选择方式
                <Select
                  option-filter-prop="label"
                  v-model:value="activeCategory.selection"
                  aria-label="选择方式"
                  :options="[
                    { label: '单选', value: 'single' },
                    { label: '多选', value: 'multiple' },
                  ]"
                />
              </label>
            </div>
            <div class="editor-actions">
              <Button
                size="small"
                @click="
                  move(categories, categories.indexOf(activeCategory), -1)
                "
              >
                上移分类
              </Button>
              <Button
                size="small"
                @click="move(categories, categories.indexOf(activeCategory), 1)"
              >
                下移分类
              </Button>
              <Button size="small" @click="prepareDefaults({ categoryId })">
                恢复当前分类
              </Button>
              <Button size="small" danger @click="removeCategory">
                删除分类
              </Button>
              <Button size="small" @click="addOption">添加选项</Button>
            </div>
          </template>
          <template v-if="activeOption && activeCategory">
            <div class="editor-fields">
              <label>
                按钮名称
                <Input
                  v-model:value="activeOption.label"
                  aria-label="按钮名称"
                  :maxlength="60"
                />
              </label>
              <label>
                作用对象
                <Input
                  v-model:value="activeOption.target"
                  aria-label="作用对象"
                  placeholder="例如：客室内部照明"
                  :maxlength="120"
                />
              </label>
              <label>
                启用
                <Switch
                  :checked="activeOption.enabled !== false"
                  aria-label="启用选项"
                  @change="activeOption.enabled = Boolean($event)"
                />
              </label>
            </div>
            <label>
              悬浮说明
              <Input
                v-model:value="activeOption.description"
                aria-label="悬浮说明"
                :maxlength="300"
              />
            </label>
            <label>
              生成扩展内容
              <Textarea
                v-model:value="activeOption.value"
                aria-label="生成扩展内容"
                :rows="3"
                :maxlength="2000"
                placeholder="填写完整要求；支持 {target} 作用对象变量"
              />
            </label>
            <label>
              编辑图片时的扩展内容
              <Textarea
                v-model:value="activeOption.editValue"
                aria-label="编辑扩展内容"
                :rows="3"
                :maxlength="2000"
                placeholder="明确改什么、保留什么；留空使用生成扩展内容"
              />
            </label>
            <label>
              适用工作流
              <Select
                option-filter-prop="label"
                v-model:value="activeOption.workflows"
                mode="multiple"
                aria-label="适用工作流"
                :options="workflows"
                placeholder="留空适用于全部工作流"
              />
            </label>
            <label>
              组合预设引用
              <Select
                option-filter-prop="label"
                v-model:value="activeOption.includes"
                mode="multiple"
                aria-label="组合预设引用"
                :options="referenceChoices"
                placeholder="选择后展开所引用的基础项，不重复输出本项正文"
              />
            </label>
            <div class="editor-fields">
              <label>
                依赖选项
                <Select
                  option-filter-prop="label"
                  v-model:value="activeOption.requires"
                  mode="multiple"
                  aria-label="依赖选项"
                  :options="referenceChoices"
                />
              </label>
              <label>
                互斥选项
                <Select
                  option-filter-prop="label"
                  v-model:value="activeOption.conflicts"
                  mode="multiple"
                  aria-label="互斥选项"
                  :options="referenceChoices"
                />
              </label>
            </div>
            <div
              v-if="
                activeCategory.section === 'parameters' ||
                (!activeCategory.section &&
                  /(^|-)(size|ratio)(-|$)/.test(activeCategory.id))
              "
              class="editor-fields"
            >
              <label>
                画面比例
                <Input
                  v-model:value="activeOption.aspectRatio"
                  aria-label="模板画面比例"
                  placeholder="例如16:9；留空使用宽高"
                  @change="
                    activeOption.aspectRatio =
                      activeOption.aspectRatio?.trim() || undefined
                  "
                />
              </label>
              <label>
                期望宽度
                <Input
                  v-model:value="activeOption.width"
                  type="number"
                  aria-label="期望宽度"
                  @change="
                    activeOption.width = Number(activeOption.width) || undefined
                  "
                />
              </label>
              <label>
                期望高度
                <Input
                  v-model:value="activeOption.height"
                  type="number"
                  aria-label="期望高度"
                  @change="
                    activeOption.height =
                      Number(activeOption.height) || undefined
                  "
                />
              </label>
              <small>
                应用模板时同步外部宽高。仅设置比例时按当前宽度联动；同时设置宽高时须与比例一致。
              </small>
            </div>
            <div class="editor-actions">
              <Button
                size="small"
                @click="
                  move(
                    activeCategory.options,
                    activeCategory.options.indexOf(activeOption),
                    -1,
                  )
                "
              >
                上移选项
              </Button>
              <Button
                size="small"
                @click="
                  move(
                    activeCategory.options,
                    activeCategory.options.indexOf(activeOption),
                    1,
                  )
                "
              >
                下移选项
              </Button>
              <Button
                size="small"
                @click="prepareDefaults({ categoryId, optionId })"
              >
                恢复当前选项
              </Button>
              <Button size="small" danger @click="removeOption">
                删除选项
              </Button>
            </div>
          </template>
        </section>
      </div>
      <section class="editor-simulation" aria-label="模板模拟预览">
        <strong>模拟选择与最终提示词预览</strong>
        <div class="editor-fields">
          <Select
            option-filter-prop="label"
            v-model:value="simulation"
            mode="multiple"
            aria-label="模拟选择"
            :options="references"
            placeholder="选择需要测试的选项"
          />
          <Select
            option-filter-prop="label"
            v-model:value="simulationContext.workflowKey"
            aria-label="模拟工作流"
            :options="workflows"
          />
          <Checkbox v-model:checked="simulationContext.editing">
            编辑图片表达
          </Checkbox>
        </div>
        <Button size="small" :loading="previewing" @click="simulate">
          检查并预览
        </Button>
        <pre v-if="preview">{{ preview.text }}</pre>
        <p v-for="error in preview?.errors" :key="error" role="alert">
          {{ error }}
        </p>
      </section>
      <footer class="editor-actions">
        <Select
          option-filter-prop="label"
          v-model:value="restoreVersion"
          aria-label="历史版本"
          :options="
            maintenance?.versions.map((item) => ({
              label: `版本 ${item.revision} · ${new Date(item.updatedAt).toLocaleString('zh-CN')}`,
              value: item.revision,
            }))
          "
          placeholder="最近 50 个保存版本"
        />
        <Button :disabled="!restoreVersion" @click="prepareVersion">
          恢复历史版本
        </Button>
        <Button @click="emit('close')">取消</Button>
        <Button type="primary" :disabled="!revision" @click="save">
          保存模板
        </Button>
      </footer>
    </Spin>
  </Modal>
  <Modal
    :open="!!pendingRestore"
    title="恢复差异预览"
    ok-text="应用到编辑器"
    @cancel="pendingRestore = undefined"
    @ok="confirmRestore"
  >
    <p>
      以下变更只进入编辑器，点击“保存模板”后才生效；历史任务和用户输入不受影响。
    </p>
    <section v-for="(ids, kind) in difference" :key="kind">
      <strong>
        {{ { added: '新增', removed: '删除', changed: '修改' }[kind] }}
        {{ ids.length }} 项
      </strong>
      <ul>
        <li v-for="id in ids" :key="id">{{ referenceLabel(id) }}</li>
      </ul>
    </section>
  </Modal>
</template>
<style scoped>
.template-editor-layout {
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 18px;
  height: min(54vh, 560px);
  margin: 16px 0;
}

.editor-tree,
.editor-detail {
  min-width: 0;
  overflow: auto;
}

.editor-tree {
  padding: 10px;
  background: var(--rail-theme-surface, #f7f8fa);
  border-radius: 8px;
}

.editor-tree button {
  display: block;
  width: 100%;
  padding: 8px;
  text-align: left;
  border-radius: 6px;
}

.editor-tree section > div {
  padding-left: 12px;
}

.editor-tree .active {
  color: var(--rail-theme-accent, #bd1934);
  background: var(--rail-theme-surface, #fff1f3);
}

.editor-detail label {
  display: grid;
  gap: 5px;
  margin-bottom: 12px;
}

.editor-detail :deep(.ant-switch) {
  justify-self: start;
}

.editor-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
  margin: 10px 0;
}

.editor-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.editor-actions > .ant-select {
  min-width: 220px;
}

.editor-actions > span {
  margin-right: auto;
  color: var(--rail-theme-secondary, #78838e);
}

.editor-simulation {
  padding: 12px;
  margin-bottom: 12px;
  background: var(--rail-theme-surface, #f7f8fa);
  border-radius: 8px;
}

.editor-simulation pre {
  max-height: 160px;
  overflow: auto;
  font: inherit;
  white-space: pre-wrap;
}

.editor-simulation p {
  color: var(--rail-theme-accent, #b91c32);
}

@media (max-width: 640px) {
  .template-editor-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    height: auto;
  }

  .editor-tree {
    max-height: 140px;
  }

  .editor-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
