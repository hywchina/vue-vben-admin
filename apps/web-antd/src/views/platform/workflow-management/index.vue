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
  Space,
  Spin,
  Switch,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import {
  addWorkflowVersionApi,
  bindCapabilityWorkflowApi,
  createWorkflowApi,
  getWorkflowManagementApi,
  updateWorkflowApi,
} from '#/api/platform';

import ParameterPresentationEditor from './parameter-presentation-editor.vue';

const presentationEditor =
  ref<InstanceType<typeof ParameterPresentationEditor>>();

type EditorMode = 'create' | 'version';

const loading = ref(false);
const submitting = ref(false);
const overview = ref<WorkflowManagementResult>();
const editorMode = ref<EditorMode>('create');
const selectedWorkflow = ref<WorkflowDefinition>();

const editor = reactive({
  apiJson: '{}',
  code: '',
  description: '',
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

function openVersionEditor(workflow: WorkflowDefinition) {
  editorMode.value = 'version';
  selectedWorkflow.value = workflow;
  resetEditor();
  const latest = workflow.versions[0];
  editor.code = workflow.code;
  editor.name = workflow.name;
  editor.description = workflow.description ?? '';
  if (latest) {
    editor.apiJson = JSON.stringify(latest.apiJson, null, 2);
    editor.modelRequirements = JSON.stringify(
      latest.modelRequirements,
      null,
      2,
    );
    editor.outputSchema = JSON.stringify(latest.outputSchema, null, 2);
    editor.parameterSchema = JSON.stringify(latest.parameterSchema, null, 2);
  }
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
  submitting.value = true;
  try {
    const versionPayload = {
      apiJson: parseJson<Record<string, unknown>>(editor.apiJson, 'API 工作流'),
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
    if (editorMode.value === 'create') {
      await createWorkflowApi({
        code: editor.code,
        description: editor.description,
        name: editor.name,
        publish: editor.publish,
        version: versionPayload,
      });
    } else if (selectedWorkflow.value) {
      await addWorkflowVersionApi(selectedWorkflow.value.id, versionPayload);
    }
    message.success(
      editorMode.value === 'create' ? '工作流已注册' : '新版本已保存',
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

onMounted(loadOverview);
</script>

<template>
  <ParameterPresentationEditor ref="presentationEditor" />
  <Page
    title="工作流管理"
    description="注册 ComfyUI API 工作流、发布不可变版本，并将版本绑定到平台能力。"
  >
    <div class="workflow-page">
      <Alert
        show-icon
        type="info"
        message="浏览器不会直接连接 ComfyUI。平台 API 与独立 Worker 负责提交、轮询和归档输出；停用工作流不会删除历史任务血缘。"
      />

      <div class="summary-grid">
        <Card title="执行 Worker" :bordered="false">
          <Descriptions :column="1" size="small">
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
                  {{ capability.workflowVersion || '未绑定版本' }}
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
          <Button type="primary" @click="openCreateEditor">注册工作流</Button>
        </template>
        <Spin :spinning="loading">
          <Table
            :columns="workflowColumns"
            :data-source="overview?.workflows || []"
            :pagination="false"
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
                    @click="openVersionEditor(workflowRecord(record))"
                  >
                    新增版本
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
                </Space>
              </template>
            </template>
          </Table>
        </Spin>
      </Card>
    </div>

    <EditorModal
      :confirm-loading="submitting"
      :title="editorMode === 'create' ? '注册工作流' : '新增工作流版本'"
      class="workflow-editor-modal"
    >
      <Form layout="vertical">
        <div class="form-grid">
          <Form.Item label="工作流标识" required>
            <Input
              v-model:value="editor.code"
              :disabled="editorMode === 'version'"
              placeholder="例如 flux-text-to-image"
            />
          </Form.Item>
          <Form.Item label="版本策略">
            <Input value="自动递增且不可变" disabled />
          </Form.Item>
          <Form.Item label="名称" required>
            <Input
              v-model:value="editor.name"
              :disabled="editorMode === 'version'"
            />
          </Form.Item>
          <Form.Item label="发布版本">
            <Switch v-model:checked="editor.publish" />
          </Form.Item>
        </div>
        <Form.Item v-if="editorMode === 'create'" label="说明">
          <Input.TextArea v-model:value="editor.description" :rows="2" />
        </Form.Item>
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
      </Form>
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
  grid-template-columns: minmax(280px, 0.8fr) minmax(360px, 1.2fr);
  gap: 16px;
}

.capability-list {
  display: grid;
  gap: 12px;
}

.capability-item {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 12px;
  border-bottom: 1px solid hsl(var(--border));
}

.capability-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}

.capability-status {
  display: flex;
  gap: 8px;
  align-items: center;
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

  .capability-item,
  .capability-status {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
