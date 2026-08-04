<script lang="ts" setup>
import type { AssetType, PlatformAsset } from '#/modules/platform/types';

import { computed, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Drawer,
  Input,
  message,
  Modal,
  Select,
  Tag,
  Textarea,
} from 'ant-design-vue';

import { getAssetDownloadApi, getAssetPreviewApi } from '#/api';
import PageHeading from '#/components/platform/page-heading.vue';
import { usePlatformStore } from '#/store';

const platformStore = usePlatformStore();
const keyword = ref('');
const typeFilter = ref<'all' | AssetType>('all');
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

const typeLabels: Record<AssetType, string> = {
  audio: '音频',
  image: '图片',
  lora: 'LoRA',
  mask: '遮罩',
  material: '材质',
  model3d: '3D 模型',
  report: '报告',
  text: '文本',
  video: '视频',
};

const typeIcons: Record<AssetType, string> = {
  audio: 'lucide:audio-lines',
  image: 'lucide:image',
  lora: 'lucide:brain-circuit',
  mask: 'lucide:scan',
  material: 'lucide:swatch-book',
  model3d: 'lucide:box',
  report: 'lucide:file-chart-column',
  text: 'lucide:file-text',
  video: 'lucide:video',
};

const typeOptions = [
  { label: '全部类型', value: 'all' },
  ...Object.entries(typeLabels).map(([value, label]) => ({ label, value })),
];

const uploadTypeOptions = Object.entries(typeLabels).map(([value, label]) => ({
  label,
  value,
}));

const uploadFileAccept = computed(() => {
  const acceptByType: Record<Exclude<AssetType, 'text'>, string> = {
    audio: 'audio/*',
    image: 'image/*',
    lora: '.safetensors,.ckpt,.pt,.pth',
    mask: 'image/*',
    material: 'image/*,.zip',
    model3d: '.glb,.gltf,.obj,.fbx,.stl,.step,.stp',
    report: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx',
    video: 'video/*',
  };

  return uploadType.value === 'text'
    ? undefined
    : acceptByType[uploadType.value];
});

const filteredAssets = computed(() => {
  const normalized = keyword.value.trim().toLowerCase();
  return platformStore.currentAssets.filter((asset) => {
    const matchesType =
      typeFilter.value === 'all' || asset.type === typeFilter.value;
    const matchesKeyword =
      !normalized ||
      `${asset.name}${asset.owner}${asset.tags.join('')}`
        .toLowerCase()
        .includes(normalized);
    return matchesType && matchesKeyword;
  });
});

function canPreviewAsset(asset: PlatformAsset) {
  const previewableType = ['image', 'mask', 'material'].includes(asset.type);
  const previewableMime =
    !asset.mimeType || asset.mimeType.startsWith('image/');
  const available = !asset.status || asset.status === 'available';
  return previewableType && previewableMime && available;
}

async function loadAssetPreview(asset: PlatformAsset, requestKey: string) {
  assetPreviewStatuses.set(asset.id, 'loading');
  try {
    const preview = await getAssetPreviewApi(asset.id);
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
        name: uploadName.value.trim(),
        tags: ['文本'],
      });
    } else if (uploadFile.value) {
      await platformStore.uploadAsset({
        file: uploadFile.value,
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
          :disabled="!platformStore.currentProjectId"
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
          </div>
          <div class="asset-total">{{ filteredAssets.length }} 项资产</div>
        </div>

        <div v-if="filteredAssets.length" class="asset-grid">
          <article
            v-for="asset in filteredAssets"
            :key="asset.id"
            class="asset-card"
            tabindex="0"
            @click="selectedAsset = asset"
            @keydown.enter="selectedAsset = asset"
          >
            <div
              :class="{ 'has-image-preview': canPreviewAsset(asset) }"
              class="asset-card__preview"
              :style="{ '--asset-accent': asset.accent }"
            >
              <div class="asset-card__format">{{ asset.format }}</div>
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
              <IconifyIcon v-else :icon="typeIcons[asset.type]" />
              <button
                :aria-label="asset.favorite ? '取消收藏' : '收藏资产'"
                class="asset-card__favorite"
                type="button"
                @click.stop="platformStore.toggleAssetFavorite(asset.id)"
              >
                <IconifyIcon
                  :icon="asset.favorite ? 'lucide:star' : 'lucide:star-off'"
                />
              </button>
            </div>
            <div class="asset-card__body">
              <div class="asset-card__type">{{ typeLabels[asset.type] }}</div>
              <h2>{{ asset.name }}</h2>
              <p>{{ asset.description }}</p>
              <div class="asset-card__tags">
                <Tag v-for="tag in asset.tags" :key="tag">{{ tag }}</Tag>
              </div>
              <div class="asset-card__meta">
                <span>{{ asset.owner }}</span>
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

    <Drawer
      :open="Boolean(selectedAsset)"
      :title="selectedAsset?.name"
      width="420"
      @close="selectedAsset = null"
    >
      <template v-if="selectedAsset">
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
          />
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
          <IconifyIcon v-else :icon="typeIcons[selectedAsset.type]" />
          <span class="asset-detail-preview__format">
            {{ selectedAsset.format }}
          </span>
        </div>
        <div class="asset-detail-grid">
          <div>
            <span>资产类型</span>
            <strong>{{ typeLabels[selectedAsset.type] }}</strong>
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
            <strong>{{ selectedAsset.owner }}</strong>
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
            来源任务：{{ selectedAsset.sourceJobId }}
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
      </template>
    </Drawer>

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
          <span class="form-field-label">资产类型</span>
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
                选择与资产类型匹配的图片、视频、模型或其他文件
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

.asset-card__format {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  padding: 3px 6px;
  font-size: 9px;
  font-weight: 750;
  letter-spacing: 0.08em;
  background: rgb(24 28 32 / 48%);
  border-radius: 4px;
}

.asset-card__favorite {
  position: absolute;
  top: 9px;
  right: 9px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  color: #fff;
  cursor: pointer;
  background: rgb(24 28 32 / 42%);
  border: 0;
  border-radius: 8px;
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
