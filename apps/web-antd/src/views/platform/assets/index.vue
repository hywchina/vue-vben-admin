<script lang="ts" setup>
import type {
  AssetType,
  PlatformAsset,
  ProjectMember,
} from '#/modules/platform/types';

import { computed, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Checkbox,
  Drawer,
  Input,
  message,
  Modal,
  Select,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  getAssetApi,
  getAssetDownloadApi,
  getAssetPreviewApi,
  getProjectMembersApi,
} from '#/api';
import AssetModelPreview from '#/components/platform/asset-model-preview.vue';
import AssetTextPreview from '#/components/platform/asset-text-preview.vue';
import ImageLightbox from '#/components/platform/image-lightbox.vue';
import PageHeading from '#/components/platform/page-heading.vue';
import {
  assetTypeIcons,
  assetTypeLabels,
  assetTypeOptions,
  assetUploadAccept,
} from '#/modules/platform/asset-types';
import { usePlatformStore } from '#/store';

const platformStore = usePlatformStore();
const route = useRoute();
const router = useRouter();
const keyword = ref('');
const typeFilter = ref<'all' | AssetType>('all');
const sortValue = ref<
  | 'createdAt-asc'
  | 'createdAt-desc'
  | 'name-asc'
  | 'name-desc'
  | 'owner-asc'
  | 'owner-desc'
  | 'type-asc'
  | 'type-desc'
>('createdAt-desc');
const ownerFilter = ref('all');
const projectMembers = ref<ProjectMember[]>([]);
const selectedAsset = ref<null | PlatformAsset>(null);
const uploadOpen = ref(false);
const uploadName = ref('');
const uploadType = ref<AssetType>('image');
const uploadFile = ref<File>();
const uploadFileInput = ref<HTMLInputElement>();
const uploadText = ref('');
const uploadSubmitting = ref(false);
const assetPreviewUrls = reactive(new Map<string, string>());
const assetPreviewStatuses = reactive(
  new Map<string, 'error' | 'loading' | 'ready'>(),
);
const assetPreviewRequestKeys = new Map<string, string>();
const lightboxAsset = ref<null | PlatformAsset>(null);
const deletingAssetId = ref('');
const detailPreview = reactive({
  assetId: '',
  loading: false,
  text: '',
  unsupported: false,
  url: '',
});
let detailPreviewRequest = 0;
const detailPreviewCache = new Map<
  string,
  { text: string; unsupported: boolean; url: string }
>();
const detailPreviewLoading = computed(
  () =>
    detailPreview.assetId === selectedAsset.value?.id && detailPreview.loading,
);
const detailPreviewText = computed(() =>
  detailPreview.assetId === selectedAsset.value?.id ? detailPreview.text : '',
);
const detailPreviewUrl = computed(() =>
  detailPreview.assetId === selectedAsset.value?.id ? detailPreview.url : '',
);
const detailPreviewUnsupported = computed(
  () =>
    detailPreview.assetId === selectedAsset.value?.id &&
    detailPreview.unsupported,
);
const detailName = ref('');
const detailNameSaving = ref(false);
const currentFolderId = ref<null | string>(null);
const selectedAssetIds = ref<string[]>([]);
const viewMode = ref<'grid' | 'list'>('grid');
const folderModalOpen = ref(false);
const folderEditingId = ref('');
const folderName = ref('');
const batchModalOpen = ref(false);
const batchOperation = ref<'copy' | 'move'>('move');
const batchTargetFolderId = ref<null | string>(null);
const batchSubmitting = ref(false);
const favoriteUpdatingIds = ref(new Set<string>());

const typeOptions = [{ label: '全部类型', value: 'all' }, ...assetTypeOptions];
const sortOptions = [
  { label: '创建时间：最新优先', value: 'createdAt-desc' },
  { label: '创建时间：最早优先', value: 'createdAt-asc' },
  { label: '名称：A–Z', value: 'name-asc' },
  { label: '名称：Z–A', value: 'name-desc' },
  { label: '创建人：A–Z', value: 'owner-asc' },
  { label: '创建人：Z–A', value: 'owner-desc' },
  { label: '类型：正序', value: 'type-asc' },
  { label: '类型：倒序', value: 'type-desc' },
];
const memberOptions = computed(() => [
  { label: '全部成员', value: 'all' },
  ...projectMembers.value.map((member) => ({
    label: `${member.name} · ${member.publicId}`,
    value: member.userId,
  })),
]);

const uploadTypeOptions = assetTypeOptions;

watch(
  () => route.query.type,
  (type) => {
    const normalized = String(type ?? 'all');
    typeFilter.value = typeOptions.some((option) => option.value === normalized)
      ? (normalized as 'all' | AssetType)
      : 'all';
  },
  { immediate: true },
);

watch(
  () => route.query.assetId,
  async (value) => {
    const assetId = typeof value === 'string' ? value : '';
    if (!assetId) {
      selectedAsset.value = null;
      return;
    }
    const listedAsset = platformStore.currentAssets.find(
      (asset) => asset.id === assetId,
    );
    if (listedAsset) {
      selectedAsset.value = listedAsset;
      return;
    }
    try {
      const asset = await getAssetApi(assetId);
      if (asset.projectId !== platformStore.currentProjectId) {
        await platformStore.switchProject(asset.projectId);
      }
      if (route.query.assetId === assetId) selectedAsset.value = asset;
    } catch {
      if (route.query.assetId !== assetId) return;
      message.error('资产不存在或当前账号无权查看');
      const query = { ...route.query };
      delete query.assetId;
      await router.replace({ query });
    }
  },
  { immediate: true },
);

const uploadFileAccept = computed(() => {
  return uploadType.value === 'text'
    ? undefined
    : assetUploadAccept[uploadType.value];
});

