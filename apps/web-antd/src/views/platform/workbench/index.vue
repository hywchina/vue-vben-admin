<script setup lang="ts">
import type {
  WorkbenchItem,
  WorkbenchPage,
  WorkbenchSection,
} from '#/api/platform/workbench';
import type {
  AssetFolder,
  PlatformAsset,
  PlatformJob,
} from '#/modules/platform/types';

import {
  computed,
  onActivated,
  onDeactivated,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Empty,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Spin,
  Tooltip,
} from 'ant-design-vue';

import {
  getAssetApi,
  getAssetDownloadApi,
  getAssetFoldersApi,
  getAssetPreviewApi,
  saveWorkflowOutputApi,
} from '#/api/platform/assets';
import {
  createDesignConversationApi,
  getDesignConversationsApi,
} from '#/api/platform/design-conversations';
import { cancelJobApi, getJobsApi } from '#/api/platform/jobs';
import { getWorkbenchApi } from '#/api/platform/workbench';
import AssetModelPreview from '#/components/platform/asset-model-preview.vue';
import AssetTextPreview from '#/components/platform/asset-text-preview.vue';
import ComfyMaskIcon from '#/components/platform/comfy-mask-icon.vue';
import ImageLightbox from '#/components/platform/image-lightbox.vue';
import StatusPill from '#/components/platform/status-pill.vue';
import { assetCategoryLabel } from '#/modules/platform/asset-browser';
import {
  assetImageActions,
  assetImageActionUnavailable,
} from '#/modules/platform/asset-image-actions';
import { usePlatformStore } from '#/store';
import ProjectManager from '#/views/platform/overview/index.vue';

import { getWorkbenchTools } from '../overview/workbench-tools';
import SectionItems from './section-items.vue';

