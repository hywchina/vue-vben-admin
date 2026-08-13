<script lang="ts" setup>
import type {
  AssetFolder,
  AssetType,
  PlatformAsset,
} from '#/modules/platform/types';

import { computed, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Input, Modal, Select, Spin, Tag } from 'ant-design-vue';

import {
  getAssetApi,
  getAssetFoldersApi,
  getAssetPreviewApi,
  getAssetsApi,
} from '#/api';
import {
  assetTypeIcons,
  assetTypeLabels,
  assetTypeOptions,
} from '#/modules/platform/asset-types';

const props = defineProps<{
  acceptedKinds: AssetType[];
  assets: PlatformAsset[];
  open: boolean;
  projectId?: string;
  selectedAssetId?: string;
}>();

const emit = defineEmits<{
  select: [assetId: string];
  'update:open': [open: boolean];
}>();
const keyword = ref('');
const selected = ref('');
const currentFolderId = ref<null | string>(null);
const typeFilter = ref<'all' | AssetType>('all');
const sortValue = ref<
  | 'createdAt-asc'
  | 'createdAt-desc'
  | 'name-asc'
  | 'name-desc'
  | 'type-asc'
  | 'type-desc'
>('createdAt-desc');
const loading = ref(false);
const folders = ref<AssetFolder[]>([]);
const displayedAssets = ref<PlatformAsset[]>([]);
const previews = reactive(new Map<string, string>());
let loadGeneration = 0;

const typeOptions = computed(() => [
  { label: '全部兼容类型', value: 'all' },
  ...assetTypeOptions.filter(
    (option) =>
      props.acceptedKinds.length === 0 ||
      props.acceptedKinds.includes(option.value as AssetType),
  ),
]);
const currentFolder = computed(() =>
  folders.value.find((folder) => folder.id === currentFolderId.value),
);
const currentFolders = computed(() =>
  currentFolder.value?.kind === 'favorites'
    ? []
    : folders.value
        .filter((folder) => folder.parentId === currentFolderId.value)
        .toSorted((left, right) =>
          left.name.localeCompare(right.name, 'zh-CN'),
        ),
);
const breadcrumbs = computed(() => {
  const items: Array<{ id: null | string; name: string }> = [
    { id: null, name: '项目资产' },
  ];
  const chain: Array<{ id: string; name: string }> = [];
  const visited = new Set<string>();
  let folderId = currentFolderId.value;
  while (folderId && !visited.has(folderId)) {
    visited.add(folderId);
    const folder = folders.value.find((item) => item.id === folderId);
    if (!folder) break;
    chain.unshift({ id: folder.id, name: folder.name });
    folderId = folder.parentId;
  }
  return [...items, ...chain];
});

const compatibleAssets = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return displayedAssets.value.filter(
    (asset) =>
      (props.acceptedKinds.length === 0 ||
        props.acceptedKinds.includes(asset.type)) &&
      (typeFilter.value === 'all' || asset.type === typeFilter.value) &&
      (!query ||
        `${asset.name} ${asset.publicId} ${asset.tags.join(' ')}`
          .toLowerCase()
          .includes(query)),
  );
});

async function loadPreviews() {
  await Promise.allSettled(
    compatibleAssets.value
      .filter((asset) => asset.type === 'image' && !previews.has(asset.id))
      .slice(0, 60)
      .map(async (asset) => {
        const preview = await getAssetPreviewApi(asset.id);
        if (preview.mode !== 'url') throw new Error('图片资产没有返回预览地址');
        previews.set(asset.id, preview.url);
      }),
  );
}

