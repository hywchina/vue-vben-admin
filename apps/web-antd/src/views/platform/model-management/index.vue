<script setup lang="ts">
import type {
  ModelReference,
  ModelUpdate,
  SystemModel,
  SystemModelOverview,
} from '#/api/platform/models';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  onMounted,
  reactive,
  ref,
} from 'vue';
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Drawer,
  Input,
  message,
  Modal,
  Progress,
  Select,
  Space,
  Spin,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  cancelSystemModelApi,
  completeSystemModelApi,
  createSystemModelApi,
  getModelUploadApi,
  getSystemModelsApi,
  prepareModelUpdateApi,
  publishModelUpdateApi,
  putModelPartApi,
} from '#/api/platform/models';
import StatusPill from '#/components/platform/status-pill.vue';
import { usePlatformStore } from '#/store';

import {
  matchResumeFiles,
  resumeModelUpload,
  selectedModelFiles,
} from './upload';

const router = useRouter();
const store = usePlatformStore();
const overview = ref<SystemModelOverview>();
const busy = ref(false);
const loading = ref(false);
const tab = ref('models');
const detail = ref<SystemModel>();
const detailOpen = ref(false);
const updateOpen = ref(false);
const uploadOpen = ref(false);
const categories = [
  { value: 'unet', label: '扩散模型 · unet' },
  { value: 'loras', label: 'LoRA · loras' },
  { value: 'text_encoders', label: '文本编码器 · text_encoders' },
  { value: 'vae', label: 'VAE · vae' },
  { value: 'checkpoints', label: 'Checkpoint · checkpoints' },
  { value: 'controlnet', label: 'ControlNet · controlnet' },
  { value: 'upscale_models', label: '放大模型 · upscale_models' },
  { value: 'clip_vision', label: '视觉编码器 · clip_vision' },
];
const categoryLabels = Object.fromEntries(
  categories.map((c) => [c.value, c.label]),
);
const form = reactive({ name: '', category: 'loras', note: '', sha256: '' });
const files = ref<File[]>([]);
const uploadId = ref('');
const uploadedBytes = ref(0);
const uploading = ref(false);
const uploadMessage = ref('');
let controller: AbortController | undefined;
let poll: ReturnType<typeof setInterval> | undefined;
let fetching = false;
let alive = true;
const directoryInput = ref<HTMLInputElement>();
const fileInput = ref<HTMLInputElement>();
const selectedModel = ref<SystemModel>();
const selectedKeys = ref<string[]>([]);
const replacements = reactive<Record<string, string>>({});
const totalBytes = computed(() => files.value.reduce((n, f) => n + f.size, 0));
const uploadPercent = computed(() =>
  totalBytes.value
    ? Math.floor((uploadedBytes.value / totalBytes.value) * 100)
    : 0,
);
const referenceKey = (r: ModelReference) =>
  `${r.capabilityCode}:${r.nodeId}:${r.inputName}`;
