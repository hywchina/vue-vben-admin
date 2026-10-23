<script setup lang="ts">
import type {
  WorkflowDefinition,
  WorkflowManagementResult,
  WorkflowOutputDefinition,
  WorkflowParameterDefinition,
} from '#/modules/platform/types';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import {
  bindCapabilityWorkflowApi,
  createWorkflowApi,
  deleteWorkflowApi,
  getWorkflowManagementApi,
  updateWorkflowApi,
} from '#/api/platform';

import DesignModeEditor from './design-mode-editor.vue';
import ParameterPresentationEditor from './parameter-presentation-editor.vue';
import WorkflowJsonViewer from './workflow-json-viewer.vue';

const presentationEditor =
  ref<InstanceType<typeof ParameterPresentationEditor>>();

type EditorMode = 'create' | 'edit';

const loading = ref(false);
const submitting = ref(false);
const overview = ref<WorkflowManagementResult>();
const editorMode = ref<EditorMode>('create');
const selectedWorkflow = ref<WorkflowDefinition>();
const initialDefaultPrompt = ref('');
const editorPromptFields = computed(() => {
  const versions = selectedWorkflow.value?.versions ?? [];
  const bound = versions.filter(
    (version) => version.activeCapabilities?.length,
  );
  return (bound.length > 0 ? bound : versions.slice(0, 1)).map((version) => {
    const fields = version.parameterSchema ?? [];
    return (
      fields.find(
        (field) =>
          field.key === 'prompt' && ['text', 'textarea'].includes(field.type),
      ) ??
      fields.find((field) => field.type === 'textarea') ??
      fields.find((field) => field.type === 'text' && field.required)
    );
  });
});
const editorPromptMaxLength = computed(() =>
  Math.min(
    10_000,
    ...editorPromptFields.value.map((field) => field?.maxLength ?? 10_000),
  ),
);

const editor = reactive({
  apiJson: '{}',
  code: '',
  description: '',
  defaultPrompt: '',
  modelRequirements: '[]',
  name: '',
  outputSchema: '[]',
  parameterSchema: '[]',
  publish: true,
});

const [EditorModal, editorModalApi] = useVbenModal({
  onCancel() {
    editorModalApi.close();
  },
  async onConfirm() {
    await submitEditor();
  },
});

const workflowColumns = [
  { dataIndex: 'name', key: 'name', title: '工作流' },
  { dataIndex: 'code', key: 'code', title: '标识' },
  { dataIndex: 'status', key: 'status', title: '状态', width: 100 },
  { dataIndex: 'versions', key: 'versions', title: '版本数', width: 100 },
  { key: 'actions', title: '操作', width: 280 },
];

const workerState = computed(() => {
  const heartbeat = overview.value?.worker;
  if (!heartbeat) return { color: 'default', label: '尚未启动' };
  if (!heartbeat.online) return { color: 'error', label: '心跳中断' };
  return { color: 'success', label: '运行中' };
});

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await getWorkflowManagementApi();
  } finally {
    loading.value = false;
  }
}

function resetEditor() {
  Object.assign(editor, {
    apiJson: '{}',
    code: '',
    description: '',
    defaultPrompt: '',
    modelRequirements: '[]',
    name: '',
    outputSchema: '[]',
    parameterSchema: '[]',
    publish: true,
  });
}

function workflowRecord(record: Record<string, unknown>) {
  return record as unknown as WorkflowDefinition;
}

function openCreateEditor() {
  editorMode.value = 'create';
  selectedWorkflow.value = undefined;
  resetEditor();
  editorModalApi.open();
}

function openEditEditor(workflow: WorkflowDefinition) {
  editorMode.value = 'edit';
  selectedWorkflow.value = workflow;
  resetEditor();
  editor.code = workflow.code;
  editor.name = workflow.name;
  editor.description = workflow.description ?? '';
  const preset = editorPromptFields.value[0]?.defaultValue;
  editor.defaultPrompt =
    workflow.defaultPrompt ?? (typeof preset === 'string' ? preset : '');
  initialDefaultPrompt.value = editor.defaultPrompt;
  editorModalApi.open();
}

