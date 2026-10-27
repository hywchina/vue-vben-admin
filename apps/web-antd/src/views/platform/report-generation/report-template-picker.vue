<script setup lang="ts">
import type {
  ReportTemplateView,
  TemplateConfiguration,
} from '#/api/platform/report-templates';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  archiveReportTemplateApi,
  completeReportTemplateApi,
  configureReportTemplateApi,
  downloadReportStarterApi,
  downloadReportTemplateApi,
  listReportTemplatesApi,
  prepareReportTemplateApi,
} from '#/api/platform/report-templates';
const props = defineProps<{ format: string; projectId: string }>();
const selected = defineModel<ReportTemplateView | undefined>();
const templates = ref<ReportTemplateView[]>([]);
const input = ref<HTMLInputElement>();
const busy = ref(false);
const managing = ref(false);
const editing = ref<ReportTemplateView>();
const name = ref('');
const config = reactive<TemplateConfiguration>({
  repeatSections: true,
  bindings: [],
});
const starterKind = ref('report');
const options = computed(() => [
  { label: '平台工程设计模板 · v2', value: '' },
  ...templates.value
    .filter((item) => item.format === props.format && item.status === 'ready')
    .map((item) => ({
      label: `${item.name} · r${item.revision}`,
      value: item.id,
    })),
]);
const roleOptions = [
  ['fixed', '保持原样'],
  ['title', '报告标题'],
  ['summary', '报告摘要'],
  ['section-title', '章节标题'],
  ['section-body', '章节正文'],
  ['images', '章节图片'],
  ['image-caption', '图片说明样式'],
  ['value', '自定义字段'],
].map(([value, label]) => ({ value, label }));
async function refresh() {
  const project = props.projectId;
  if (!project) return;
  const rows = await listReportTemplatesApi(project);
  if (project !== props.projectId) return;
  templates.value = rows;
  if (selected.value)
    selected.value = rows.find(
      (item) => item.id === selected.value?.id && item.status === 'ready',
    );
}
function select(id: string) {
  selected.value = templates.value.find((item) => item.id === id);
}
function edit(item: ReportTemplateView) {
  editing.value = item;
  name.value = item.name;
  config.repeatSections = item.configuration?.repeatSections ?? true;
  config.bindings = item.manifest.elements.map((element) => ({
    ...(item.configuration?.bindings.find(
      (binding) => binding.id === element.id,
    ) ?? {
      id: element.id,
      role: element.role,
      sectionIndex: 0,
      fieldName: element.fieldName,
    }),
  }));
}
async function upload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  (event.target as HTMLInputElement).value = '';
  const projectId = props.projectId;
  if (!file || !projectId) return;
  if (!/\.(docx|pptx)$/iu.test(file.name) || file.size > 20 * 1024 * 1024) {
    message.warning('请选择 20 MiB 以内的 DOCX 或 PPTX 模板');
    return;
  }
  busy.value = true;
  try {
    const prepared = await prepareReportTemplateApi({
      projectId,
      filename: file.name,
      name: file.name.replace(/\.(docx|pptx)$/iu, ''),
      sizeBytes: file.size,
    });
    const response = await fetch(prepared.upload.url, {
      method: 'PUT',
      headers: prepared.upload.headers,
      body: file,
    });
    if (!response.ok) throw new Error('模板文件上传失败');
    const item = await completeReportTemplateApi(prepared.id);
    if (projectId !== props.projectId) return;
    await refresh();
    edit(item);
    managing.value = true;
    message.success('模板已解析，请确认可替换位置后保存');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '模板上传失败');
  } finally {
    busy.value = false;
  }
}
async function save() {
  const item = editing.value;
  const project = props.projectId;
  if (!item) return;
  busy.value = true;
  try {
    const saved = await configureReportTemplateApi(item.id, {
      name: name.value,
      revision: item.revision,
      configuration: {
        repeatSections: config.repeatSections,
        bindings: config.bindings.map((binding) => ({ ...binding })),
      },
    });
    if (project !== props.projectId) return;
    await refresh();
    editing.value = undefined;
    if (saved.format === props.format) selected.value = saved;
    message.success('模板规则已确认；后续修改不会改变已提交的报告任务');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '模板配置保存失败');
  } finally {
    busy.value = false;
  }
}
async function download(id: string) {
  try {
    const { url } = await downloadReportTemplateApi(id);
    window.open(url, '_blank', 'noopener');
  } catch {
    message.error('模板下载失败');
  }
}
async function starter(format: 'docx' | 'pptx') {
  try {
    const { url } = await downloadReportStarterApi(format, starterKind.value);
    window.open(url, '_blank', 'noopener');
  } catch {
    message.error('示例模板下载失败');
  }
}
async function archive(id: string) {
  const project = props.projectId;
  try {
    await archiveReportTemplateApi(id);
    if (project === props.projectId) await refresh();
  } catch {
    message.error('归档模板失败');
  }
}
watch(
  () => props.projectId,
  () => {
    selected.value = undefined;
    templates.value = [];
    editing.value = undefined;
    managing.value = false;
    void refresh().catch(() => message.error('模板列表加载失败'));
  },
  { immediate: true },
);
watch(
  () => props.format,
  () => {
    if (selected.value?.format !== props.format) selected.value = undefined;
  },
);
</script>
<template>
  <section class="template-picker" aria-label="报告模板">
    <div class="template-picker__heading">
      <strong>格式模板</strong>
      <span>两种生成方式使用相同的模板格式规则</span>
    </div>
    <div class="template-picker__controls">
      <Select
        :value="selected?.id ?? ''"
        :options="options"
        :disabled="format === 'md' || !projectId"
        aria-label="报告格式模板"
        @change="(value) => select(String(value ?? ''))"
      />
      <Button :disabled="!projectId" :loading="busy" @click="input?.click()">
        上传模板
      </Button>
      <Button :disabled="!projectId" @click="managing = true">模板管理</Button>
    </div>
    <p v-if="format === 'md'">
      Markdown 使用文本结构，不应用 Office 字体和分页；请选 Word 或 PPT
      使用上传的模板。
    </p>
    <p v-else-if="selected">
      {{ selected.name }} · r{{ selected.revision }} ·
      {{
        selected.manifest.fonts.join('、') || '继承原模板字体'
      }}。固定文字与版式保留，正文和配图在指定位置展开。
    </p>
    <p v-else>
      平台模板使用原生 Word 样式与 PPT
      母版；长正文按版式续页，图片等比适配。可下载示例修改后上传。
    </p>
    <input
      ref="input"
      type="file"
      accept=".docx,.pptx"
      hidden
      @change="upload"
    />
    <Modal
      v-model:open="managing"
      title="报告模板管理"
      :width="1040"
      :footer="null"
      :destroy-on-close="true"
    >
      <Spin :spinning="busy">
        <template v-if="!editing">
          <div class="template-picker__starters">
            <Select
              v-model:value="starterKind"
              :options="[
                { label: '工程设计报告', value: 'report' },
                { label: '合同编制参考', value: 'contract' },
                { label: '专利技术交底书', value: 'patent' },
                { label: '投标响应文件参考', value: 'bid' },
              ]"
            />
            <Button @click="starter('docx')">下载 Word 示例</Button>
            <Button @click="starter('pptx')">下载 PPT 示例</Button>
          </div>
          <Alert
            type="info"
            show-icon
            message="示例提供格式和占位符，不替代合同审查、专利评估或采购文件要求。上传后的模板需确认内容位置；不会执行模板内的宏或脚本。"
          />
          <div v-if="!templates.length" class="template-picker__empty">
            尚无已上传模板，点击“上传模板”开始。
          </div>
          <article
            v-for="item in templates"
            :key="item.id"
            class="template-picker__item"
          >
            <div>
              <strong>{{ item.name }}</strong>
              <p>
                {{ item.format.toUpperCase() }} · r{{ item.revision }} ·
                {{ item.manifest.elements.length }} 个内容块
              </p>
            </div>
            <Tag :color="item.status === 'ready' ? 'green' : 'orange'">
              {{ item.status === 'ready' ? '已确认' : '待配置' }}
            </Tag>
            <Button @click="download(item.id)">原模板</Button>
            <Button @click="edit(item)">配置</Button>
            <Popconfirm
              title="归档后不再用于新任务，已有报告与历史任务不受影响。"
              @confirm="archive(item.id)"
            >
              <Button danger>归档</Button>
            </Popconfirm>
          </article>
          <Button type="primary" @click="input?.click()">上传模板</Button>
        </template>
        <template v-else>
          <Alert
            v-for="warning in editing.manifest.warnings"
            :key="warning"
            :message="warning"
            type="warning"
            show-icon
          />
          <p>
            原模板中的字体、段落样式、页眉页脚、母版和固定元素保留。只替换下方指定的内容；可先下载原模板查看位置。PPT
            可分别配置纯正文、图文、单图与图册版式，每种保留一张，按章节内容选择。
          </p>
          <Input
            v-model:value="name"
            :maxlength="120"
            placeholder="模板名称"
            aria-label="模板名称"
          />
          <div class="template-picker__rules">
            <Checkbox v-model:checked="config.repeatSections">
              按章节扩展正文块 / 幻灯片，长正文与多张图片自动续页
            </Checkbox>
            <span>
              字体：{{ editing.manifest.fonts.join('、') || '继承原模板样式' }}
            </span>
          </div>
          <div class="template-picker__mapping">
            <article
              v-for="(binding, index) in config.bindings"
              :key="binding.id"
            >
              <div class="template-picker__source">
                <small>
                  {{
                    editing.format === 'pptx'
                      ? `第 ${editing.manifest.elements[index]?.pageNumber ?? '?'} 页`
                      : editing.manifest.elements[index]?.part.includes(
                            'header',
                          )
                        ? '页眉'
                        : editing.manifest.elements[index]?.part.includes(
                              'footer',
                            )
                          ? '页脚'
                          : '正文'
                  }}
                  · {{ (editing.manifest.elements[index]?.index ?? index) + 1 }}
                </small>
                <span>
                  {{ editing.manifest.elements[index]?.text || '原模板图片' }}
                </span>
                <small
                  v-if="editing.manifest.elements[index]?.unsupportedReason"
                >
                  {{ editing.manifest.elements[index]?.unsupportedReason }}
                </small>
                <small>
                  {{ editing.manifest.elements[index]?.fontSize }} pt ·
                  字体和尺寸保持原样
                </small>
              </div>
              <Select
                v-model:value="binding.role"
                :options="
                  editing.manifest.elements[index]?.unsupportedReason
                    ? [{ value: 'fixed', label: '保持原样' }]
                    : roleOptions
                "
                aria-label="内容位置用途"
              />
              <Select
                v-if="
                  !config.repeatSections &&
                  [
                    'section-title',
                    'section-body',
                    'images',
                    'image-caption',
                  ].includes(binding.role)
                "
                v-model:value="binding.sectionIndex"
                :options="
                  Array.from({ length: 8 }, (_, i) => ({
                    value: i,
                    label: `第 ${i + 1} 章`,
                  }))
                "
              />
              <Input
                v-if="binding.role === 'value'"
                v-model:value="binding.fieldName"
                :maxlength="80"
                placeholder="字段名称，例如甲方"
              />
            </article>
          </div>
          <div class="template-picker__footer">
            <Button @click="editing = undefined">返回列表</Button>
            <Button @click="download(editing.id)">查看原模板</Button>
            <Button type="primary" @click="save">确认规则并保存</Button>
          </div>
        </template>
      </Spin>
    </Modal>
  </section>
