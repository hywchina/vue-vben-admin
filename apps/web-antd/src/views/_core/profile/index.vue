<script setup lang="ts">
import { ref } from 'vue';

import { Profile } from '@vben/common-ui';
import { useUserStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import { uploadUserAvatarApi } from '#/api/core/user';
import { useAuthStore } from '#/store';

import AvatarCropper from './avatar-cropper.vue';
import ProfileBase from './base-setting.vue';
import ProfileNotificationSetting from './notification-setting.vue';
import ProfilePasswordSetting from './password-setting.vue';

const userStore = useUserStore();
const authStore = useAuthStore();

const tabsValue = ref<string>('basic');
const avatarInputRef = ref<HTMLInputElement>();
const avatarUploading = ref(false);
const avatarCropOpen = ref(false);
const avatarCropFilename = ref('');
const avatarCropSrc = ref('');

const supportedAvatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxAvatarBytes = 5 * 1024 * 1024;

function selectAvatar() {
  if (!avatarUploading.value) avatarInputRef.value?.click();
}

async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!supportedAvatarTypes.has(file.type)) {
    message.error('头像仅支持 PNG、JPEG 或 WebP 图片');
    return;
  }
  if (file.size > maxAvatarBytes) {
    message.error('头像不能超过 5 MB');
    return;
  }
  if (avatarCropSrc.value) URL.revokeObjectURL(avatarCropSrc.value);
  avatarCropFilename.value = file.name;
  avatarCropSrc.value = URL.createObjectURL(file);
  avatarCropOpen.value = true;
}

function closeAvatarCropper() {
  avatarCropOpen.value = false;
  if (avatarCropSrc.value) URL.revokeObjectURL(avatarCropSrc.value);
  avatarCropSrc.value = '';
  avatarCropFilename.value = '';
}

async function confirmAvatarCrop(file: File) {
  closeAvatarCropper();
  avatarUploading.value = true;
  try {
    await uploadUserAvatarApi(file);
    await authStore.fetchUserInfo();
    message.success('头像已更新');
  } finally {
    avatarUploading.value = false;
  }
}

const tabs = ref([
  {
    label: '基本设置',
    value: 'basic',
  },
  {
    label: '修改密码',
    value: 'password',
  },
  {
    label: '新消息提醒',
    value: 'notice',
  },
]);
</script>
<template>
  <input
    ref="avatarInputRef"
    accept="image/png,image/jpeg,image/webp"
    class="hidden"
    data-testid="avatar-file-input"
    type="file"
    @change="uploadAvatar"
  />
  <Profile
    v-model:model-value="tabsValue"
    :avatar-uploading="avatarUploading"
    title="个人中心"
    :user-info="userStore.userInfo"
    :tabs="tabs"
    @avatar-click="selectAvatar"
  >
    <template #content>
      <ProfileBase v-if="tabsValue === 'basic'" />
      <ProfilePasswordSetting v-if="tabsValue === 'password'" />
      <ProfileNotificationSetting v-if="tabsValue === 'notice'" />
    </template>
  </Profile>
  <AvatarCropper
    :filename="avatarCropFilename"
    :open="avatarCropOpen"
    :src="avatarCropSrc"
    @cancel="closeAvatarCropper"
    @confirm="confirmAvatarCrop"
  />
</template>