const router = useRouter();
const store = usePlatformStore();
const user = useUserStore();
const tools = computed(() =>
  getWorkbenchTools(user.userRoles.includes('admin')),
);
const route = useRoute();
const projectsOpen = ref(false);
const projectCreateRequested = ref(false);
function openProjects(create = false) {
  projectCreateRequested.value = create;
  projectsOpen.value = true;
}
async function closeProjects() {
  projectsOpen.value = false;
  if (route.query.panel === 'projects') {
    const { panel: _panel, create: _create, ...query } = route.query;
    await router.replace({ path: '/projects', query });
  }
  await refresh();
}
watch(
  () => route.fullPath,
  () => {
    if (route.path !== '/projects') projectsOpen.value = false;
    else if (route.query.panel === 'projects')
      openProjects(route.query.create === 'true');
  },
  { immediate: true },
);
const definitions: Array<{
  count: number;
  key: WorkbenchSection;
  note: string;
  title: string;
}> = [
  {
    key: 'designs',
    title: '我的设计',
    note: '继续会话，查看多轮设计历史',
    count: 2,
  },
  {
    key: 'projects',
    title: '我的项目',
    note: '查看项目与管理协作',
    count: 2,
  },
  {
    key: 'tasks',
    title: '最近任务',
    note: '设计生成、模型训练与报告执行',
    count: 3,
  },
  {
    key: 'results',
    title: '最近设计成果',
    note: '我生成的成果，包含尚未保存的内容',
    count: 3,
  },
  {
    key: 'saved',
    title: '最近保存资产',
    note: '可访问项目中最近入库的资产',
    count: 3,
  },
];
interface SectionState extends WorkbenchPage {
  loading: boolean;
  error: boolean;
  version: number;
}
const emptySection = (): SectionState => ({
  items: [],
  total: 0,
  loading: true,
  error: false,
  version: 0,
});
const states = reactive<Record<WorkbenchSection, SectionState>>({
  designs: emptySection(),
  projects: emptySection(),
  tasks: emptySection(),
  results: emptySection(),
  saved: emptySection(),
});
const activeOnly = ref(false);
const busy = ref(false);
const listSection = ref<WorkbenchSection>();
const listPage = ref(1);
const list = reactive<SectionState>({
  items: [],
  total: 0,
  loading: false,
  error: false,
  version: 0,
});
const listTitle = computed(
  () => definitions.find((item) => item.key === listSection.value)?.title,
);
let alive = true;
let timer: ReturnType<typeof setTimeout> | undefined;
async function loadSection(section: WorkbenchSection, quiet = false) {
  const state = states[section];
  const version = ++state.version;
  if (!quiet) state.loading = true;
  try {
    const result = await getWorkbenchApi(
      section,
      definitions.find((item) => item.key === section)?.count ?? 3,
      1,
      section === 'tasks' && activeOnly.value,
    );
    if (version !== state.version || !alive) return;
    Object.assign(state, result, { error: false });
  } catch {
    if (version === state.version) state.error = true;
  } finally {
    if (version === state.version) state.loading = false;
  }
}
async function refresh(quiet = false) {
  await Promise.all(definitions.map(({ key }) => loadSection(key, quiet)));
}
async function loadList(page = 1) {
  const section = listSection.value;
  if (!section) return;
  const version = ++list.version;
  listPage.value = page;
  list.loading = true;
  try {
    const result = await getWorkbenchApi(
      section,
      12,
      page,
      section === 'tasks' && activeOnly.value,
    );
    if (version === list.version) Object.assign(list, result, { error: false });
  } catch {
    if (version === list.version) list.error = true;
  } finally {
    if (version === list.version) list.loading = false;
  }
}
function openList(section: WorkbenchSection) {
  if (section === 'projects') {
    openProjects();
    return;
  }
  list.items = [];
  list.error = false;
  listSection.value = section;
  void loadList();
}
async function filterTasks(value: boolean) {
  activeOnly.value = value;
  await loadSection('tasks');
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!alive) return;
    if (document.visibilityState === 'visible' && !busy.value) {
      await refresh(true);
      if (listSection.value) await loadList(listPage.value);
      if (
        task.value &&
        ['cancelling', 'queued', 'running'].includes(task.value.status)
      )
        await refreshTask().catch(() => undefined);
    }
    if (alive) schedule();
  }, 15_000);
}
onMounted(async () => {
  await refresh();
  schedule();
});
onActivated(() => {
  alive = true;
  void refresh(true);
  schedule();
});
onDeactivated(() => {
  alive = false;
  clearTimeout(timer);
});
onUnmounted(() => {
  alive = false;
  clearTimeout(timer);
});

