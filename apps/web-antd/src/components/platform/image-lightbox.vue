<script lang="ts" setup>
import { ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Modal } from 'ant-design-vue';

const props = defineProps<{
  open: boolean;
  title?: string;
  url?: string;
}>();

const emit = defineEmits<{ 'update:open': [open: boolean] }>();
const zoom = ref(1);

function setZoom(value: number) {
  zoom.value = Math.min(8, Math.max(0.1, value));
}

function handleWheel(event: WheelEvent) {
  event.preventDefault();
  setZoom(zoom.value * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
}

watch(
  () => props.open,
  (open) => {
    if (open) zoom.value = 1;
  },
);
</script>

<template>
  <Modal
    :footer="null"
    :open="open"
    :title="title || '图片预览'"
    :z-index="2200"
    width="min(1180px, 94vw)"
    wrap-class-name="platform-image-lightbox"
    @cancel="emit('update:open', false)"
  >
    <div class="lightbox-toolbar">
      <Button size="small" @click="setZoom(zoom / 1.2)">
        <IconifyIcon icon="lucide:zoom-out" />
      </Button>
      <span>{{ Math.round(zoom * 100) }}%</span>
      <Button size="small" @click="setZoom(zoom * 1.2)">
        <IconifyIcon icon="lucide:zoom-in" />
      </Button>
      <Button size="small" @click="setZoom(1)">原始比例</Button>
    </div>
    <div class="lightbox-viewport" @wheel="handleWheel">
      <img
        v-if="url"
        :alt="title || '图片预览'"
        :src="url"
        :style="{ transform: `scale(${zoom})` }"
      />
    </div>
  </Modal>
</template>

<style scoped>
.lightbox-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-bottom: 12px;
}

.lightbox-toolbar span {
  min-width: 54px;
  font-size: 12px;
  text-align: center;
}

.lightbox-viewport {
  display: grid;
  place-items: center;
  height: min(72vh, 780px);
  overflow: auto;
  background:
    linear-gradient(45deg, #20262b 25%, transparent 25%) 0 0 / 20px 20px,
    linear-gradient(45deg, transparent 75%, #20262b 75%) 0 0 / 20px 20px,
    linear-gradient(45deg, transparent 75%, #20262b 75%) 10px -10px / 20px 20px,
    linear-gradient(45deg, #20262b 25%, #171c20 25%) 10px 10px / 20px 20px;
  border-radius: 12px;
}

.lightbox-viewport img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center;
  transition: transform 120ms ease;
}
</style>