const references = computed(() =>
  (overview.value?.references ?? []).filter(
    (r) => r.category === selectedModel.value?.category,
  ),
);
const readyFiles = computed(() =>
  (selectedModel.value?.files ?? []).filter((f) =>
    /\.(safetensors|gguf|bin|pt|pth|ckpt)$/i.test(f.path),
  ),
);
const plans = computed(() =>
  (overview.value?.updates ?? []).filter(
    (p) => !selectedModel.value || p.modelId === selectedModel.value.id,
  ),
);
const uploads = computed(() => overview.value?.models ?? []);
const uploadSubmitted = ref(false);
function managedName(id: string, path: string) {
  return `platform/${id}/${path}`;
}
const library = computed(() => {
  const result: Array<{
    bytes?: number;
    category: string;
    filename: string;
    key: string;
    model?: SystemModel;
    name: string;
    references: number;
    source: string;
    status: string;
  }> = [];
  const seen = new Set<string>();
  for (const choice of overview.value?.choices ?? [])
    for (const filename of choice.files) {
      const key = `${choice.category}:${filename}`;
      if (
        seen.has(key) ||
        filename.startsWith('platform/') ||
        !/\.(safetensors|gguf|bin|pt|pth|ckpt|model)$/i.test(filename)
      )
        continue;
      seen.add(key);
      result.push({
        key,
        name: filename.split('/').at(-1) ?? filename,
        filename,
        category: choice.category,
        source: '预置挂载',
        status: '服务已识别',
        references: (overview.value?.references ?? []).filter(
          (r) => r.category === choice.category && r.filename === filename,
        ).length,
      });
    }
  for (const model of overview.value?.models ?? []) {
    if (model.status !== 'ready') continue;
    const known = (overview.value?.choices ?? []).some(
      (c) =>
        c.category === model.category &&
        model.files.some((f) =>
          c.files.includes(managedName(model.id, f.path)),
        ),
    );
    result.unshift({
      key: model.id,
      name: model.name,
      filename: model.files.map((f) => f.path).join('、'),
      category: model.category,
      source: '管理员上传',
      bytes: model.totalBytes,
      status: known ? '服务已识别' : '已入库，待服务识别',
      references: (overview.value?.references ?? []).filter((r) =>
        model.files.some((f) => r.filename === managedName(model.id, f.path)),
      ).length,
      model,
    });
  }
  return result;
});
const modelRecord = (value: unknown) => value as SystemModel;
const planRecord = (value: unknown) => value as ModelUpdate;
const columns = [
  { title: '模型 / 文件名', key: 'name' },
  { title: '类型与来源', key: 'category', width: 180 },
  { title: '状态 / 引用', key: 'status', width: 170 },
  { title: '操作', key: 'actions', width: 190 },
];
const uploadColumns = [
  { title: '模型', dataIndex: 'name', key: 'name' },
  { title: '状态与进度', key: 'status' },
  { title: '操作', key: 'actions', width: 180 },
];
const planColumns = [
  { title: '工作流 / 新版本', key: 'workflowName' },
  { title: '试运行', key: 'testStatus' },
  { title: '操作', key: 'actions', width: 230 },
];
function errorText(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message;
  return error instanceof Error ? error.message : '操作失败，请查看提示后重试';
}
function formatBytes(value?: number) {
  if (value === undefined) return '—';
  const unit = value >= 1024 ** 3 ? 1024 ** 3 : 1024 ** 2;
  return `${(value / unit).toFixed(1)} ${unit === 1024 ** 3 ? 'GiB' : 'MiB'}`;
}
function statusLabel(status: string) {
  return (
    (
      {
        uploading: '待上传 / 可续传',
        queued: '等待校验',
        verifying: '校验入库中',
        ready: '已入库',
        failed: '入库失败',
        cancelled: '已取消',
      } as Record<string, string>
    )[status] ?? status
  );
}
async function refresh(silent = false) {
  if (fetching) return;
  fetching = true;
  if (!silent) loading.value = true;
  try {
    const value = await getSystemModelsApi();
    if (alive) overview.value = value;
  } catch (error) {
    if (!silent) message.error(errorText(error));
  } finally {
    fetching = false;
    loading.value = false;
  }
}
function startPolling() {
  if (!poll)
    poll = setInterval(() => {
      if (!uploading.value) void refresh(true);
    }, 5000);
}
function stopPolling() {
  if (poll) clearInterval(poll);
  poll = undefined;
}
function pauseUpload() {
  controller?.abort();
}
function openUpload(category = 'loras', name = '') {
  if (uploading.value) return;
  Object.assign(form, { category, name, note: '', sha256: '' });
  files.value = [];
  uploadId.value = '';
  uploadedBytes.value = 0;
  uploadMessage.value = '';
  uploadSubmitted.value = false;
  uploadOpen.value = true;
}
function chooseFiles(event: Event) {
  const element = event.target as HTMLInputElement;
  files.value = [...(element.files ?? [])];
  const first = files.value[0];
  if (first && !form.name) form.name = first.name.replace(/\.[^.]+$/, '');
  element.value = '';
}
async function resume(model: SystemModel) {
  Object.assign(form, {
    category: model.category,
    name: model.name,
    note: model.note,
    sha256: model.files.length === 1 ? (model.files[0]?.sha256 ?? '') : '',
  });
  uploadId.value = model.id;
  uploadSubmitted.value = false;
  files.value = [];
  uploadedBytes.value = 0;
  uploadMessage.value = '请重新选择原文件或原目录，系统核对内容后续传。';
  uploadOpen.value = true;
}
async function startUpload() {
  if (!form.name.trim() || files.value.length === 0) {
    message.warning('请输入模型名称并选择模型文件');
    return;
  }
  if (form.sha256 && !/^[a-fA-F0-9]{64}$/.test(form.sha256)) {
    message.warning('SHA-256 应为 64 位十六进制字符');
    return;
  }
  if (form.sha256 && files.value.length !== 1) {
    message.warning(
      '整目录上传请使用目录内分片索引，单文件校验值只适用于一个文件',
    );
    return;
  }
  uploading.value = true;
  const activeController = new AbortController();
  controller = activeController;
  uploadMessage.value = '正在准备上传';
  try {
    if (!uploadId.value) {
      const manifest = selectedModelFiles(files.value);
      const firstFile = manifest[0];
      if (form.sha256 && firstFile) firstFile.sha256 = form.sha256;
      const created = await createSystemModelApi({
        name: form.name,
        category: form.category,
        note: form.note,
        files: manifest,
      });
      uploadId.value = created.id;
    }
    const id = uploadId.value;
    const status = await getModelUploadApi(id);
    if (status.status !== 'uploading')
      throw new Error('上传任务已进入校验或已关闭，请在上传任务中查看');
    matchResumeFiles(status.files, files.value);
    await resumeModelUpload({
      status,
      files: files.value,
      signal: activeController.signal,
      send: (file, part, blob) =>
        putModelPartApi(id, file, part, blob, activeController.signal),
      progress: (bytes) => {
        uploadedBytes.value = bytes;
        uploadMessage.value = `已确认 ${formatBytes(bytes)} / ${formatBytes(totalBytes.value)}`;
      },
    });
    if (activeController.signal.aborted)
      throw new DOMException('上传已暂停', 'AbortError');
    await completeSystemModelApi(id);
    uploadSubmitted.value = true;
    uploadMessage.value =
      '文件上传完成，后台正在校验入库。可关闭弹窗并在上传任务中查看。';
    tab.value = 'uploads';
    message.success('已提交后台校验');
  } catch (error) {
    uploadMessage.value = activeController.signal.aborted
      ? '上传已暂停，可重新选择原文件继续。'
      : errorText(error);
    message.warning(uploadMessage.value);
  } finally {
    uploading.value = false;
    await refresh(true);
  }
}
async function cancelUpload(model: SystemModel) {
  Modal.confirm({
    title: '取消此上传任务？',
    content: '仅清理本次未入库的分片，已入库模型与预置模型保持不变。',
    onOk: async () => {
      await cancelSystemModelApi(model.id);
      await refresh();
    },
  });
}
function openUpdate(model: SystemModel) {
  selectedModel.value = model;
  selectedKeys.value = [];
  for (const key of Object.keys(replacements)) replacements[key] = '';
  updateOpen.value = true;
}
function candidateFiles(reference: ModelReference) {
  const model = selectedModel.value;
  if (!model) return [];
  const choice = overview.value?.choices.find(
    (c) =>
      c.category === model.category &&
      c.classType === reference.classType &&
      c.inputName === reference.inputName,
  );
  return readyFiles.value
    .filter(
      (f) =>
        choice?.files.includes(managedName(model.id, f.path)) &&
        reference.filename !== managedName(model.id, f.path),
    )
    .map((f) => ({ label: f.path, value: f.path }));
}
async function prepare() {
  if (!selectedModel.value) return;
  const selected = references.value.filter((r) =>
    selectedKeys.value.includes(referenceKey(r)),
  );
  if (
    selected.length === 0 ||
    selected.some((r) => !replacements[referenceKey(r)])
  ) {
    message.warning('请选择工作流节点及对应的新模型文件');
    return;
  }
  busy.value = true;
  try {
    const groups = new Map<string, ModelReference[]>();
    for (const r of selected) {
      const group = groups.get(r.capabilityCode) ?? [];
      group.push(r);
      groups.set(r.capabilityCode, group);
    }
    for (const group of groups.values()) {
      const first = group[0];
      if (!first) continue;
      await prepareModelUpdateApi(selectedModel.value.id, {
        capabilityCode: first.capabilityCode,
        baseVersionId: first.versionId,
        replacements: group.map((r) => ({
          nodeId: r.nodeId,
          inputName: r.inputName,
          oldValue: r.filename,
          filePath: replacements[referenceKey(r)] ?? '',
        })),
      });
    }
    selectedKeys.value = [];
    await refresh();
    message.success('已生成待验证版本，当前工作流绑定尚未改变');
  } catch (error) {
    message.error(errorText(error));
    await refresh(true);
  } finally {
    busy.value = false;
  }
}
function testPlan(plan: ModelUpdate) {
  if (!store.currentProjectId) {
    message.warning('请先在平台选择一个有写权限的项目，再进入试运行');
    return;
  }
  void router.push({
    path: `/workspace/${plan.appKey}`,
    query: { modelUpdateId: plan.id },
  });
}
async function publish(plan: ModelUpdate) {
  Modal.confirm({
    title: '发布模型更新？',
    content: `将 ${plan.workflowName} 的后续新任务切换到 v${plan.version}。旧版本、历史任务和旧模型保留。`,
    onOk: async () => {
      await publishModelUpdateApi(plan.id);
      await refresh();
      message.success('新版本已发布');
    },
  });
}
function openDetail(model: SystemModel) {
  detail.value = model;
  detailOpen.value = true;
}
onMounted(() => {
  void refresh();
  startPolling();
});
onActivated(() => {
  alive = true;
  void refresh(true);
  startPolling();
});
onDeactivated(() => {
  stopPolling();
  pauseUpload();
});
onBeforeUnmount(() => {
  alive = false;
  stopPolling();
  pauseUpload();
});
</script>

