<script setup lang="ts">
import type { AssetFolder, PlatformAsset } from '#/modules/platform/types';

import { computed, ref, watch } from 'vue';

import { Button, Input, message, Modal, Select, Spin } from 'ant-design-vue';

import {
  createAssetFolderApi,
  getAssetFoldersApi,
  getAssetSaveContextApi,
} from '#/api/platform/assets';
import {
  assetCategoryLabel,
  assetFolderOptions,
} from '#/modules/platform/asset-browser';
import { usePlatformStore } from '#/store';

const props = defineProps<{
  assetId?: string;
  jobId?: string;
}>();
const emit = defineEmits<{ close: []; saved: [asset: PlatformAsset] }>();
const store = usePlatformStore();
const asset = ref<PlatformAsset>();
const folders = ref<AssetFolder[]>([]);
const folderId = ref('');
const loading = ref(false);
const saving = ref(false);
const creating = ref(false);
const loadError = ref('');
const actionError = ref('');
const newFolderOpen = ref(false);
const folderName = ref('');
let request = 0;
const category = computed(() => asset.value?.generationCategory);
const categoryLabel = computed(() => assetCategoryLabel(category.value));
const options = computed(() =>
  assetFolderOptions(folders.value, category.value),
);
const projectLabel = computed(
  () =>
    store.projects.find((item) => item.id === asset.value?.projectId)?.name ??
    '所属项目',
);
const destination = computed(
  () =>
    options.value.find((item) => item.value === folderId.value)?.label ??
    `${categoryLabel.value}根目录`,
);
const pending = computed(() => saving.value || creating.value);
function close() {
  if (!pending.value) emit('close');
}
watch(
  () => [props.assetId, props.jobId] as const,
  async () => {
    const version = ++request;
    asset.value = undefined;
    folders.value = [];
    folderId.value = '';
    newFolderOpen.value = false;
    folderName.value = '';
    loadError.value = '';
    actionError.value = '';
    if (!props.assetId) {
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const value = await getAssetSaveContextApi(props.assetId, props.jobId);
      const list = await getAssetFoldersApi(value.projectId);
      if (version !== request) return;
      asset.value = value;
      folders.value = list;
    } catch (error) {
      if (version === request)
        loadError.value =
          error instanceof Error ? error.message : '无法加载保存目录，请重试';
    } finally {
      if (version === request) loading.value = false;
    }
  },
  { immediate: true },
);
async function createFolder() {
  if (!asset.value || !folderName.value.trim() || pending.value) return;
  const id = props.assetId;
  creating.value = true;
  actionError.value = '';
  try {
    const folder = await createAssetFolderApi({
      projectId: asset.value.projectId,
      generationCategory: category.value,
      parentId: folderId.value || null,
      name: folderName.value.trim(),
    });
    if (id !== props.assetId) return;
    folders.value.push(folder);
    folderId.value = folder.id;
    if (store.currentProjectId === asset.value.projectId)
      await store.refreshAssetFolders();
    newFolderOpen.value = false;
    folderName.value = '';
    message.success('文件夹已创建');
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : '创建目录失败，请重试';
  } finally {
    creating.value = false;
  }
}
async function save() {
  if (!asset.value || pending.value || loading.value || loadError.value) return;
  saving.value = true;
  actionError.value = '';
  try {
    const saved = await store.saveWorkflowOutput(
      asset.value.id,
      folderId.value || undefined,
      props.jobId,
    );
    const actual = assetFolderOptions(
      folders.value,
      saved.generationCategory,
    ).find((item) => item.value === (saved.folderId ?? ''));
    message.success(
      `已保存到 ${projectLabel.value} / ${actual?.label ?? destination.value}`,
    );
    emit('saved', saved);
    emit('close');
  } catch (error) {
    actionError.value =
      error instanceof Error ? error.message : '保存失败，请重试';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="Boolean(assetId)"
    title="保存到资产中心"
    ok-text="确认保存"
    :confirm-loading="saving"
    :closable="!pending"
    :mask-closable="!pending"
    :keyboard="!pending"
    :cancel-button-props="{ disabled: pending }"
    :ok-button-props="{
      disabled: loading || !asset || Boolean(loadError) || creating,
    }"
    @ok="save"
    @cancel="close"
  >
    <Spin :spinning="loading">
      <p v-if="loadError" role="alert">{{ loadError }}</p>
      <div v-else class="asset-save-form">
        <p>{{ asset?.name }}</p>
        <p>所属项目：{{ projectLabel }} · 业务大类：{{ categoryLabel }}</p>
        <label for="asset-save-folder">保存目录</label>
        <Select
          id="asset-save-folder"
          v-model:value="folderId"
          aria-label="保存目录"
          :disabled="pending || !asset"
          :options="options"
          :dropdown-style="{ minWidth: 0, maxWidth: 'calc(100vw - 48px)' }"
        />
        <p class="asset-save-hint">
          默认存入{{
            categoryLabel
          }}根目录，也可选择该大类下的子目录。仅继续编辑时无需入库。
        </p>
        <Button
          :disabled="pending || !asset"
          @click="newFolderOpen = !newFolderOpen"
        >
          新建子目录
        </Button>
        <div v-if="newFolderOpen" class="asset-save-create">
          <small>创建在：{{ destination }}</small>
          <Input
            v-model:value="folderName"
            :maxlength="120"
            :disabled="pending"
            placeholder="输入子目录名称"
            @press-enter="createFolder"
          />
          <Button
            :loading="creating"
            :disabled="saving || !folderName.trim()"
            @click="createFolder"
          >
            创建目录
          </Button>
        </div>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <p>保存至：{{ projectLabel }} / {{ destination }}</p>
      </div>
    </Spin>
  </Modal>
</template>

<style scoped>
.asset-save-form,
.asset-save-create {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.asset-save-form p {
  margin: 0;
  overflow-wrap: anywhere;
}

.asset-save-hint,
.asset-save-create small {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}
</style>