const filteredAssets = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  return platformStore.currentAssets.filter((asset) => {
    const matchesType =
      typeFilter.value === 'all' || asset.type === typeFilter.value;
    const matchesKeyword =
      !normalized ||
      `${asset.name}${asset.publicId}${asset.owner}${asset.ownerPublicId}${asset.tags.join('')}`
        .toLowerCase()
        .includes(normalized);
    return matchesType && matchesKeyword;
  });
});
const currentFolder = computed(() =>
  platformStore.assetFolders.find(
    (folder) => folder.id === currentFolderId.value,
  ),
);
const isFavoritesFolder = computed(
  () => currentFolder.value?.kind === 'favorites',
);
const currentFolders = computed(() =>
  isFavoritesFolder.value
    ? []
    : platformStore.assetFolders
        .filter((folder) => folder.parentId === currentFolderId.value)
        .toSorted((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
);
const folderOptions = computed(() => [
  { label: '项目根目录', value: '__root__' },
  ...platformStore.assetFolders
    .filter((folder) => folder.kind === 'normal')
    .map((folder) => ({
      label: folderPathLabel(folder.id),
      value: folder.id,
    })),
]);
const breadcrumbs = computed(() => {
  const items: Array<{ id: null | string; name: string }> = [
    { id: null, name: '全部资产' },
  ];
  const chain: Array<{ id: string; name: string }> = [];
  let folderId = currentFolderId.value;
  const visited = new Set<string>();
  while (folderId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = platformStore.assetFolders.find(
      (item) => item.id === folderId,
    );
    if (!folder) break;
    chain.unshift({ id: folder.id, name: folder.name });
    folderId = folder.parentId;
  }
  return [...items, ...chain];
});

function folderPathLabel(folderId: string) {
  const names: string[] = [];
  let current = platformStore.assetFolders.find((item) => item.id === folderId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.name);
    current = current.parentId
      ? platformStore.assetFolders.find((item) => item.id === current?.parentId)
      : undefined;
  }
  return names.join(' / ');
}

function canPreviewAsset(asset: PlatformAsset) {
  const previewableType = asset.type === 'image';
  const previewableMime =
    !asset.mimeType || asset.mimeType.startsWith('image/');
  const available = !asset.status || asset.status === 'available';
  return previewableType && previewableMime && available;
}

async function loadAssetPreview(asset: PlatformAsset, requestKey: string) {
  assetPreviewStatuses.set(asset.id, 'loading');
  try {
    const preview = await getAssetPreviewApi(asset.id);
    if (preview.mode !== 'url') throw new Error('图片资产没有返回预览地址');
    if (assetPreviewRequestKeys.get(asset.id) !== requestKey) return;
    assetPreviewUrls.set(asset.id, preview.url);
    assetPreviewStatuses.set(asset.id, 'ready');
  } catch {
    if (assetPreviewRequestKeys.get(asset.id) !== requestKey) return;
    assetPreviewUrls.delete(asset.id);
    assetPreviewStatuses.set(asset.id, 'error');
  }
}

function handleAssetPreviewError(assetId: string) {
  assetPreviewUrls.delete(assetId);
  assetPreviewStatuses.set(assetId, 'error');
}

function resetDetailPreview(assetId = '') {
  detailPreviewRequest += 1;
  detailPreview.assetId = assetId;
  detailPreview.loading = false;
  detailPreview.text = '';
  detailPreview.unsupported = false;
  detailPreview.url = '';
}

function applyCachedDetailPreview(assetId: string) {
  const cached = detailPreviewCache.get(assetId);
  if (!cached) return false;
  detailPreview.assetId = assetId;
  detailPreview.loading = false;
  detailPreview.text = cached.text;
  detailPreview.unsupported = cached.unsupported;
  detailPreview.url = cached.url;
  return true;
}

async function loadDetailPreview(asset: PlatformAsset) {
  resetDetailPreview(asset.id);
  if (asset.type === 'image' || asset.type === 'text') return;
  const request = detailPreviewRequest;
  detailPreview.loading = true;
  try {
    const preview = await getAssetPreviewApi(asset.id);
    if (
      request !== detailPreviewRequest ||
      selectedAsset.value?.id !== asset.id
    ) {
      return;
    }
    if (preview.mode === 'inline') {
      detailPreview.text = preview.content;
    } else if (
      preview.mimeType.startsWith('text/') ||
      preview.mimeType === 'application/json'
    ) {
      const response = await fetch(preview.url);
      if (!response.ok) throw new Error('读取文本预览失败');
      const content = await response.text();
      if (
        request === detailPreviewRequest &&
        selectedAsset.value?.id === asset.id
      ) {
        detailPreview.text = content;
      }
    } else {
      detailPreview.url = preview.url;
    }
    detailPreviewCache.set(asset.id, {
      text: detailPreview.text,
      unsupported: false,
      url: detailPreview.url,
    });
  } catch {
    if (
      request === detailPreviewRequest &&
      selectedAsset.value?.id === asset.id
    ) {
      detailPreview.unsupported = true;
      detailPreviewCache.set(asset.id, {
        text: '',
        unsupported: true,
        url: '',
      });
    }
  } finally {
    if (
      request === detailPreviewRequest &&
      selectedAsset.value?.id === asset.id
    ) {
      detailPreview.loading = false;
    }
  }
}

watch(
  () =>
    selectedAsset.value
      ? `${selectedAsset.value.id}:${selectedAsset.value.version}`
      : '',
  async () => {
    const asset = selectedAsset.value;
    if (!asset) {
      resetDetailPreview();
      return;
    }
    if (canPreviewAsset(asset)) {
      const requestKey = `${asset.id}:${asset.version}`;
      if (assetPreviewRequestKeys.get(asset.id) !== requestKey) {
        assetPreviewRequestKeys.set(asset.id, requestKey);
        void loadAssetPreview(asset, requestKey);
      }
    }
    if (!applyCachedDetailPreview(asset.id)) {
      await loadDetailPreview(asset);
    }
  },
);

onBeforeRouteLeave(async () => {
  await platformStore.refreshCurrentProjectAssets();
});

watch(
  [
    sortValue,
    ownerFilter,
    currentFolderId,
    () => platformStore.currentProjectId,
  ],
  async ([value, ownerId, folderId, projectId], previous) => {
    if (!projectId) return;
    if (previous?.[3] && previous[3] !== projectId) {
      currentFolderId.value = null;
      ownerFilter.value = 'all';
      const result = await getProjectMembersApi(String(projectId));
      projectMembers.value = result.items;
    } else if (projectMembers.value.length === 0) {
      const result = await getProjectMembersApi(String(projectId));
      projectMembers.value = result.items;
    }
    const [sortBy, sortOrder] = value.split('-') as [
      'createdAt' | 'name' | 'owner' | 'type',
      'asc' | 'desc',
    ];
    selectedAssetIds.value = [];
    await platformStore.refreshCurrentProjectAssets({
      folderId: folderId || 'root',
      ownerId: ownerId === 'all' ? undefined : String(ownerId),
      sortBy,
      sortOrder,
    });
  },
  { immediate: true },
);

watch(
  () => selectedAsset.value?.id,
  () => {
    detailName.value = selectedAsset.value?.name ?? '';
  },
);

watch(
  () =>
    platformStore.currentAssets
      .map(
        (asset) =>
          `${asset.id}:${asset.version}:${asset.mimeType ?? ''}:${asset.status ?? ''}`,
      )
      .join('|'),
  () => {
    const previewableAssets =
      platformStore.currentAssets.filter(canPreviewAsset);
    const detailAsset = selectedAsset.value;
    if (
      detailAsset &&
      canPreviewAsset(detailAsset) &&
      !previewableAssets.some((asset) => asset.id === detailAsset.id)
    ) {
      previewableAssets.push(detailAsset);
    }
    const activeIds = new Set(previewableAssets.map((asset) => asset.id));

    for (const assetId of assetPreviewStatuses.keys()) {
      if (activeIds.has(assetId)) continue;
      assetPreviewStatuses.delete(assetId);
      assetPreviewUrls.delete(assetId);
      assetPreviewRequestKeys.delete(assetId);
    }

    for (const asset of previewableAssets) {
      const requestKey = `${asset.id}:${asset.version}`;
      if (assetPreviewRequestKeys.get(asset.id) === requestKey) continue;
      assetPreviewRequestKeys.set(asset.id, requestKey);
      void loadAssetPreview(asset, requestKey);
    }
  },
  { immediate: true },
);

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  uploadFile.value = input.files?.[0];
  if (uploadFile.value && !uploadName.value.trim()) {
    uploadName.value = uploadFile.value.name.replace(/\.[^.]+$/, '');
  }
}