<template>
  <Page
    title="模型管理"
    description="管理员上传 ComfyUI 模型，校验入库后更新指定工作流的模型引用。"
  >
    <Spin :spinning="loading">
      <div class="models-toolbar">
        <Space>
          <Button @click="router.push('/administration/workflows')">
            工作流管理
          </Button>
          <Button @click="refresh()">刷新</Button>
        </Space>
        <Button
          type="primary"
          :disabled="!overview?.storageConfigured"
          @click="openUpload()"
        >
          上传模型
        </Button>
      </div>
      <Alert
        v-if="overview && !overview.storageConfigured"
        type="warning"
        show-icon
        message="管理员模型存储尚未配置，暂不可上传；预置模型仍可使用。"
      />
      <Alert
        v-if="overview?.serviceError"
        type="warning"
        show-icon
        :message="overview.serviceError"
        class="models-notice"
      />
      <Card class="models-card">
        <Tabs v-model:active-key="tab">
          <TabPane key="models" tab="模型库">
            <Table
              :columns="columns"
              :data-source="library"
              row-key="key"
              :scroll="{ x: 760 }"
              :pagination="{ pageSize: 15, showSizeChanger: true }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <strong>{{ record.name }}</strong>
                  <p class="models-muted models-filename">
                    {{ record.filename }}
                  </p>
                </template>
                <template v-else-if="column.key === 'category'">
                  {{ categoryLabels[record.category] }}
                  <p class="models-muted">
                    {{ record.source }} · {{ formatBytes(record.bytes) }}
                  </p>
                </template>
                <template v-else-if="column.key === 'status'">
                  <Tag
                    :color="
                      record.status === '服务已识别' ? 'success' : 'warning'
                    "
                  >
                    {{ record.status }}
                  </Tag>
                  <p class="models-muted">
                    {{ record.references }} 处工作流引用
                  </p>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <Space wrap>
                    <Button
                      v-if="record.model"
                      size="small"
                      @click="openDetail(record.model)"
                    >
                      详情
                    </Button>
                    <Button
                      size="small"
                      @click="openUpload(record.category, record.name)"
                    >
                      上传新版本
                    </Button>
                    <Button
                      v-if="record.model"
                      size="small"
                      @click="openUpdate(record.model)"
                    >
                      用于工作流
                    </Button>
                  </Space>
                </template>
              </template>
            </Table>
            <p class="models-muted">
              预置模型只读；新上传模型独立入库，不直接覆盖同名文件。ComfyUI
              不可达时无法枚举预置库存。
            </p>
          </TabPane>
          <TabPane key="uploads" tab="上传任务">
            <Table
              :columns="uploadColumns"
              :data-source="uploads"
              row-key="id"
              :scroll="{ x: 650 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'status'">
                  <Tag>{{ statusLabel(record.status) }}</Tag>
                  <Progress
                    v-if="
                      ['uploading', 'queued', 'verifying'].includes(
                        record.status,
                      )
                    "
                    :percent="record.progress"
                  />
                  <p v-if="record.error" class="models-error">
                    {{ record.error }}
                  </p>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <Space wrap>
                    <Button
                      v-if="record.status === 'uploading'"
                      size="small"
                      @click="resume(modelRecord(record))"
                    >
                      继续上传
                    </Button>
                    <Button
                      v-if="['uploading', 'failed'].includes(record.status)"
                      size="small"
                      danger
                      @click="cancelUpload(modelRecord(record))"
                    >
                      取消上传
                    </Button>
                  </Space>
                </template>
              </template>
            </Table>
          </TabPane>
          <TabPane key="updates" tab="更新计划">
            <Table
              :columns="planColumns"
              :data-source="overview?.updates ?? []"
              row-key="id"
              :scroll="{ x: 700 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'workflowName'">
                  {{ record.workflowName }} · v{{ record.version }}
                  <p class="models-muted">
                    {{ record.publishedAt ? '已发布' : '未改变当前绑定' }}
                  </p>
                </template>
                <template v-else-if="column.key === 'testStatus'">
                  <Tag
                    :color="
                      record.testStatus === 'succeeded' ? 'success' : undefined
                    "
                  >
                    {{ record.testPublicId ?? '尚未试运行' }}
                    <StatusPill
                      v-if="record.testStatus"
                      :status="record.testStatus"
                    />
                  </Tag>
                </template>
                <template v-else-if="column.key === 'actions'">
                  <Space wrap>
                    <Button
                      v-if="!record.publishedAt"
                      size="small"
                      @click="testPlan(planRecord(record))"
                    >
                      试运行
                    </Button>
                    <Button
                      v-if="!record.publishedAt"
                      size="small"
                      :disabled="record.testStatus !== 'succeeded'"
                      @click="publish(planRecord(record))"
                    >
                      发布并切换
                    </Button>
                    <Tag v-else color="success">已发布</Tag>
                  </Space>
                </template>
              </template>
            </Table>
          </TabPane>
        </Tabs>
      </Card>
    </Spin>
    <Modal
      v-model:open="uploadOpen"
      title="上传模型"
      :footer="null"
      :width="820"
      :mask-closable="!uploading"
      :closable="!uploading"
    >
      <div class="models-upload-grid">
        <section>
          <label>
            模型类型
            <Select
              v-model:value="form.category"
              :options="categories"
              :disabled="Boolean(uploadId)"
            />
          </label>
          <label>
            模型名称
            <Input
              v-model:value="form.name"
              :maxlength="100"
              :disabled="Boolean(uploadId)"
            />
          </label>
          <label>
            版本备注
            <Input.TextArea
              v-model:value="form.note"
              :maxlength="1000"
              :disabled="Boolean(uploadId)"
            />
          </label>
          <label>
            保存位置
            <Input
              :value="`管理员模型库 / ComfyUI / ${form.category}`"
              readonly
            />
          </label>
          <label>
            预期 SHA-256（可选，仅单文件）
            <Input v-model:value="form.sha256" :disabled="Boolean(uploadId)" />
          </label>
        </section>
        <section>
          <div class="models-drop">
            <strong>选择模型文件或完整分片目录</strong>
            <p class="models-muted">分片上传 · 支持暂停与断点续传</p>
            <Space wrap>
              <Button :disabled="uploading" @click="fileInput?.click()">
                选择文件
              </Button>
              <Button :disabled="uploading" @click="directoryInput?.click()">
                选择目录
              </Button>
            </Space>
            <input
              ref="fileInput"
              hidden
              type="file"
              multiple
              @change="chooseFiles"
            />
            <input
              ref="directoryInput"
              hidden
              type="file"
              webkitdirectory
              multiple
              @change="chooseFiles"
            />
          </div>
          <p class="models-filename">
            {{
              files.map((f) => f.webkitRelativePath || f.name).join('、') ||
              '尚未选择文件'
            }}
          </p>
          <p class="models-muted">
            {{ files.length }} 个文件 · {{ formatBytes(totalBytes) }}
          </p>
          <Progress :percent="uploadPercent" />
          <p role="status">{{ uploadMessage }}</p>
          <Alert
            type="info"
            message="文件校验入库后，还需选择工作流并试运行；不会自动切换当前模型。"
          />
        </section>
      </div>
      <div class="models-footer">
        <Button v-if="uploading" @click="pauseUpload">暂停上传</Button>
        <Button v-else @click="uploadOpen = false">关闭</Button>
        <Button
          type="primary"
          v-if="!uploadSubmitted"
          :loading="uploading"
          :disabled="uploading"
          @click="startUpload"
        >
          {{ uploadId ? '继续上传 / 提交校验' : '开始上传' }}
        </Button>
        <Button
          v-else
          type="primary"
          @click="
            uploadOpen = false;
            tab = 'models';
          "
        >
          查看模型库
        </Button>
      </div>
    </Modal>
    <Drawer v-model:open="detailOpen" title="模型详情" :width="560">
      <template v-if="detail">
        <h3>{{ detail.name }}</h3>
        <p>
          {{ categoryLabels[detail.category] }} ·
          {{ formatBytes(detail.totalBytes) }}
        </p>
        <p>{{ detail.note }}</p>
        <div
          v-for="file in detail.files"
          :key="file.path"
          class="models-file-detail"
        >
          <strong class="models-filename">{{ file.path }}</strong>
          <p class="models-muted">
            ComfyUI 名称：{{ managedName(detail.id, file.path) }}
          </p>
          <p class="models-muted models-filename">
            SHA-256：{{ file.actualSha256 ?? '未校验' }}
          </p>
        </div>
        <Button
          type="primary"
          @click="
            detailOpen = false;
            openUpdate(detail);
          "
        >
          用于工作流
        </Button>
      </template>
    </Drawer>
    <Modal
      v-model:open="updateOpen"
      title="用于工作流"
      :width="1050"
      :footer="null"
    >
      <p>
        新模型：{{
          selectedModel?.name
        }}。勾选节点并选择对应文件，生成新版本后进入原有工作区试运行。
      </p>
      <Alert
        v-if="overview?.serviceError"
        type="warning"
        :message="overview.serviceError"
      />
      <div class="models-reference-list">
        <div
          v-for="reference in references"
          :key="referenceKey(reference)"
          class="models-reference"
        >
          <Checkbox
            :checked="selectedKeys.includes(referenceKey(reference))"
            :disabled="!candidateFiles(reference).length"
            @change="
              (e) => {
                selectedKeys = e.target.checked
                  ? [...selectedKeys, referenceKey(reference)]
                  : selectedKeys.filter((k) => k !== referenceKey(reference));
              }
            "
          >
            {{ reference.workflowName }} · v{{ reference.version }}
          </Checkbox>
          <p class="models-muted">
            节点 {{ reference.nodeId }} · {{ reference.classType }} ·
            {{ reference.inputName }}
          </p>
          <p class="models-filename">当前：{{ reference.filename }}</p>
          <Select
            v-model:value="replacements[referenceKey(reference)]"
            :aria-label="`${reference.workflowName} 节点 ${reference.nodeId} 的新模型文件`"
            :options="candidateFiles(reference)"
            placeholder="选择被此节点识别的新模型文件"
            :disabled="!candidateFiles(reference).length"
          />
        </div>
        <p v-if="!references.length" class="models-muted">
          当前没有同类型的工作流模型引用。
        </p>
      </div>
      <div class="models-footer">
        <Button @click="updateOpen = false">关闭</Button>
        <Button
          type="primary"
          :loading="busy"
          :disabled="!selectedKeys.length"
          @click="prepare"
        >
          生成待验证版本
        </Button>
      </div>
      <Table
        :columns="planColumns"
        :data-source="plans"
        row-key="id"
        size="small"
        :scroll="{ x: 700 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'workflowName'">
            {{ record.workflowName }} · v{{ record.version }}
          </template>
          <template v-else-if="column.key === 'testStatus'">
            <Tag>
              {{ record.testPublicId ?? '尚未试运行' }}
              <StatusPill
                v-if="record.testStatus"
                :status="record.testStatus"
              />
            </Tag>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space wrap>
              <Button
                v-if="!record.publishedAt"
                size="small"
                @click="testPlan(planRecord(record))"
              >
                试运行
              </Button>
              <Button
                v-if="!record.publishedAt"
                size="small"
                :disabled="record.testStatus !== 'succeeded'"
                @click="publish(planRecord(record))"
              >
                发布并切换
              </Button>
              <Tag v-else color="success">已发布</Tag>
            </Space>
          </template>
        </template>
      </Table>
    </Modal>
  </Page>
</template>

<style scoped>
.models-toolbar,
.models-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin: 0 0 16px;
}

.models-footer {
  justify-content: flex-end;
  margin: 20px 0 0;
}

.models-card,
.models-notice {
  margin-top: 16px;
}

.models-muted {
  margin: 6px 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.models-filename {
  max-width: 100%;
  overflow-wrap: anywhere;
}

.models-error {
  color: hsl(var(--destructive));
  overflow-wrap: anywhere;
}

.models-upload-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.models-upload-grid label {
  display: grid;
  gap: 6px;
  margin-bottom: 16px;
}

.models-upload-grid :deep(.ant-select) {
  width: 100%;
}

.models-drop {
  padding: 24px 14px;
  text-align: center;
  border: 1px dashed hsl(var(--border));
  border-radius: 10px;
}

.models-reference-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 16px;
}

.models-reference,
.models-file-detail {
  min-width: 0;
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.models-reference :deep(.ant-select) {
  width: 100%;
}

@media (width<=720px) {
  .models-upload-grid,
  .models-reference-list {
    grid-template-columns: 1fr;
  }
}
</style>
