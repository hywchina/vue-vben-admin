<script setup lang="ts">
import type { FallbackProps } from './fallback';

import { computed, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';

import { ArrowLeft } from '@vben/icons';
import { $t } from '@vben/locales';

import { VbenButton } from '@vben-core/shadcn-ui';

interface Props extends FallbackProps {}

defineOptions({
  name: 'Fallback',
});

const props = withDefaults(defineProps<Props>(), {
  description: '',
  homePath: '/',
  image: '',
  showBack: true,
  status: '404',
  title: '',
});

const Icon403 = defineAsyncComponent(() => import('./icons/icon-403.vue'));
const Icon404 = defineAsyncComponent(() => import('./icons/icon-404.vue'));

const titleText = computed(() => {
  if (props.title) {
    return props.title;
  }

  switch (props.status) {
    case '403': {
      return $t('ui.fallback.forbidden');
    }
    case '404': {
      return $t('ui.fallback.pageNotFound');
    }
    default: {
      return '';
    }
  }
});

const descText = computed(() => {
  if (props.description) {
    return props.description;
  }
  switch (props.status) {
    case '403': {
      return $t('ui.fallback.forbiddenDesc');
    }
    case '404': {
      return $t('ui.fallback.pageNotFoundDesc');
    }
    default: {
      return '';
    }
  }
});

const fallbackIcon = computed(() => {
  switch (props.status) {
    case '403': {
      return Icon403;
    }
    case '404': {
      return Icon404;
    }
    default: {
      return null;
    }
  }
});

const showBack = computed(() => {
  return props.status === '403' || props.status === '404';
});

const { push } = useRouter();

// 返回首页
function back() {
  push(props.homePath);
}
</script>

<template>
  <div class="flex-col-center size-full duration-300">
    <img v-if="image" :src="image" class="md:1/3 w-1/2 lg:w-1/4" />
    <component
      :is="fallbackIcon"
      v-else-if="fallbackIcon"
      class="md:1/3 h-1/3 w-1/2 lg:w-1/4"
    />
    <div class="flex-col-center">
      <slot v-if="$slots.title" name="title"></slot>
      <p
        v-else-if="titleText"
        class="mt-8 text-2xl text-foreground md:text-3xl lg:text-4xl"
      >
        {{ titleText }}
      </p>
      <slot v-if="$slots.describe" name="describe"></slot>
      <p
        v-else-if="descText"
        class="md:text-md my-4 text-muted-foreground lg:text-lg"
      >
        {{ descText }}
      </p>
      <slot v-if="$slots.action" name="action"></slot>
      <VbenButton v-else-if="showBack" size="lg" @click="back">
        <ArrowLeft class="mr-2 size-4" />
        {{ $t('common.backToHome') }}
      </VbenButton>
    </div>
  </div>
</template>