async function navigate(
  projectId: string,
  path: string,
  query?: Record<string, string>,
) {
  await store.switchProject(projectId);
  listSection.value = undefined;
  task.value = undefined;
  await router.push({ path, query });
}
const createOpen = ref(false);
const designName = ref('');
const designProjectId = ref('');
function newDesign() {
  if (store.projects.length === 0) {
    openProjects(true);
    return;
  }
  designName.value = '';
  designProjectId.value = store.currentProjectId || store.projects[0]?.id || '';
  createOpen.value = true;
}
async function createDesign() {
  if (!designProjectId.value || busy.value) return;
  busy.value = true;
  try {
    const conversation = await createDesignConversationApi({
      projectId: designProjectId.value,
      title: designName.value.trim() || undefined,
    });
    createOpen.value = false;
    await navigate(designProjectId.value, '/design', {
      conversationId: conversation.id,
    });
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}
function showError(error: unknown) {
  message.error(error instanceof Error ? error.message : '操作失败，请重试');
}

const previewItem = ref<WorkbenchItem>();
const previewUrl = ref('');
const previewAsset =
  ref<
    Pick<PlatformAsset, 'sourceAppKey' | 'sourceJobId' | 'status' | 'type'>
  >();
const previewFormat = ref('glb');
const previewLoading = ref(false);
const previewError = ref(false);
let previewVersion = 0;
async function preview(item: WorkbenchItem) {
  const version = ++previewVersion;
  previewItem.value = item;
  previewUrl.value = '';
  previewError.value = false;
  previewAsset.value = undefined;
  previewFormat.value = '';
  previewLoading.value = item.type !== 'text';
  if (item.type === 'text') return;
  try {
    if (item.type === 'model3d') {
      const asset = item.saved ? await getAssetApi(item.id) : undefined;
      const format =
        asset?.format || (item.filename || item.name).split('.').pop() || 'glb';
      if (version === previewVersion)
        previewFormat.value = format.toLowerCase();
      return;
    }
    const [result, asset] = await Promise.all([
      getAssetPreviewApi(item.id),
      item.saved
        ? getAssetApi(item.id)
        : Promise.resolve({
            type: item.type ?? 'image',
            status: 'available' as const,
            sourceAppKey: item.appKey,
            sourceJobId: item.jobId,
          }),
    ]);
    if (version === previewVersion) previewAsset.value = asset;
    if (version === previewVersion && result.mode === 'url')
      previewUrl.value = result.url;
  } catch {
    if (version === previewVersion) previewError.value = true;
  } finally {
    if (version === previewVersion) previewLoading.value = false;
  }
}
async function download(item: WorkbenchItem) {
  const result = await getAssetDownloadApi(item.id);
  const url =
    result.mode === 'inline'
      ? URL.createObjectURL(
          new Blob([result.content], { type: result.mimeType }),
        )
      : result.url;
  const link = document.createElement('a');
  link.href = url;
  link.download = item.filename || item.name;
  link.rel = 'noopener noreferrer';
  if (result.mode === 'url') link.target = '_blank';
  link.click();
  if (result.mode === 'inline')
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const saveItem = ref<WorkbenchItem>();
const folders = ref<AssetFolder[]>([]);
const folderId = ref('');
const afterSave = ref('');
const folderOptions = computed(() => [
  { value: '', label: '项目根目录' },
  ...folders.value
    .filter((item) => item.kind !== 'favorites')
    .map((item) => {
      const parts = [item.name];
      const seen = new Set([item.id]);
      let parent = folders.value.find((entry) => entry.id === item.parentId);
      while (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        parts.unshift(parent.name);
        parent = folders.value.find((entry) => entry.id === parent?.parentId);
      }
      return {
        value: item.id,
        label: `${assetCategoryLabel(item.generationCategory)} / ${parts.join(' / ')}`,
      };
    }),
]);
async function prepareSave(item: WorkbenchItem, imageAction = '') {
  folders.value = await getAssetFoldersApi(item.projectId);
  folderId.value = '';
  afterSave.value = imageAction;
  saveItem.value = item;
}
async function confirmSave() {
  const item = saveItem.value;
  if (!item || busy.value) return;
  busy.value = true;
  try {
    await saveWorkflowOutputApi(item.id, folderId.value || undefined);
    item.saved = true;
    saveItem.value = undefined;
    message.success('已保存至项目资产');
    await refresh(true);
    if (task.value) await refreshTask();
    if (listSection.value) await loadList(listPage.value);
    if (afterSave.value) await editImage(item, afterSave.value);
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}
function imageActionUnavailable(key: string) {
  if (!previewItem.value?.canWrite) return '没有项目编辑权限';
  return previewAsset.value
    ? assetImageActionUnavailable(
        previewAsset.value,
        key,
        store.applications.filter((app) => app.visible).map((app) => app.key),
      )
    : '图片加载中';
}
async function useImageAction(key: string) {
  const item = previewItem.value;
  if (!item || busy.value || imageActionUnavailable(key)) return;
  busy.value = true;
  try {
    await editImage(item, key);
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}
async function editImage(item: WorkbenchItem, key: string) {
  if (!item.saved) {
    previewItem.value = undefined;
    await prepareSave(item, key);
    return;
  }
  const conversations = await getDesignConversationsApi(item.projectId);
  const existing = conversations.find(
    (conversation) => conversation.id === item.conversationId,
  );
  const conversation =
    existing ??
    (await createDesignConversationApi({ projectId: item.projectId }));
  await navigate(item.projectId, '/design', {
    sourceAssetId: item.id,
    assetAction: key,
    conversationId: conversation.id,
  });
  previewItem.value = undefined;
}
const task = ref<PlatformJob>();
const taskSource = ref<WorkbenchItem>();
let taskRequestVersion = 0;
async function refreshTask() {
  const source = taskSource.value;
  if (!source) return;
  const version = ++taskRequestVersion;
  const jobs = await getJobsApi(source.projectId, { search: source.name });
  if (version === taskRequestVersion && taskSource.value?.id === source.id)
    task.value = jobs.find((job) => job.id === source.id);
}
const taskOutputs = computed<WorkbenchItem[]>(() => {
  const current = task.value;
  const source = taskSource.value;
  if (!current || !source) return [];
  return current.outputs.map((output) => ({
    id: output.assetId,
    name: output.name,
    projectId: current.projectId,
    projectName: source.projectName,
    updatedAt: current.createdAt,
    canWrite: source.canWrite,
    type: output.kind,
    appKey: current.appKey,
    jobId: current.id,
    mimeType: output.mimeType,
    saved: output.saved,
    conversationId: current.designConversationId,
    previewAssetId: output.kind === 'image' ? output.assetId : undefined,
  }));
});
async function action(actionName: string, item: WorkbenchItem) {
  if (actionName === 'projects') {
    openProjects();
    return;
  }
  if (busy.value) return;
  busy.value = true;
  try {
    switch (actionName) {
      case 'assets': {
        await navigate(item.projectId, '/assets', {
          projectId: item.projectId,
        });
        break;
      }
      case 'design': {
        await navigate(item.projectId, '/design', {
          conversationId: item.id,
          ...(item.appKey ? { appKey: item.appKey } : {}),
        });
        break;
      }
      case 'download': {
        await download(item);
        break;
      }
      case 'folder': {
        const asset = await getAssetApi(item.id);
        await navigate(item.projectId, '/assets', {
          projectId: item.projectId,
          folderId: asset.folderId || 'root',
          module: asset.generationCategory || 'unclassified',
        });
        break;
      }
      case 'preview': {
        await preview(item);
        break;
      }
      case 'save': {
        await prepareSave(item);
        break;
      }
      case 'stop': {
        const result = await cancelJobApi(item.id);
        message.success(
          result.status === 'cancelled' ? '任务已取消' : '已提交取消请求',
        );
        await loadSection('tasks', true);
        if (listSection.value === 'tasks') await loadList(listPage.value);
        if (task.value?.id === item.id) await refreshTask();
        break;
      }
      case 'task': {
        taskSource.value = item;
        await refreshTask();
        if (!task.value) message.warning('任务已被归档或不可访问');
        break;
      }
    }
  } catch (error) {
    showError(error);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="workbench-page">
    <header class="wb-heading">
      <div>
        <h1>设计工作台</h1>
        <p>继续设计，跟进任务，管理项目成果。</p>
      </div>
      <Button type="primary" size="large" :disabled="busy" @click="newDesign">
        <template #icon><IconifyIcon icon="lucide:plus" /></template>
        新建设计
      </Button>
    </header>
    <div class="wb-grid">
      <section
        v-for="definition in definitions"
        :key="definition.key"
        class="wb-panel"
        :class="[`wb-panel--${definition.key}`]"
        :aria-label="definition.title"
      >
        <header class="wb-panel-heading">
          <div>
            <h2>
              {{ definition.title }}
              <span v-if="!states[definition.key].error">
                {{ states[definition.key].total }}
              </span>
            </h2>
            <p>{{ definition.note }}</p>
          </div>
          <Button type="link" @click="openList(definition.key)">
            查看全部
          </Button>
        </header>
        <div v-if="definition.key === 'tasks'" class="wb-task-filter">
          <Button
            :type="activeOnly ? 'text' : 'primary'"
            size="small"
            @click="filterTasks(false)"
          >
            全部
          </Button>
          <Button
            :type="activeOnly ? 'primary' : 'text'"
            size="small"
            @click="filterTasks(true)"
          >
            进行中
          </Button>
        </div>
        <div v-if="states[definition.key].error" class="wb-state" role="alert">
          加载失败，请稍后重试
          <Button type="link" @click="loadSection(definition.key)">重试</Button>
        </div>
        <Spin v-else :spinning="states[definition.key].loading">
          <SectionItems
            v-if="states[definition.key].items.length"
            :section="definition.key"
            :items="states[definition.key].items"
            :busy="busy || states[definition.key].loading"
            @action="action"
          />
          <div v-else class="wb-state">
            <Empty
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
              :description="
                states[definition.key].loading
                  ? '正在加载'
                  : definition.key === 'tasks' && activeOnly
                    ? '当前没有进行中的任务'
                    : `暂无${definition.title.replace('我的', '').replace('最近', '')}`
              "
            />
          </div>
        </Spin>
        <Button
          v-if="
            definition.key === 'designs' &&
            !states.designs.loading &&
            !states.designs.items.length &&
            !states.designs.error
          "
          block
          @click="newDesign"
        >
          开始第一个设计
        </Button>
      </section>
    </div>
    <footer class="wb-management">
      <span>管理与记录</span>
      <Button type="text" @click="openProjects()">项目管理</Button>
      <Button
        v-for="tool in tools"
        :key="tool.key"
        type="text"
        @click="router.push(tool.path)"
      >
        {{ tool.title }}
      </Button>
      <Button type="text" @click="refresh()">刷新工作台</Button>
    </footer>

    <Modal
      :open="projectsOpen"
      title="我的项目"
      :footer="null"
      width="1120px"
      :destroy-on-close="true"
      @cancel="closeProjects"
    >
      <div class="wb-project-dialog">
        <ProjectManager
          v-if="projectsOpen"
          embedded
          :initial-create="projectCreateRequested"
        />
      </div>
    </Modal>
    <Modal
      :open="Boolean(listSection)"
      :title="listTitle"
      :footer="null"
      width="1060px"
      @cancel="
        listSection = undefined;
        ++list.version;
      "
    >
      <div class="wb-dialog">
        <div v-if="list.error" role="alert">
          加载失败
          <Button @click="loadList(listPage)">重试</Button>
        </div>
        <Spin v-else :spinning="list.loading">
          <SectionItems
            v-if="listSection && list.items.length"
            :section="listSection"
            :items="list.items"
            :busy="busy || list.loading"
            @action="action"
          />
          <Empty v-else description="暂无记录" />
        </Spin>
        <Pagination
          :current="listPage"
          :total="list.total"
          :page-size="12"
          :show-size-changer="false"
          @change="loadList"
        />
      </div>
    </Modal>
    <Modal
      v-model:open="createOpen"
      title="新建设计"
      ok-text="创建并开始设计"
      :confirm-loading="busy"
      @ok="createDesign"
    >
      <div class="wb-form">
        <label for="wb-project">所属项目</label>
        <Select
          id="wb-project"
          v-model:value="designProjectId"
          :options="
            store.projects.map((item) => ({ label: item.name, value: item.id }))
          "
          placeholder="请选择项目"
        />
        <label for="wb-design-name">设计名称</label>
        <Input
          id="wb-design-name"
          v-model:value="designName"
          :maxlength="120"
          placeholder="例如：商务座客室布局优化"
          @press-enter="createDesign"
        />
      </div>
    </Modal>
    <Modal
      :open="Boolean(saveItem)"
      :title="afterSave ? '保存成果并继续编辑' : '保存至项目资产'"
      :confirm-loading="busy"
      ok-text="确认保存"
      @ok="confirmSave"
      @cancel="saveItem = undefined"
    >
      <div class="wb-form">
        <p>{{ saveItem?.projectName }} · {{ saveItem?.name }}</p>
        <p v-if="afterSave">成果保存为项目资产后，可继续编辑。</p>
        <label for="wb-save-folder">保存目录</label>
        <Select
          id="wb-save-folder"
          v-model:value="folderId"
          :options="folderOptions"
        />
      </div>
    </Modal>
    <ImageLightbox
      :open="Boolean(previewItem?.type === 'image' && !previewError)"
      :title="previewItem?.name"
      :url="previewUrl || undefined"
      @update:open="
        previewItem = undefined;
        ++previewVersion;
      "
    >
      <template #actions>
        <div class="asset-image-actions" aria-label="图片操作">
          <Tooltip
            v-for="imageAction in assetImageActions"
            :key="imageAction.key"
            :title="
              imageActionUnavailable(imageAction.key) || imageAction.label
            "
          >
            <span>
              <button
                type="button"
                :aria-label="imageAction.label"
                :disabled="
                  busy || Boolean(imageActionUnavailable(imageAction.key))
                "
                @click="useImageAction(imageAction.key)"
              >
                <ComfyMaskIcon v-if="imageAction.key === 'mask'" :size="16" />
                <IconifyIcon v-else :icon="imageAction.icon" />
              </button>
            </span>
          </Tooltip>
        </div>
      </template>
    </ImageLightbox>

    <Modal
      :open="
        Boolean(previewItem) && (previewItem?.type !== 'image' || previewError)
      "
      :title="previewItem?.name"
      :footer="null"
      width="960px"
      destroy-on-close
      @cancel="
        previewItem = undefined;
        ++previewVersion;
      "
    >
      <div v-if="previewItem" class="wb-preview">
        <AssetModelPreview
          v-if="
            previewItem.type === 'model3d' && previewFormat && !previewError
          "
          :asset-id="previewItem.id"
          :name="previewItem.name"
          :format="previewFormat"
        />
        <AssetTextPreview
          v-else-if="previewItem.type === 'text'"
          :asset-id="previewItem.id"
        />
        <Spin v-else :spinning="previewLoading">
          <div v-if="previewError" role="alert">
            预览加载失败
            <Button @click="preview(previewItem)">重试</Button>
          </div>
          <img
            v-else-if="previewUrl && previewItem.type === 'image'"
            :src="previewUrl"
            :alt="previewItem.name"
          />
          <video
            v-else-if="previewUrl && previewItem.type === 'video'"
            :src="previewUrl"
            controls
          ></video>
          <audio
            v-else-if="previewUrl && previewItem.type === 'audio'"
            :src="previewUrl"
            controls
          ></audio>
          <iframe
            v-else-if="previewUrl && previewItem.mimeType === 'application/pdf'"
            :src="previewUrl"
            title="PDF 预览"
            sandbox=""
          ></iframe>
          <p v-else-if="!previewLoading">此格式请下载后查看。</p>
        </Spin>
        <Button :disabled="busy" @click="action('download', previewItem)">
          下载文件
        </Button>
      </div>
    </Modal>
    <Modal
      :open="Boolean(task)"
      :title="task?.name"
      :footer="null"
      width="960px"
      @cancel="
        task = undefined;
        taskSource = undefined;
      "
    >
      <div v-if="task" class="wb-task-detail">
        <StatusPill :status="task.status" />
        <p>
          {{ taskSource?.projectName }} · {{ taskSource?.appName }} ·
          {{ task.publicId }}
        </p>
        <p>
          {{ task.stage }}
          <span
            v-if="['queued', 'running', 'cancelling'].includes(task.status)"
          >
            {{ task.progress }}%
          </span>
        </p>
        <p v-if="task.error" role="alert">{{ task.error.message }}</p>
        <Button
          v-if="task.designConversationId"
          :disabled="busy"
          @click="
            navigate(task.projectId, '/design', {
              conversationId: task.designConversationId,
            })
          "
        >
          进入设计会话
        </Button>
        <Button :disabled="busy" @click="refreshTask().catch(showError)">
          刷新状态
        </Button>
        <Button
          v-if="
            taskSource?.canWrite && ['queued', 'running'].includes(task.status)
          "
          danger
          :disabled="busy"
          @click="action('stop', taskSource)"
        >
          停止
        </Button>
        <h3>执行成果</h3>
        <SectionItems
          v-if="taskOutputs.length"
          section="results"
          :items="taskOutputs"
          :busy="busy"
          @action="action"
        />
        <Empty v-else description="尚无可用成果" />
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.wb-project-dialog {
  max-height: 76vh;
  overflow: auto;
}

.workbench-page {
  width: 100%;
  max-width: 1520px;
  padding: 30px 36px 20px;
  margin: 0 auto;
}

.wb-heading {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.wb-heading h1 {
  margin: 0;
  font-size: 27px;
  font-weight: 600;
  color: var(--rail-theme-text, #25303e);
}

.wb-heading p {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--rail-theme-secondary, #88929f);
}

.wb-heading :deep(.ant-btn) {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
}

.wb-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: stretch;
}

.wb-panel {
  min-width: 0;
  padding: 20px;
  background: var(--rail-theme-surface, #fff);
  border: 1px solid var(--rail-theme-border, #e9edf1);
  border-radius: 10px;
  box-shadow: 0 2px 5px #202c3a03;
}

.wb-panel--tasks {
  grid-column: 1 / -1;
}

.wb-panel-heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.wb-panel-heading h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--rail-theme-text, #293544);
}

.wb-panel-heading h2 span {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--rail-theme-muted, #9aa3ae);
}

.wb-panel-heading p {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--rail-theme-muted, #929ba7);
}

.wb-panel-heading :deep(.ant-btn) {
  flex-shrink: 0;
  padding: 0;
  font-size: 12px;
  color: var(--rail-theme-secondary, #87919d);
}

.wb-task-filter {
  display: flex;
  gap: 10px;
  margin: -4px 0 5px;
}

.wb-task-filter :deep(.ant-btn) {
  font-size: 12px;
}

.wb-state {
  display: grid;
  place-items: center;
  min-height: 138px;
  color: var(--rail-theme-secondary, #8f98a4);
}

.wb-management {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 20px;
  font-size: 12px;
  color: var(--rail-theme-muted, #99a1ad);
}

.wb-management :deep(.ant-btn) {
  font-size: 12px;
  color: var(--rail-theme-secondary, #828d9b);
}

.wb-dialog {
  max-height: 72vh;
  overflow: auto;
}

.wb-dialog :deep(.ant-pagination) {
  margin-top: 24px;
  text-align: right;
}

.wb-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 0;
}

.wb-preview {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wb-preview img,
.wb-preview video {
  display: block;
  max-width: 100%;
  max-height: 65vh;
  margin: auto;
  object-fit: contain;
}

.wb-preview iframe {
  width: 100%;
  height: 65vh;
  border: 0;
}

.wb-task-detail p {
  margin: 12px 0;
  color: var(--rail-theme-secondary, #7c8795);
}

.wb-task-detail h3 {
  margin: 22px 0 12px;
}

.wb-task-detail > :deep(.ant-btn) {
  margin-right: 8px;
}

@media (max-width: 1100px) {
  .workbench-page {
    padding: 22px;
  }

  .wb-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .wb-panel {
    padding: 16px;
  }
}

@media (max-width: 900px) {
  .wb-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .wb-panel--tasks {
    grid-column: auto;
  }
}

@media (max-width: 480px) {
  .workbench-page {
    padding: 16px 12px;
  }

  .wb-heading h1 {
    font-size: 23px;
  }

  .wb-heading p {
    max-width: 180px;
    font-size: 12px;
  }

  .wb-heading {
    gap: 10px;
  }

  .wb-panel {
    padding: 14px;
  }

  .wb-panel-heading {
    gap: 8px;
  }

  .wb-panel-heading h2 {
    font-size: 15px;
  }
}

.asset-image-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.asset-image-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  color: var(--rail-theme-secondary, #78838e);
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.asset-image-actions button:hover {
  color: var(--rail-theme-accent, #bd1934);
  background: var(--rail-theme-surface, #fff1f3);
}

.asset-image-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
</style>
