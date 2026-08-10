<script lang="ts" setup>
import type { AssetType, PlatformAsset } from '#/modules/platform/types';

import { computed, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Input, Modal, Tag } from 'ant-design-vue';

import { getAssetPreviewApi } from '#/api';
import {
  assetTypeIcons,
  assetTypeLabels,
} from '#/modules/platform/asset-types';

const props = defineProps<{
  acceptedKinds: AssetType[];
  assets: PlatformAsset[];
  open: boolean;
  selectedAssetId?: string;
}>();

const emit = defineEmits<{
  select: [assetId: string];
  'update:open': [open: boolean];
}>();
const keyword = ref('');
const selected = ref('');
const previews = reactive(new Map<string, string>());

const compatibleAssets = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  return props.assets.filter(
    (asset) =>
      (props.acceptedKinds.length === 0 ||
        props.acceptedKinds.includes(asset.type)) &&
      (!query ||
        `${asset.name} ${asset.tags.join(' ')}`.toLowerCase().includes(query)),
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

function confirmSelection() {
  if (!selected.value) return;
  emit('select', selected.value);
  emit('update:open', false);
}

watch(
  () => [props.open, props.selectedAssetId, compatibleAssets.value.length],
  ([open]) => {
    if (!open) return;
    selected.value = props.selectedAssetId ?? '';
    void loadPreviews();
  },
);
</script>

<template>
  <Modal
    :open="open"
    title="从当前项目资产选择"
    width="860px"
    @cancel="emit('update:open', false)"
  >
    <Input
      v-model:value="keyword"
      allow-clear
      class="asset-picker-search"
      placeholder="搜索资产名称或标签"
    >
      <template #prefix><IconifyIcon icon="lucide:search" /></template>
    </Input>
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
        <small>V{{ asset.version }} · {{ asset.format }}</small>
      </button>
    </div>
    <Empty v-else description="当前项目没有兼容资产" />
    <template #footer>
      <Button @click="emit('update:open', false)">取消</Button>
      <Button :disabled="!selected" type="primary" @click="confirmSelection">
        使用所选资产
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.asset-picker-search {
  margin-bottom: 14px;
}

.asset-picker-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  max-height: 58vh;
  overflow: auto;
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
  font-size: 8px;
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
  font-size: 11px;
}

.asset-picker-grid small {
  margin-top: 3px;
  font-size: 9px;
  color: #7b878e;
}

@media (max-width: 760px) {
  .asset-picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