function clearSelectedFile() {
  uploadFile.value = undefined;
  if (uploadFileInput.value) {
    uploadFileInput.value.value = '';
  }
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

watch(uploadType, clearSelectedFile);

function resetUploadForm() {
  uploadOpen.value = false;
  uploadName.value = '';
  uploadType.value = 'image';
  clearSelectedFile();
  uploadText.value = '';
}

async function registerAsset() {
  if (!uploadName.value.trim()) {
    message.warning('请输入资产名称');
    return;
  }
  if (uploadType.value === 'text' && !uploadText.value.trim()) {
    message.warning('请输入文本内容');
    return;
  }
  if (uploadType.value !== 'text' && !uploadFile.value) {
    message.warning('请选择需要上传的文件');
    return;
  }

  uploadSubmitting.value = true;
  try {
    if (uploadType.value === 'text') {
      await platformStore.createTextAsset({
        content: uploadText.value,
        folderId: currentFolderId.value ?? undefined,
        name: uploadName.value.trim(),
        tags: ['文本'],
      });
    } else if (uploadFile.value) {
      await platformStore.uploadAsset({
        file: uploadFile.value,
        folderId: currentFolderId.value ?? undefined,
        name: uploadName.value.trim(),
        tags: ['用户上传'],
        type: uploadType.value,
      });
    }
    resetUploadForm();
    message.success('资产已保存到当前项目');
  } finally {
    uploadSubmitting.value = false;
  }
}

function enterFolder(folderId: null | string) {
  currentFolderId.value = folderId;
}

async function openAssetDetail(asset: PlatformAsset) {
  const previewPromise =
    asset.type === 'image' || detailPreviewCache.has(asset.id)
      ? undefined
      : getAssetPreviewApi(asset.id);
  selectedAsset.value = asset;
  if (route.query.assetId !== asset.id) {
    await router.replace({
      query: { ...route.query, assetId: asset.id },
    });
  }
  if (!previewPromise) return;
  const preview = await previewPromise;
  if (preview.mode !== 'inline') return;
  detailPreviewCache.set(asset.id, {
    text: preview.content,
    unsupported: false,
    url: '',
  });
  if (selectedAsset.value?.id === asset.id) {
    resetDetailPreview(asset.id);
    applyCachedDetailPreview(asset.id);
  }
}

async function closeAssetDetail() {
  selectedAsset.value = null;
  if (!route.query.assetId) return;
  const query = { ...route.query };
  delete query.assetId;
  await router.replace({ query });
}

function openCreateFolder() {
  folderEditingId.value = '';
  folderName.value = '';
  folderModalOpen.value = true;
}

function openRenameFolder(folderId: string, name: string) {
  folderEditingId.value = folderId;
  folderName.value = name;
  folderModalOpen.value = true;
}

async function saveFolder() {
  const name = folderName.value.trim();
  if (!name) return;
  if (folderEditingId.value) {
    await platformStore.renameAssetFolder(folderEditingId.value, name);
    message.success('文件夹名称已更新');
  } else {
    await platformStore.createAssetFolder(name, currentFolderId.value);
    message.success('文件夹已创建');
  }
  folderModalOpen.value = false;
}

function confirmDeleteFolder(folderId: string, name: string) {
  Modal.confirm({
    cancelText: '取消',
    content:
      '该文件夹、所有子文件夹及其中资产会从资产中心软删除；任务和审计记录仍保留。',
    okButtonProps: { danger: true },
    okText: '递归删除',
    async onOk() {
      const result = await platformStore.deleteAssetFolder(folderId);
      if (currentFolderId.value === folderId) currentFolderId.value = null;
      message.success(
        `已删除 ${result.folderCount} 个文件夹和 ${result.assetCount} 项资产`,
      );
    },
    title: `删除“${name}”？`,
  });
}

function toggleAssetSelection(assetId: string, checked: boolean) {
  selectedAssetIds.value = checked
    ? [...new Set([...selectedAssetIds.value, assetId])]
    : selectedAssetIds.value.filter((id) => id !== assetId);
}

async function toggleAssetFavorite(asset: PlatformAsset) {
  const updating = new Set(favoriteUpdatingIds.value);
  updating.add(asset.id);
  favoriteUpdatingIds.value = updating;
  const [sortBy, sortOrder] = sortValue.value.split('-') as [
    'createdAt' | 'name' | 'owner' | 'type',
    'asc' | 'desc',
  ];
  try {
    await platformStore.toggleAssetFavorite(asset.id, {
      folderId: currentFolderId.value || 'root',
      ownerId: ownerFilter.value === 'all' ? undefined : ownerFilter.value,
      sortBy,
      sortOrder,
    });
    message.success(asset.favorite ? '已取消收藏' : '已添加到“收藏”文件夹');
  } finally {
    const nextUpdating = new Set(favoriteUpdatingIds.value);
    nextUpdating.delete(asset.id);
    favoriteUpdatingIds.value = nextUpdating;
  }
}

function toggleSelectAll() {
  selectedAssetIds.value =
    selectedAssetIds.value.length === filteredAssets.value.length
      ? []
      : filteredAssets.value.map((asset) => asset.id);
}

function clearAssetSelection() {
  selectedAssetIds.value = [];
}

function openBatch(operation: 'copy' | 'move') {
  batchOperation.value = operation;
  batchTargetFolderId.value = null;
  batchModalOpen.value = true;
}

async function submitBatch() {
  batchSubmitting.value = true;
  try {
    await platformStore.batchAssets(
      selectedAssetIds.value,
      batchOperation.value,
      batchTargetFolderId.value,
      currentFolderId.value,
    );
    selectedAssetIds.value = [];
    batchModalOpen.value = false;
    message.success(
      batchOperation.value === 'move' ? '资产已移动' : '资产已复制',
    );
  } finally {
    batchSubmitting.value = false;
  }
}

function confirmBatchDelete() {
  Modal.confirm({
    cancelText: '取消',
    content: `确定软删除已选择的 ${selectedAssetIds.value.length} 项资产吗？任务血缘与审计记录仍会保留。`,
    okButtonProps: { danger: true },
    okText: '批量删除',
    async onOk() {
      await platformStore.batchAssets(
        selectedAssetIds.value,
        'delete',
        null,
        currentFolderId.value,
      );
      selectedAssetIds.value = [];
      message.success('所选资产已删除');
    },
    title: '批量删除资产',
  });
}

async function openAssetContent(asset: PlatformAsset) {
  const result = await getAssetDownloadApi(asset.id);
  if (result.mode === 'url') {
    window.open(result.url, '_blank', 'noopener,noreferrer');
    return;
  }
  Modal.info({
    content: result.content,
    okText: '关闭',
    title: asset.name,
    width: 640,
  });
}

function openImagePreview(asset: PlatformAsset) {
  if (!canPreviewAsset(asset) || !assetPreviewUrls.get(asset.id)) return;
  lightboxAsset.value = asset;
}

function confirmDeleteAsset(asset: PlatformAsset) {
  Modal.confirm({
    cancelText: '取消',
    content: '删除后将从资产中心移除，相关历史任务血缘仍会保留。',
    okButtonProps: { danger: true },
    okText: '确认删除',
    onOk: async () => {
      deletingAssetId.value = asset.id;
      try {
        await platformStore.deleteAsset(asset.id);
        await closeAssetDetail();
        lightboxAsset.value = null;
        message.success('资产已删除');
      } finally {
        deletingAssetId.value = '';
      }
    },
    title: `删除“${asset.name}”？`,
  });
}

async function saveAssetName() {
  const asset = selectedAsset.value;
  const name = detailName.value.trim();
  if (!asset || !name) {
    message.warning('资产名称不能为空');
    return;
  }
  if (name === asset.name) return;
  detailNameSaving.value = true;
  try {
    selectedAsset.value = await platformStore.renameAsset(asset.id, name);
    message.success('资产名称已更新');
  } finally {
    detailNameSaving.value = false;
  }
}
</script>

<template>
  <main class="platform-page assets-page">
    <PageHeading
      :description="`当前项目：${platformStore.currentProject?.name}。上传素材与应用输出在这里统一管理。`"
      eyebrow="Shared asset registry"
      title="资产中心"
    >
      <template #extra>
        <Button
          :disabled="!platformStore.currentProjectId || isFavoritesFolder"
          type="primary"
          @click="uploadOpen = true"
        >
          <IconifyIcon class="mr-1" icon="lucide:upload" />
          登记资产
        </Button>
      </template>
    </PageHeading>

    <div class="platform-content">
      <section class="platform-panel">
        <div class="asset-file-toolbar">
          <nav aria-label="资产文件夹路径" class="asset-breadcrumbs">
            <template
              v-for="(item, index) in breadcrumbs"
              :key="item.id ?? 'root'"
            >
              <IconifyIcon v-if="index" icon="lucide:chevron-right" />
              <button type="button" @click="enterFolder(item.id)">
                {{ item.name }}
              </button>
            </template>
          </nav>
          <div class="asset-file-actions">
            <Button :disabled="isFavoritesFolder" @click="openCreateFolder">
              <IconifyIcon icon="lucide:folder-plus" />
              新建文件夹
            </Button>
            <Button @click="toggleSelectAll">
              {{
                selectedAssetIds.length === filteredAssets.length &&
                filteredAssets.length
                  ? '取消全选'
                  : '全选'
              }}
            </Button>
            <div class="asset-view-switch" aria-label="视图方式">
              <button
                :class="{ active: viewMode === 'grid' }"
                aria-label="网格视图"
                type="button"
                @click="viewMode = 'grid'"
              >
                <IconifyIcon icon="lucide:grid-2x2" />
              </button>
              <button
                :class="{ active: viewMode === 'list' }"
                aria-label="列表视图"
                type="button"
                @click="viewMode = 'list'"
              >
                <IconifyIcon icon="lucide:list" />
              </button>
            </div>
          </div>
        </div>
        <div class="rail-toolbar">
          <div class="asset-filters">
            <Input
              v-model:value="keyword"
              allow-clear
              class="asset-search"
              placeholder="搜索名称、标签或创建人"
            >
              <template #prefix><IconifyIcon icon="lucide:search" /></template>
            </Input>
            <Select
              v-model:value="typeFilter"
              :options="typeOptions"
              class="asset-type-filter"
            />
            <Select
              v-model:value="ownerFilter"
              aria-label="按项目成员筛选资产"
              :options="memberOptions"
              class="asset-owner-filter"
            />
            <Select
              v-model:value="sortValue"
              aria-label="资产排序"
              :options="sortOptions"
              class="asset-sort-filter"
            />
          </div>
          <div class="asset-total">{{ filteredAssets.length }} 项资产</div>
        </div>

        <div v-if="currentFolders.length" class="asset-folder-grid">
          <article
            v-for="folder in currentFolders"
            :key="folder.id"
            :data-folder-id="folder.id"
            class="asset-folder-card"
            role="button"
            tabindex="0"
            @click="enterFolder(folder.id)"
            @keydown.enter="enterFolder(folder.id)"
          >
            <IconifyIcon
              :icon="
                folder.kind === 'favorites' ? 'lucide:star' : 'lucide:folder'
              "
            />
            <span>
              <strong>{{ folder.name }}</strong>
              <small>{{ folder.assetCount }} 项资产</small>
            </span>
            <div v-if="folder.kind === 'normal'">
              <button
                :aria-label="`重命名文件夹${folder.name}`"
                type="button"
                @click.stop="openRenameFolder(folder.id, folder.name)"
              >
                <IconifyIcon icon="lucide:pencil" />
              </button>
              <button
                :aria-label="`删除文件夹${folder.name}`"
                type="button"
                @click.stop="confirmDeleteFolder(folder.id, folder.name)"
              >
                <IconifyIcon icon="lucide:trash-2" />
              </button>
            </div>
          </article>
        </div>

        <div v-if="selectedAssetIds.length" class="asset-batch-bar">
          <strong>已选择 {{ selectedAssetIds.length }} 项</strong>
          <Button @click="clearAssetSelection">
            <IconifyIcon icon="lucide:x" />
            取消选择
          </Button>
          <Button :disabled="isFavoritesFolder" @click="openBatch('move')">
            <IconifyIcon icon="lucide:folder-input" />
            移动到
          </Button>
          <Button :disabled="isFavoritesFolder" @click="openBatch('copy')">
            <IconifyIcon icon="lucide:copy" />
            复制到
          </Button>
          <Button danger @click="confirmBatchDelete">
            <IconifyIcon icon="lucide:trash-2" />
            删除
          </Button>
        </div>

        <div
          v-if="filteredAssets.length"
          :class="viewMode === 'list' ? 'asset-list' : 'asset-grid'"
        >
          <article
            v-for="asset in filteredAssets"
            :key="asset.id"
            :data-asset-id="asset.id"
            class="asset-card"
            tabindex="0"
            @click="openAssetDetail(asset)"
            @keydown.enter="openAssetDetail(asset)"
          >
            <Checkbox
              :checked="selectedAssetIds.includes(asset.id)"
              :class="{
                'is-selected': selectedAssetIds.includes(asset.id),
              }"
              :aria-label="`选择资产${asset.name}`"
              class="asset-card__select asset-card__corner-action"
              @click.stop
              @change="
                toggleAssetSelection(asset.id, Boolean($event.target.checked))
              "
            />
            <div
              :class="{ 'has-image-preview': canPreviewAsset(asset) }"
              class="asset-card__preview"
              :style="{ '--asset-accent': asset.accent }"
            >
              <img
                v-if="
                  assetPreviewStatuses.get(asset.id) === 'ready' &&
                  assetPreviewUrls.get(asset.id)
                "
                :alt="`${asset.name} 缩略图`"
                :src="assetPreviewUrls.get(asset.id)"
                class="asset-card__image"
                decoding="async"
                loading="lazy"
                @error="handleAssetPreviewError(asset.id)"
                @click.stop="openImagePreview(asset)"
              />
              <div
                v-else-if="canPreviewAsset(asset)"
                class="asset-preview-state"
              >
                <IconifyIcon
                  :class="{
                    'is-loading':
                      assetPreviewStatuses.get(asset.id) !== 'error',
                  }"
                  :icon="
                    assetPreviewStatuses.get(asset.id) === 'error'
                      ? 'lucide:image-off'
                      : 'lucide:loader-circle'
                  "
                />
                <small>
                  {{
                    assetPreviewStatuses.get(asset.id) === 'error'
                      ? '图片预览暂不可用'
                      : '正在加载图片'
                  }}
                </small>
              </div>
              <IconifyIcon v-else :icon="assetTypeIcons[asset.type]" />
              <button
                :aria-label="asset.favorite ? '取消收藏' : '收藏资产'"
                :class="{
                  'is-favorite': asset.favorite,
                  'is-updating': favoriteUpdatingIds.has(asset.id),
                }"
                :disabled="favoriteUpdatingIds.has(asset.id)"
                :title="asset.favorite ? '取消收藏' : '收藏资产'"
                class="asset-card__favorite asset-card__corner-action"
                type="button"
                @click.stop="toggleAssetFavorite(asset)"
              >
                <IconifyIcon icon="lucide:star" />
              </button>
            </div>
            <div class="asset-card__body">
              <div class="asset-card__type">
                {{ assetTypeLabels[asset.type] }}
              </div>
              <h2>{{ asset.name }}</h2>
              <code>{{ asset.publicId }}</code>
              <p>{{ asset.description }}</p>
              <div class="asset-card__tags">
                <Tag v-for="tag in asset.tags" :key="tag">{{ tag }}</Tag>
              </div>
              <div class="asset-card__meta">
                <span>{{ asset.owner }} · {{ asset.ownerPublicId }}</span>
                <span>V{{ asset.version }}</span>
                <span>{{ asset.createdAt }}</span>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="rail-empty">
          <div>
            <IconifyIcon class="empty-icon" icon="lucide:package-open" />
            <p>没有符合条件的资产</p>
            <small>调整筛选条件，或者登记一项新资产。</small>
          </div>
        </div>
      </section>
    </div>

    <Modal
      v-model:open="folderModalOpen"
      :title="folderEditingId ? '重命名文件夹' : '新建文件夹'"
      :ok-button-props="{ disabled: !folderName.trim() }"
      :ok-text="folderEditingId ? '保存' : '创建'"
      @ok="saveFolder"
    >
      <Input
        v-model:value="folderName"
        :maxlength="120"
        placeholder="输入文件夹名称"
        @press-enter="saveFolder"
      />
    </Modal>

    <Modal
      v-model:open="batchModalOpen"
      :confirm-loading="batchSubmitting"
      :ok-text="batchOperation === 'move' ? '移动' : '复制'"
      :title="batchOperation === 'move' ? '移动所选资产' : '复制所选资产'"
      @ok="submitBatch"
    >
      <p>选择目标文件夹，复制会创建独立资产，不与原文件共享对象。</p>
      <Select
        :options="folderOptions"
        :value="batchTargetFolderId ?? '__root__'"
        class="w-full"
        @change="
          (value) =>
            (batchTargetFolderId = value === '__root__' ? null : String(value))
        "
      />
    </Modal>

    <Drawer
      :open="Boolean(selectedAsset)"
      :title="selectedAsset?.name"
      :width="selectedAsset?.type === 'model3d' ? 980 : 420"
      @close="closeAssetDetail"
    >
      <template v-if="selectedAsset">
        <div class="asset-detail-name-editor">
          <label for="asset-detail-name">资产名称</label>
          <div>
            <Input
              id="asset-detail-name"
              v-model:value="detailName"
              :maxlength="200"
              @keydown.enter="saveAssetName"
            />
            <Button
              :disabled="
                !detailName.trim() || detailName.trim() === selectedAsset.name
              "
              :loading="detailNameSaving"
              type="primary"
              @click="saveAssetName"
            >
              保存名称
            </Button>
          </div>
        </div>
        <div
          :class="{
            'has-image-preview': canPreviewAsset(selectedAsset),
          }"
          class="asset-detail-preview"
          :style="{ '--asset-accent': selectedAsset.accent }"
        >
          <img
            v-if="
              assetPreviewStatuses.get(selectedAsset.id) === 'ready' &&
              assetPreviewUrls.get(selectedAsset.id)
            "
            :alt="`${selectedAsset.name} 预览图`"
            :src="assetPreviewUrls.get(selectedAsset.id)"
            class="asset-detail-preview__image"
            @error="handleAssetPreviewError(selectedAsset.id)"
            @click="openImagePreview(selectedAsset)"
          />
          <AssetTextPreview
            v-else-if="selectedAsset.type === 'text'"
            :asset-id="selectedAsset.id"
          />
          <pre
            v-else-if="detailPreviewText"
            class="asset-detail-preview__text"
            >{{ detailPreviewText }}</pre>
          <video
            v-else-if="selectedAsset.type === 'video' && detailPreviewUrl"
            :src="detailPreviewUrl"
            class="asset-detail-preview__media"
            controls
            preload="metadata"
          ></video>
          <audio
            v-else-if="selectedAsset.type === 'audio' && detailPreviewUrl"
            :src="detailPreviewUrl"
            class="asset-detail-preview__audio"
            controls
            preload="metadata"
          ></audio>
          <iframe
            v-else-if="
              selectedAsset.mimeType === 'application/pdf' && detailPreviewUrl
            "
            :src="detailPreviewUrl"
            class="asset-detail-preview__document"
            title="资产文档预览"
          ></iframe>
          <AssetModelPreview
            v-else-if="selectedAsset.type === 'model3d'"
            :asset-id="selectedAsset.id"
            :format="selectedAsset.format"
            :name="selectedAsset.name"
          />
          <div
            v-else-if="detailPreviewLoading"
            class="asset-preview-state asset-detail-preview__state"
          >
            <IconifyIcon class="is-loading" icon="lucide:loader-circle" />
            <small>正在读取资产内容</small>
          </div>
          <div
            v-else-if="canPreviewAsset(selectedAsset)"
            class="asset-preview-state asset-detail-preview__state"
          >
            <IconifyIcon
              :class="{
                'is-loading':
                  assetPreviewStatuses.get(selectedAsset.id) !== 'error',
              }"
              :icon="
                assetPreviewStatuses.get(selectedAsset.id) === 'error'
                  ? 'lucide:image-off'
                  : 'lucide:loader-circle'
              "
            />
            <small>
              {{
                assetPreviewStatuses.get(selectedAsset.id) === 'error'
                  ? '图片预览暂不可用'
                  : '正在加载图片'
              }}
            </small>
          </div>
          <div v-else class="asset-preview-state asset-detail-preview__state">
            <IconifyIcon :icon="assetTypeIcons[selectedAsset.type]" />
            <small v-if="detailPreviewUnsupported">当前格式请下载后查看</small>
          </div>
          <span class="asset-detail-preview__format">
            {{ selectedAsset.format }}
          </span>
        </div>
        <div class="asset-detail-grid">
          <div>
            <span>资产 ID</span>
            <strong>{{ selectedAsset.publicId }}</strong>
          </div>
          <div>
            <span>文件类型</span>
            <strong>{{ assetTypeLabels[selectedAsset.type] }}</strong>
          </div>
          <div>
            <span>文件大小</span>
            <strong>{{ selectedAsset.size }}</strong>
          </div>
          <div>
            <span>版本</span>
            <strong>V{{ selectedAsset.version }}</strong>
          </div>
          <div>
            <span>创建人</span>
            <strong>
              {{ selectedAsset.owner }} · {{ selectedAsset.ownerPublicId }}
            </strong>
          </div>
          <div>
            <span>来源</span>
            <strong>
              {{ selectedAsset.source === 'upload' ? '用户上传' : '应用输出' }}
            </strong>
          </div>
          <div>
            <span>创建时间</span>
            <strong>{{ selectedAsset.createdAt }}</strong>
          </div>
        </div>
        <div class="asset-lineage">
          <div class="rail-section-label">来源追踪</div>
          <p>
            {{
              selectedAsset.sourceAppKey
                ? `由应用 ${selectedAsset.sourceAppKey} 生成`
                : '用户直接上传到当前项目'
            }}
          </p>
          <small v-if="selectedAsset.sourceJobId">
            来源任务：{{
              selectedAsset.sourceJobPublicId ?? selectedAsset.sourceJobId
            }}
          </small>
        </div>
        <Button
          block
          class="mt-4"
          type="primary"
          @click="openAssetContent(selectedAsset)"
        >
          {{ selectedAsset.type === 'text' ? '查看文本' : '下载文件' }}
        </Button>
        <Button
          block
          class="mt-2"
          danger
          :loading="deletingAssetId === selectedAsset.id"
          @click="confirmDeleteAsset(selectedAsset)"
        >
          <IconifyIcon icon="lucide:trash-2" />
          删除资产
        </Button>
      </template>
    </Drawer>

    <ImageLightbox
      :open="Boolean(lightboxAsset)"
      :title="lightboxAsset?.name"
      :url="lightboxAsset ? assetPreviewUrls.get(lightboxAsset.id) : undefined"
      @update:open="lightboxAsset = null"
    />

    <Modal
      v-model:open="uploadOpen"
      :confirm-loading="uploadSubmitting"
      ok-text="登记资产"
      title="登记项目资产"
      @cancel="resetUploadForm"
      @ok="registerAsset"
    >
      <div class="asset-upload-form">
        <label>
          <span class="form-field-label">资产名称</span>
          <Input
            v-model:value="uploadName"
            placeholder="输入清晰、可检索的名称"
          />
        </label>
        <label>
          <span class="form-field-label">文件类型</span>
          <Select
            v-model:value="uploadType"
            :options="uploadTypeOptions"
            class="w-full"
          />
        </label>
        <label v-if="uploadType === 'text'">
          <span class="form-field-label">文本内容</span>
          <Textarea
            v-model:value="uploadText"
            :rows="7"
            placeholder="输入设计说明、提示词、规范或其他项目文本"
          />
        </label>
        <label v-else class="upload-file-field">
          <span class="form-field-label">
            项目文件
            <em>必填</em>
          </span>
          <input
            ref="uploadFileInput"
            :accept="uploadFileAccept"
            class="upload-file-input"
            type="file"
            @change="handleFileChange"
          />
          <span
            :class="{ 'is-selected': uploadFile }"
            class="upload-file-picker"
          >
            <span class="upload-file-icon">
              <IconifyIcon
                :icon="
                  uploadFile ? 'lucide:file-check-2' : 'lucide:upload-cloud'
                "
              />
            </span>
            <span class="upload-file-copy">
              <strong>{{ uploadFile ? '文件已选择' : '上传项目文件' }}</strong>
              <small v-if="uploadFile" class="upload-file-meta">
                <b>{{ uploadFile.name }}</b>
                <span>{{ formatFileSize(uploadFile.size) }}</span>
              </small>
              <small v-else>
                选择与文件类型匹配的图片、视频、文档、模型或压缩包
              </small>
            </span>
            <span class="upload-file-action">
              {{ uploadFile ? '重新选择' : '点击选择文件' }}
            </span>
          </span>
        </label>
        <div class="upload-placeholder">
          <IconifyIcon icon="lucide:file-up" />
          <div>
            <strong>文件将保存到平台对象存储</strong>
            <p>
              数据库记录版本、来源、大小和权限；二进制内容不写入浏览器缓存。
            </p>
          </div>
        </div>
      </div>
    </Modal>
  </main>
