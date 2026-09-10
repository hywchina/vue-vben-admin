<script setup lang="ts">
import { computed, reactive, watch } from 'vue';

const props = defineProps<{
  activeId?: string;
  completedAt?: string;
  images: { id: string; name: string; url: string }[];
}>();
const emit = defineEmits<{
  open: [id: string];
  select: [id: string];
}>();
const dimensions = reactive({ width: 1, height: 1 });
const activeIndex = computed(() =>
  Math.max(
    0,
    props.images.findIndex((image) => image.id === props.activeId),
  ),
);
const activeImage = computed(() => props.images[activeIndex.value]);
const ratio = computed(() => dimensions.width / dimensions.height);
const galleryStyle = computed(() => ({
  width: `min(100%, ${600 * ratio.value}px, calc(60vh * ${ratio.value}))`,
  '--gallery-ratio': String(ratio.value),
}));
const timeLabel = computed(() =>
  props.completedAt
    ? new Intl.DateTimeFormat('zh-CN', {
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        month: '2-digit',
      }).format(new Date(props.completedAt))
    : '',
);
// The first output establishes the group's geometry, so switching mixed ratios stays stable.
function recordDimensions(event: Event, index: number) {
  const image = event.target as HTMLImageElement;
  if (index === 0 && image.naturalWidth && image.naturalHeight) {
    dimensions.width = image.naturalWidth;
    dimensions.height = image.naturalHeight;
  }
}
function selectImage(id: string, event: Event) {
  emit('select', id);
  (event.currentTarget as HTMLElement).scrollIntoView?.({
    block: 'nearest',
    inline: 'nearest',
  });
}
watch(
  () => props.images[0]?.id,
  () => {
    dimensions.width = 1;
    dimensions.height = 1;
  },
);
</script>

<template>
  <div v-if="activeImage" class="image-result-gallery" :style="galleryStyle">
    <button
      class="gallery-main"
      type="button"
      :aria-label="`全屏查看${activeImage.name}`"
      @click="emit('open', activeImage.id)"
    >
      <img :src="activeImage.url" :alt="activeImage.name" />
    </button>
    <nav class="gallery-thumbnails" aria-label="生成图片列表">
      <button
        v-for="(image, index) in images"
        :key="image.id"
        type="button"
        :aria-label="`查看第 ${index + 1} 张：${image.name}`"
        :aria-pressed="image.id === activeImage.id"
        @click="selectImage(image.id, $event)"
      >
        <img
          :src="image.url"
          :alt="image.name"
          @load="recordDimensions($event, index)"
        />
      </button>
    </nav>
    <div class="gallery-meta">
      <time
        v-if="completedAt"
        :datetime="completedAt"
        :title="`生成时间：${new Date(completedAt).toLocaleString('zh-CN')}`"
      >
        {{ timeLabel }}
      </time>
      <span class="gallery-counter" aria-live="polite">
        {{ activeIndex + 1 }} / {{ images.length }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.image-result-gallery {
  min-width: 0;
  max-width: 100%;
  margin: 0;
}

.gallery-main {
  display: block;
  width: 100%;
  aspect-ratio: var(--gallery-ratio);
  padding: 0;
  overflow: hidden;
  cursor: zoom-in;
  background: transparent;
  border: 0;
  border-radius: 10px;
}

.gallery-main img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: left center;
}

.gallery-thumbnails {
  display: flex;
  gap: 8px;
  padding: 3px;
  margin: 9px -3px 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.gallery-thumbnails button {
  flex: 0 0 64px;
  width: 64px;
  height: 64px;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.gallery-thumbnails button[aria-pressed='true'] {
  outline: 2px solid #bd1934;
  outline-offset: 1px;
}

.gallery-thumbnails img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 9px;
  font-size: 12px;
  color: var(--rail-theme-secondary, #9299a1);
}

.gallery-counter {
  margin-left: auto;
  white-space: nowrap;
}

.gallery-main:focus-visible,
.gallery-thumbnails button:focus-visible {
  outline: 2px solid #bd1934;
  outline-offset: 2px;
}
</style>