async function loadFolderAssets() {
  const generation = ++loadGeneration;
  loading.value = true;
  try {
    if (!props.projectId) {
      displayedAssets.value = props.assets.filter(
        (asset) => (asset.folderId ?? null) === currentFolderId.value,
      );
      return;
    }
    const [sortBy, sortOrder] = sortValue.value.split('-') as [
      'createdAt' | 'name' | 'type',
      'asc' | 'desc',
    ];
    const assets = await getAssetsApi(props.projectId, {
      folderId: currentFolderId.value ?? 'root',
      sortBy,
      sortOrder,
    });
    if (generation !== loadGeneration) return;
    displayedAssets.value = assets;
    void loadPreviews();
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function initializePicker() {
  selected.value = props.selectedAssetId ?? '';
  keyword.value = '';
  typeFilter.value = 'all';
  currentFolderId.value = null;
  displayedAssets.value = [];
  if (props.projectId) {
    folders.value = await getAssetFoldersApi(props.projectId);
    if (props.selectedAssetId) {
      try {
        const selectedAsset = await getAssetApi(props.selectedAssetId);
        if (selectedAsset.projectId === props.projectId) {
          currentFolderId.value = selectedAsset.folderId ?? null;
        }
      } catch {
        // 已失效的历史选择不阻断用户重新浏览项目资产。
      }
    }
  } else {
    folders.value = [];
  }
  await loadFolderAssets();
}

function enterFolder(folderId: null | string) {
  currentFolderId.value = folderId;
  selected.value = '';
}

function confirmSelection() {
  if (!selected.value) return;
  emit('select', selected.value);
  emit('update:open', false);
}

watch(
  () => props.open,
  (open) => {
    if (open) void initializePicker();
  },
);
watch([currentFolderId, sortValue], () => {
  if (props.open) void loadFolderAssets();
});
watch(compatibleAssets, () => {
  if (props.open) void loadPreviews();
});
</script>

<template>
  <Modal
    :open="open"
    title="从当前项目资产选择"
    width="960px"
    @cancel="emit('update:open', false)"
  >
    <div class="asset-picker-toolbar">
      <Input
        v-model:value="keyword"
        allow-clear
        class="asset-picker-search"
        placeholder="搜索当前文件夹中的名称、编号或标签"
      >
        <template #prefix><IconifyIcon icon="lucide:search" /></template>
      </Input>
      <Select
        v-model:value="typeFilter"
        :options="typeOptions"
        class="asset-picker-filter"
      />
      <Select
        v-model:value="sortValue"
        class="asset-picker-sort"
        :options="[
          { label: '创建时间：最新优先', value: 'createdAt-desc' },
          { label: '创建时间：最早优先', value: 'createdAt-asc' },
          { label: '名称：A–Z', value: 'name-asc' },
          { label: '名称：Z–A', value: 'name-desc' },
          { label: '类型：正序', value: 'type-asc' },
          { label: '类型：倒序', value: 'type-desc' },
        ]"
      />
    </div>

    <nav class="asset-picker-breadcrumbs" aria-label="资产文件夹路径">
      <button
        v-for="(item, index) in breadcrumbs"
        :key="item.id ?? 'root'"
        type="button"
        @click="enterFolder(item.id)"
      >
        <IconifyIcon v-if="index === 0" icon="lucide:house" />
        {{ item.name }}
        <IconifyIcon
          v-if="index < breadcrumbs.length - 1"
          icon="lucide:chevron-right"
        />
      </button>
    </nav>

    <Spin :spinning="loading">
      <div class="asset-picker-scroll">
        <div v-if="currentFolders.length" class="asset-picker-folders">
          <button
            v-for="folder in currentFolders"
            :key="folder.id"
            type="button"
            @click="enterFolder(folder.id)"
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
            <IconifyIcon icon="lucide:chevron-right" />
          </button>
        </div>
        <div v-if="compatibleAssets.length" class="asset-picker-grid">
          <button
            v-for="asset in compatibleAssets"
            :key="asset.id"
            :class="{ selected: selected === asset.id }"
            type="button"
            @click="selected = asset.id"
            @dblclick="confirmSelection"
          >
            <div class="asset-picker-preview">
              <img
                v-if="previews.get(asset.id)"
                :alt="asset.name"
                :src="previews.get(asset.id)"
              />
              <IconifyIcon v-else :icon="assetTypeIcons[asset.type]" />
              <Tag>{{ assetTypeLabels[asset.type] }}</Tag>
            </div>
            <strong>{{ asset.name }}</strong>
            <small>
              {{ asset.publicId }} · V{{ asset.version }} · {{ asset.format }}
            </small>
          </button>
        </div>
        <Empty
          v-else-if="!currentFolders.length && !loading"
          description="当前文件夹没有兼容资产"
        />
      </div>
    </Spin>
    <template #footer>
      <Button @click="emit('update:open', false)">取消</Button>
      <Button :disabled="!selected" type="primary" @click="confirmSelection">
        使用所选资产
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.asset-picker-toolbar {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 170px 205px;
  gap: 10px;
  margin-bottom: 12px;
}

.asset-picker-breadcrumbs {
  display: flex;
  gap: 2px;
  align-items: center;
  min-height: 34px;
  padding: 0 4px 10px;
  overflow-x: auto;
}

.asset-picker-breadcrumbs button {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;
  align-items: center;
  padding: 4px 6px;
  font-size: 13px;
  color: #59666e;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.asset-picker-breadcrumbs button:hover {
  color: #b91c32;
  background: #fff1f3;
}

.asset-picker-scroll {
  min-height: 210px;
  max-height: 58vh;
  padding: 2px;
  overflow: auto;
}

.asset-picker-folders {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.asset-picker-folders button {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 12px;
  text-align: left;
  background: #fff;
  border: 1px solid #dce2e5;
  border-radius: 10px;
}

.asset-picker-folders button:hover {
  background: #fffafb;
  border-color: #c51f3a;
}

.asset-picker-folders button > svg:first-child {
  flex: 0 0 auto;
  font-size: 22px;
  color: #c51f3a;
}

.asset-picker-folders button > svg:last-child {
  margin-left: auto;
  color: #8b969d;
}

.asset-picker-folders span,
.asset-picker-folders strong,
.asset-picker-folders small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-picker-folders span {
  flex: 1;
}

.asset-picker-folders strong {
  font-size: 14px;
}

.asset-picker-folders small {
  margin-top: 3px;
  font-size: 12px;
  color: #7b878e;
}

.asset-picker-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.asset-picker-grid > button {
  min-width: 0;
  padding: 8px;
  text-align: left;
  background: #fff;
  border: 1px solid #dce2e5;
  border-radius: 12px;
}

.asset-picker-grid > button:hover,
.asset-picker-grid > button.selected {
  border-color: #b91c32;
  box-shadow: 0 0 0 2px rgb(185 28 50 / 10%);
}

.asset-picker-preview {
  position: relative;
  display: grid;
  place-items: center;
  height: 118px;
  overflow: hidden;
  color: #6e7a82;
  background: #f0f3f4;
  border-radius: 8px;
}

.asset-picker-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-picker-preview > svg {
  font-size: 32px;
}

.asset-picker-preview :deep(.ant-tag) {
  position: absolute;
  top: 6px;
  right: 2px;
  font-size: 12px;
}

.asset-picker-grid strong,
.asset-picker-grid small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-picker-grid strong {
  margin-top: 8px;
  font-size: 14px;
}

.asset-picker-grid small {
  margin-top: 3px;
  font-size: 12px;
  color: #7b878e;
}

@media (max-width: 760px) {
  .asset-picker-toolbar {
    grid-template-columns: 1fr;
  }

  .asset-picker-folders,
  .asset-picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