</template>

<style scoped>
.asset-file-toolbar,
.asset-file-actions,
.asset-breadcrumbs,
.asset-batch-bar,
.asset-folder-card,
.asset-folder-card > div,
.asset-view-switch {
  display: flex;
  align-items: center;
}

.asset-file-toolbar {
  justify-content: space-between;
  min-height: 58px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--rail-line);
}

.asset-file-actions,
.asset-batch-bar {
  gap: 8px;
}

.asset-breadcrumbs {
  gap: 5px;
  color: #7a858c;
}

.asset-breadcrumbs button,
.asset-view-switch button,
.asset-folder-card button {
  padding: 5px;
  color: inherit;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.asset-breadcrumbs button:last-child {
  font-weight: 700;
  color: #273139;
}

.asset-view-switch {
  padding: 3px;
  background: #f3f5f6;
  border-radius: 8px;
}

.asset-view-switch button.active {
  color: var(--rail-red);
  background: #fff;
  box-shadow: 0 1px 4px rgb(31 42 49 / 12%);
}

.asset-folder-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  padding: 14px 16px 0;
}

.asset-folder-card {
  gap: 10px;
  min-width: 0;
  padding: 12px;
  cursor: pointer;
  border: 1px solid var(--rail-line);
  border-radius: 10px;
}