</template>
<style scoped>
.template-picker {
  padding: 18px;
  margin-block: 18px;
  background: hsl(var(--muted) / 25%);
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.template-picker__heading,
.template-picker__controls,
.template-picker__starters,
.template-picker__rules,
.template-picker__footer {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.template-picker__heading {
  justify-content: space-between;
  margin-bottom: 12px;
}

.template-picker p,
.template-picker__heading span,
.template-picker__source small,
.template-picker__rules span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.template-picker p {
  margin: 10px 0 0;
  line-height: 1.7;
}

.template-picker__controls > :first-child {
  flex: 1;
  min-width: 200px;
}

.template-picker__starters {
  margin-bottom: 14px;
}

.template-picker__starters > :first-child {
  width: 200px;
}

.template-picker__item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding-block: 14px;
  border-bottom: 1px solid hsl(var(--border));
}

.template-picker__item > div {
  flex: 1;
  min-width: 180px;
}

.template-picker__item p {
  margin: 5px 0 0;
  font-size: 12px;
}

.template-picker__rules {
  justify-content: space-between;
  margin-block: 16px;
}

.template-picker__mapping {
  max-height: 52vh;
  overflow-y: auto;
}

.template-picker__mapping article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px 140px;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.template-picker__source {
  display: grid;
  gap: 5px;
  overflow: hidden;
}

.template-picker__source span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-picker__footer {
  justify-content: flex-end;
  margin-top: 18px;
}

.template-picker__empty {
  padding: 28px 0;
}

@media (max-width: 640px) {
  .template-picker__mapping article {
    grid-template-columns: 1fr;
  }
}
</style>