function parseJson<T>(source: string, label: string): T {
  try {
    return JSON.parse(source) as T;
  } catch {
    throw new Error(`${label}不是有效的 JSON`);
  }
}

async function submitEditor() {
  const name = editor.name.trim();
  if (!name) {
    message.warning('请输入工作流中文名称');
    return;
  }
  submitting.value = true;
  try {
    if (editorMode.value === 'edit') {
      if (!selectedWorkflow.value) throw new Error('未选择要编辑的工作流');
      await updateWorkflowApi(selectedWorkflow.value.id, {
        ...(typeof selectedWorkflow.value.defaultPrompt === 'string' ||
        editor.defaultPrompt !== initialDefaultPrompt.value
          ? { defaultPrompt: editor.defaultPrompt }
          : {}),
        description: editor.description.trim(),
        name,
      });
    } else {
      const versionPayload = {
        apiJson: parseJson<Record<string, unknown>>(
          editor.apiJson,
          'API 工作流',
        ),
        modelRequirements: parseJson<string[]>(
          editor.modelRequirements,
          '模型要求',
        ),
        outputSchema: parseJson<WorkflowOutputDefinition[]>(
          editor.outputSchema,
          '输出定义',
        ),
        parameterSchema: parseJson<WorkflowParameterDefinition[]>(
          editor.parameterSchema,
          '参数定义',
        ),
      };
      await createWorkflowApi({
        code: editor.code,
        description: editor.description,
        name,
        publish: editor.publish,
        version: versionPayload,
      });
    }
    message.success(
      editorMode.value === 'create' ? '工作流已注册' : '工作流信息已更新',
    );
    editorModalApi.close();
    await loadOverview();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    submitting.value = false;
  }
}

async function toggleWorkflow(workflow: WorkflowDefinition) {
  const status = workflow.status === 'published' ? 'disabled' : 'published';
  await updateWorkflowApi(workflow.id, {
    description: workflow.description,
    name: workflow.name,
    status,
  });
  message.success(status === 'published' ? '工作流已发布' : '工作流已停用');
  await loadOverview();
}

async function bindTextToImage(workflow: WorkflowDefinition) {
  const version = workflow.versions[0];
  if (!version) {
    message.warning('请先发布一个工作流版本');
    return;
  }
  await bindCapabilityWorkflowApi('text-to-image', version.id);
  message.success('已切换文生图能力使用的工作流版本');
  await loadOverview();
}

async function readWorkflowFile(file: File) {
  editor.apiJson = await file.text();
  return false;
}

function workflowIsBound(workflow: WorkflowDefinition) {
  return workflow.versions.some(
    (version) => version.activeCapabilities?.length,
  );
}

function confirmDeleteWorkflow(workflow: WorkflowDefinition) {
  Modal.confirm({
    title: `删除工作流“${workflow.name}”？`,
    content:
      '删除后不再显示在管理列表中，历史版本、任务和生成结果保留。此工作流标识仍被保留。',
    okText: '删除',
    cancelText: '取消',
    okButtonProps: { danger: true },
    async onOk() {
      await deleteWorkflowApi(workflow.id);
      await loadOverview();
      message.success('工作流已删除，历史记录保留');
    },
  });
}

onMounted(loadOverview);
</script>