.asset-folder-card:hover {
  border-color: #d69ba5;
  box-shadow: 0 5px 16px rgb(31 42 49 / 7%);
}

.asset-folder-card > svg {
  flex: none;
  font-size: 24px;
  color: #c89242;
}

.asset-folder-card > span {
  display: grid;
  min-width: 0;
  margin-right: auto;
}

.asset-folder-card strong,
.asset-folder-card small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-folder-card small {
  color: #8a939c;
}

.asset-folder-card > div {
  gap: 2px;
  opacity: 0;
}

.asset-folder-card:hover > div,
.asset-folder-card:focus-within > div {
  opacity: 1;
}

.asset-batch-bar {
  position: sticky;
  top: 0;
  z-index: 4;
  padding: 10px 16px;
  color: #fff;
  background: #283038;
}

.asset-batch-bar strong {
  margin-right: auto;
}

.asset-card__corner-action {
  position: absolute;
  z-index: 3;
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--rail-ink);
  cursor: pointer;
  background: rgb(255 255 255 / 88%);
  border: 1px solid rgb(255 255 255 / 70%);
  border-radius: 7px;
  opacity: 0;
  transition:
    color 150ms ease,
    background-color 150ms ease,
    opacity 150ms ease,
    transform 150ms ease;
}

.asset-card__select {
  top: 10px;
  left: 10px;
  place-items: center;
  margin: 0;
}

