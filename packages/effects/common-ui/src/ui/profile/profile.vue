<script setup lang="ts">
import type { Props } from './types';

import { preferences } from '@vben-core/preferences';
import {
  Card,
  Separator,
  Tabs,
  TabsList,
  TabsTrigger,
  VbenAvatar,
} from '@vben-core/shadcn-ui';

import { Page } from '../../components';

defineOptions({
  name: 'ProfileUI',
});

withDefaults(defineProps<Props>(), {
  avatarUploading: false,
  title: '关于项目',
  tabs: () => [],
});

const emit = defineEmits<{
  avatarClick: [];
}>();

const tabsValue = defineModel<string>('modelValue');
</script>
<template>
  <Page auto-content-height>
    <div class="flex size-full">
      <Card class="w-1/6 flex-none">
        <div class="mt-4 flex-col-center h-40 gap-4">
          <button
            aria-label="修改头像"
            class="profile-avatar"
            :disabled="avatarUploading"
            type="button"
            @click="emit('avatarClick')"
          >
            <VbenAvatar
              :src="userInfo?.avatar ?? preferences.app.defaultAvatar"
              class="size-20"
            />
            <span class="profile-avatar__hint">
              {{ avatarUploading ? '上传中…' : '修改头像' }}
            </span>
          </button>
          <span class="text-lg font-semibold">
            {{ userInfo?.realName ?? '' }}
          </span>
          <span class="text-sm text-foreground/80">
            {{ userInfo?.username ?? '' }}
          </span>
        </div>
        <Separator class="my-4" />
        <Tabs v-model="tabsValue" orientation="vertical" class="m-4">
          <TabsList class="grid w-full grid-cols-1 bg-card">
            <TabsTrigger
              v-for="tab in tabs"
              :key="tab.value"
              :value="tab.value"
              class="h-12 justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {{ tab.label }}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Card>
      <Card class="ml-4 w-5/6 flex-auto p-8">
        <slot name="content"></slot>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.profile-avatar {
  position: relative;
  display: block;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  outline: 0;
  border: 0;
  border-radius: 999px;
}

.profile-avatar:focus-visible {
  box-shadow: 0 0 0 3px hsl(var(--primary) / 35%);
}

.profile-avatar:disabled {
  cursor: wait;
}

.profile-avatar__hint {
  position: absolute;
  inset: auto 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  padding: 4px 2px 7px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  pointer-events: none;
  background: rgb(0 0 0 / 66%);
  opacity: 0;
  transition: opacity 160ms ease;
}

.profile-avatar:hover .profile-avatar__hint,
.profile-avatar:focus-visible .profile-avatar__hint,
.profile-avatar:disabled .profile-avatar__hint {
  opacity: 1;
}
</style>