<template>
  <ParameterPresentationEditor ref="presentationEditor" />
  <Page
    title="工作流管理"
    description="注册 ComfyUI API 工作流、编辑中文名称、说明和默认提示词，并管理执行能力与发布状态。"
  >
    <div class="workflow-page">
      <Alert
        show-icon
        type="info"
        message="浏览器不会直接连接 ComfyUI。平台 API 与独立 Worker 负责提交、轮询和归档输出；停用工作流不会删除历史任务血缘。"
      />

      <div class="summary-grid">
        <Card title="执行 Worker" :bordered="false" class="worker-summary">
          <Descriptions :column="{ xs: 1, sm: 1, md: 2, xl: 3 }" size="small">
            <Descriptions.Item label="状态">
              <Tag :color="workerState.color">{{ workerState.label }}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="实例">
              {{ overview?.worker?.instanceId || '无心跳记录' }}
            </Descriptions.Item>
            <Descriptions.Item label="最近心跳">
              {{ overview?.worker?.lastSeenAt || '-' }}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title="正式能力" :bordered="false">
          <div v-if="overview?.capabilities.length" class="capability-list">
            <div
              v-for="capability in overview.capabilities"
              :key="capability.code"
              class="capability-item"
            >
              <div>
                <strong>{{ capability.name }}</strong>
                <div class="muted">{{ capability.code }}</div>
              </div>
              <div class="capability-status">
                <Button
                  :disabled="!capability.ready"
                  size="small"
                  @click="presentationEditor?.show(capability.code)"
                >
                  参数展示
                </Button>
                <Tag :color="capability.ready ? 'success' : 'warning'">
                  {{ capability.ready ? '可执行' : '未就绪' }}
                </Tag>
                <span class="muted">
                  {{
                    capability.workflowVersion
                      ? `v${capability.workflowVersion}`
                      : '未绑定版本'
                  }}
                </span>
              </div>
            </div>
          </div>
          <Empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" />
        </Card>
      </div>

      <Card :bordered="false">
        <template #title>工作流注册表</template>
        <template #extra>
          <Space>
            <DesignModeEditor />
            <Button type="primary" @click="openCreateEditor">注册工作流</Button>
          </Space>
        </template>
        <p class="muted">
          “标识”是系统内部唯一代码，不是 JSON 文件名。例如
          flux2-klein-image-edit-kv 对应 image-edit-kv-v1.json。
          编辑可修改中文名称、说明和默认提示词，不改变标识、工作流
          JSON、版本或功能绑定。
        </p>
        <Spin :spinning="loading">
          <Table
            :columns="workflowColumns"
            :data-source="overview?.workflows || []"
            :pagination="false"
            :scroll="{ x: 840 }"
            row-key="id"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'name'">
                <strong>{{ record.name }}</strong>
                <div class="muted">{{ record.description || '暂无说明' }}</div>
              </template>
              <template v-else-if="column.key === 'status'">
                <Tag
                  :color="record.status === 'published' ? 'success' : 'default'"
                >
                  {{
                    record.status === 'published'
                      ? '已发布'
                      : record.status === 'draft'
                        ? '草稿'
                        : '停用'
                  }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'versions'">
                {{ record.versions.length }}
              </template>
              <template v-else-if="column.key === 'actions'">
                <Space wrap>
                  <Button
                    size="small"
                    @click="openEditEditor(workflowRecord(record))"
                  >
                    编辑
                  </Button>
                  <Button
                    size="small"
                    @click="bindTextToImage(workflowRecord(record))"
                  >
                    绑定文生图
                  </Button>
                  <Button
                    size="small"
                    :danger="record.status === 'published'"
                    @click="toggleWorkflow(workflowRecord(record))"
                  >
                    {{ record.status === 'published' ? '停用' : '发布' }}
                  </Button>
                  <Button
                    danger
                    size="small"
                    :disabled="workflowIsBound(workflowRecord(record))"
                    :title="
                      workflowIsBound(workflowRecord(record))
                        ? '仍绑定功能，请先将功能绑定到其他工作流'
                        : '删除工作流并保留历史记录'
                    "
                    @click="confirmDeleteWorkflow(workflowRecord(record))"
                  >
                    删除
                  </Button>
                </Space>
              </template>
            </template>
          </Table>
        </Spin>
      </Card>
    </div>

    <EditorModal
      :confirm-loading="submitting"
      :title="editorMode === 'create' ? '注册工作流' : '编辑工作流'"
      class="workflow-editor-modal w-[min(720px,calc(100vw-32px))]"
    >
      <Form layout="vertical">
        <Alert
          v-if="editorMode === 'edit'"
          show-icon
          type="info"
          message="可修改中文展示名称、说明和默认提示词；标识、工作流 JSON、现有版本、发布状态和功能绑定保持不变。"
        />
        <div class="form-grid">
          <Form.Item label="工作流标识" required>
            <Input
              v-model:value="editor.code"
              :disabled="editorMode === 'edit'"
              placeholder="例如 flux-text-to-image"
            />
          </Form.Item>
          <Form.Item v-if="editorMode === 'create'" label="版本策略">
            <Input value="自动递增且不可变" disabled />
          </Form.Item>
          <Form.Item label="中文名称" required>
            <Input
              v-model:value="editor.name"
              :maxlength="200"
              placeholder="例如 客室双图编辑（KV）"
            />
          </Form.Item>
          <Form.Item v-if="editorMode === 'create'" label="发布版本">
            <Switch v-model:checked="editor.publish" />
          </Form.Item>
        </div>
        <Form.Item label="说明">
          <Input.TextArea
            v-model:value="editor.description"
            :rows="2"
            :maxlength="2000"
          />
        </Form.Item>
        <Form.Item v-if="editorMode === 'edit'" label="默认提示词">
          <Input.TextArea
            v-model:value="editor.defaultPrompt"
            aria-label="工作流默认提示词"
            :rows="4"
            :maxlength="editorPromptMaxLength"
            show-count
            :disabled="submitting"
            placeholder="填写首次使用此工作流时预填的提示词；留空则不预填"
          />
          <p class="muted">
            仅管理员可设置。用户首次使用时自动填入，可修改本次输入；已有草稿保留。留空则不自动预填，不改写
            API JSON。
          </p>
        </Form.Item>
        <template v-if="editorMode === 'create'">
          <Form.Item label="ComfyUI API 工作流 JSON" required>
            <Upload
              accept=".json,application/json"
              :before-upload="readWorkflowFile"
              :show-upload-list="false"
            >
              <Button class="upload-button">读取 JSON 文件</Button>
            </Upload>
            <Input.TextArea
              v-model:value="editor.apiJson"
              class="code-area"
              :rows="10"
            />
          </Form.Item>
          <Form.Item label="参数映射 JSON" required>
            <Input.TextArea
              v-model:value="editor.parameterSchema"
              class="code-area"
              :rows="8"
            />
          </Form.Item>
          <Form.Item label="输出映射 JSON" required>
            <Input.TextArea
              v-model:value="editor.outputSchema"
              class="code-area"
              :rows="6"
            />
          </Form.Item>
          <Form.Item label="模型依赖 JSON">
            <Input.TextArea
              v-model:value="editor.modelRequirements"
              class="code-area"
              :rows="4"
            />
          </Form.Item>
        </template>
      </Form>
      <WorkflowJsonViewer
        v-if="editorMode === 'edit' && selectedWorkflow"
        :key="selectedWorkflow.id"
        :workflow="selectedWorkflow"
        :capabilities="overview?.capabilities || []"
      />
    </EditorModal>
  </Page>
</template>

<style scoped>
.workflow-page {
  display: grid;
  gap: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
  min-width: 0;
}

.capability-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr));
  gap: 12px;
}

.capability-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
  min-width: 0;
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.capability-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.worker-summary :deep(.ant-descriptions-item-container) {
  min-width: 0;
}

.worker-summary :deep(.ant-descriptions-item-content) {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.capability-item .muted {
  overflow-wrap: anywhere;
}

.workflow-page > :deep(.ant-card),
.summary-grid > :deep(.ant-card) {
  min-width: 0;
}

.muted {
  margin-top: 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.upload-button {
  margin-bottom: 8px;
}

.code-area {
  font-family: SFMono-Regular, Consolas, 'Liberation Mono', monospace;
}

@media (max-width: 860px) {
  .summary-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