.asset-card:hover .asset-card__corner-action,
.asset-card:focus-within .asset-card__corner-action,
.asset-card__corner-action.is-selected,
.asset-card__corner-action.is-favorite {
  opacity: 1;
}

.asset-card__corner-action:hover,
.asset-card__corner-action:focus-visible {
  color: var(--rail-red);
  outline: none;
  background: #fff;
  transform: translateY(-1px);
}

.asset-card__select :deep(.ant-checkbox-inner) {
  width: 16px;
  height: 16px;
  background: #fff;
  border: 1.5px solid #20262c;
  border-radius: 50%;
}

.asset-card__select :deep(.ant-checkbox) {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  line-height: 1;
  transform: translate(-50%, -50%);
}

.asset-card__select:hover :deep(.ant-checkbox-inner),
.asset-card__select :deep(.ant-checkbox:hover .ant-checkbox-inner) {
  border-color: #20262c;
}

.asset-card__select :deep(.ant-checkbox-checked .ant-checkbox-inner) {
  background: var(--rail-red);
  border-color: #20262c;
}

.asset-card__select :deep(.ant-checkbox + span) {
  display: none;
}

.asset-list {
  display: grid;
  gap: 1px;
  padding: 16px;
  background: #edf0f2;
}

.asset-list .asset-card {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  min-height: 132px;
  border-radius: 0;
}

.asset-list .asset-card__preview {
  min-height: 132px;
  border-radius: 0;
}

.asset-list .asset-card__body {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(200px, 1fr) auto;
  gap: 14px;
  align-items: center;
}

.asset-list .asset-card__type,
.asset-list .asset-card h2,
.asset-list .asset-card p,
.asset-list .asset-card__tags,
.asset-list .asset-card__meta {
  margin: 0;
}

.asset-filters {
  display: flex;
  gap: 10px;
}

.asset-search {
  width: 320px;
}

.asset-type-filter {
  width: 150px;
}

.asset-owner-filter {
  width: 190px;
}

.asset-sort-filter {
  width: 190px;
}

.asset-total {
  font-size: 12px;
  color: var(--rail-steel);
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  padding: 16px;
}

.asset-card {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--rail-line);
  border-radius: 12px;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.asset-card:hover,
.asset-card:focus-visible {
  outline: none;
  border-color: #cc9da5;
  box-shadow: var(--rail-shadow);
  transform: translateY(-2px);
}

.asset-card__preview {
  position: relative;
  display: grid;
  place-items: center;
  height: 142px;
  overflow: hidden;
  font-size: 42px;
  color: #fff;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 42%), transparent 45%),
    radial-gradient(circle at 75% 25%, rgb(255 255 255 / 20%), transparent 28%),
    var(--asset-accent);
}

.asset-card__preview::after {
  position: absolute;
  right: -28px;
  bottom: -36px;
  width: 120px;
  height: 120px;
  content: '';
  border: 18px solid rgb(255 255 255 / 18%);
  border-radius: 50%;
}

.asset-card__preview.has-image-preview {
  color: var(--rail-steel);
  background: #edf0f2;
}

.asset-card__preview.has-image-preview::after {
  display: none;
}

.asset-card__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 220ms ease;
}

.asset-card:hover .asset-card__image,
.asset-card:focus-visible .asset-card__image {
  transform: scale(1.025);
}

.asset-preview-state {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 8px;
  place-items: center;
  font-size: 24px;
  color: var(--rail-steel);
}

.asset-preview-state small {
  font-size: 10px;
  font-weight: 600;
}

.asset-preview-state .is-loading {
  animation: asset-preview-spin 900ms linear infinite;
}

.asset-card__favorite {
  top: 10px;
  right: 10px;
  place-items: center;
}

.asset-card__favorite svg {
  width: 16px;
  height: 16px;
}

.asset-card__favorite.is-favorite {
  color: #fff;
  background: var(--rail-red);
  border-color: var(--rail-red);
}

.asset-card__favorite.is-favorite svg {
  fill: currentcolor;
}

.asset-card__favorite.is-updating {
  cursor: wait;
  opacity: 0.62;
}

.asset-card__body {
  padding: 15px;
}

.asset-card__type {
  font-size: 10px;
  font-weight: 700;
  color: var(--rail-red);
  letter-spacing: 0.08em;
}

.asset-card h2 {
  margin: 6px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 680;
  white-space: nowrap;
}

.asset-card__body > code {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--rail-steel);
}

.asset-card p {
  display: -webkit-box;
  min-height: 35px;
  margin: 0;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 11px;
  line-height: 1.55;
  color: var(--rail-steel);
  -webkit-box-orient: vertical;
}

.asset-card__tags {
  display: flex;
  gap: 4px;
  margin-top: 11px;
}

.asset-card__tags :deep(.ant-tag) {
  margin: 0;
  font-size: 9px;
}

.asset-card__meta {
  display: flex;
  justify-content: space-between;
  padding-top: 11px;
  margin-top: 14px;
  font-size: 9px;
  color: #87909a;
  border-top: 1px solid var(--rail-line);
}

.empty-icon {
  margin-bottom: 10px;
  font-size: 34px;
}

.asset-detail-preview {
  position: relative;
  display: grid;
  place-items: center;
  height: 220px;
  margin-bottom: 22px;
  font-size: 64px;
  color: #fff;
  background:
    linear-gradient(145deg, rgb(255 255 255 / 38%), transparent 48%),
    var(--asset-accent);
  border-radius: 12px;
}

.asset-detail-preview:has(.model3d-viewer) {
  display: block;
  height: auto;
  max-height: none;
  padding: 0;
  overflow: visible;
  background: transparent;
  border: 0;
}

.asset-detail-name-editor {
  display: grid;
  gap: 7px;
  margin-bottom: 14px;
}

.asset-detail-name-editor > label {
  font-size: 12px;
  font-weight: 650;
  color: var(--rail-steel);
}

.asset-detail-name-editor > div {
  display: flex;
  gap: 8px;
}

.asset-detail-name-editor :deep(.ant-input) {
  flex: 1;
}

.asset-detail-preview:has(.asset-detail-preview__text),
.asset-detail-preview:has(.asset-detail-preview__media),
.asset-detail-preview:has(.asset-detail-preview__document) {
  height: min(56vh, 520px);
  overflow: hidden;
  color: var(--rail-ink);
  background: #f4f6f7;
  border: 1px solid var(--rail-line);
}

.asset-detail-preview__text {
  width: 100%;
  height: 100%;
  padding: 22px;
  margin: 0;
  overflow: auto;
  font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
  font-size: 13px;
  line-height: 1.8;
  color: var(--rail-ink);
  white-space: pre-wrap;
}

.asset-detail-preview__media,
.asset-detail-preview__document {
  width: 100%;
  height: 100%;
  border: 0;
}

.asset-detail-preview__media {
  object-fit: contain;
  background: #11171b;
}

.asset-detail-preview__audio {
  width: calc(100% - 32px);
}

.asset-detail-preview.has-image-preview {
  overflow: hidden;
  color: var(--rail-steel);
  background: #edf0f2;
}

.asset-detail-preview__image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.asset-detail-preview__state {
  font-size: 34px;
}

.asset-detail-preview__format {
  position: absolute;
  right: 14px;
  bottom: 12px;
  z-index: 2;
  padding: 4px 7px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: rgb(24 28 32 / 55%);
  border-radius: 5px;
}

@keyframes asset-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .asset-card__image {
    transition: none;
  }

  .asset-preview-state .is-loading {
    animation: none;
  }
}

.asset-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.asset-detail-grid div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.asset-detail-grid span {
  font-size: 10px;
  color: var(--rail-steel);
}

.asset-detail-grid strong {
  font-size: 12px;
}

.asset-lineage {
  padding: 16px;
  margin-top: 24px;
  background: var(--rail-mist);
  border-radius: 10px;
}

.asset-lineage p {
  margin: 8px 0 4px;
  font-size: 12px;
}

.asset-lineage small {
  font-size: 10px;
  line-height: 1.5;
  color: var(--rail-steel);
}

.asset-upload-form {
  display: grid;
  gap: 18px;
  padding-top: 8px;
}

.asset-upload-form label {
  display: grid;
  gap: 7px;
}

.form-field-label {
  font-size: 12px;
  font-weight: 650;
}

.form-field-label em {
  margin-left: 5px;
  font-size: 10px;
  font-style: normal;
  font-weight: 600;
  color: var(--rail-red);
}

.upload-file-field {
  position: relative;
}

.upload-file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
}

.upload-file-picker {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  min-height: 108px;
  padding: 18px;
  cursor: pointer;
  background: linear-gradient(110deg, var(--rail-red-soft), #fff 58%);
  border: 2px dashed #c9ced4;
  border-radius: 12px;
  box-shadow: inset 3px 0 var(--rail-red);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.upload-file-picker:hover {
  border-color: var(--rail-red);
  box-shadow:
    inset 3px 0 var(--rail-red),
    0 8px 24px rgb(185 28 50 / 10%);
  transform: translateY(-1px);
}

.upload-file-field:focus-within .upload-file-picker {
  outline: 3px solid rgb(185 28 50 / 18%);
  outline-offset: 2px;
  border-color: var(--rail-red);
}

.upload-file-picker.is-selected {
  background: #fff;
  border-color: var(--rail-red);
  border-style: solid;
}

.upload-file-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  font-size: 23px;
  color: var(--rail-red);
  background: var(--rail-red-soft);
  border-radius: 12px;
}

.upload-file-copy {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.upload-file-copy strong {
  font-size: 14px;
  color: var(--rail-ink);
}

.upload-file-copy small {
  font-size: 11px;
  line-height: 1.45;
  color: var(--rail-steel);
}

.upload-file-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.upload-file-meta b {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  color: var(--rail-ink);
  white-space: nowrap;
}

.upload-file-meta span {
  flex: 0 0 auto;
}

.upload-file-action {
  padding: 8px 13px;
  font-size: 11px;
  font-weight: 650;
  color: #fff;
  white-space: nowrap;
  background: var(--rail-red);
  border: 1px solid var(--rail-red);
  border-radius: 8px;
}

.is-selected .upload-file-action {
  color: var(--rail-red);
  background: #fff;
}

.upload-placeholder {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 16px;
  color: var(--rail-steel);
  background: var(--rail-mist);
  border: 1px dashed #c9ced4;
  border-radius: 10px;
}

.upload-placeholder > svg {
  font-size: 24px;
}

.upload-placeholder strong {
  font-size: 12px;
  color: var(--rail-ink);
}

.upload-placeholder p {
  margin: 3px 0 0;
  font-size: 10px;
}

@media (max-width: 1240px) {
  .asset-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 900px) {
  .asset-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .asset-grid {
    grid-template-columns: 1fr;
  }

  .asset-filters {
    flex-direction: column;
    width: 100%;
  }

  .asset-search,
  .asset-owner-filter,
  .asset-sort-filter,
  .asset-type-filter {
    width: 100%;
  }

  .upload-file-picker {
    grid-template-columns: 40px minmax(0, 1fr);
    padding: 15px;
  }

  .upload-file-icon {
    width: 40px;
    height: 40px;
  }

  .upload-file-action {
    grid-column: 1 / -1;
    text-align: center;
  }
}
</style>
