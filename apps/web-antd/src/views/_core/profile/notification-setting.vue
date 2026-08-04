<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { NotificationPreferences } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { ProfileNotificationSetting } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import {
  getNotificationPreferencesApi,
  updateNotificationPreferencesApi,
} from '#/api';

type PreferenceKey = keyof NotificationPreferences;

const preferenceKeys = new Set<PreferenceKey>([
  'accountMessage',
  'systemMessage',
  'todoTask',
]);
const preferences = ref<NotificationPreferences>({
  accountMessage: true,
  systemMessage: true,
  todoTask: true,
});

const formSchema = computed(() => {
  return [
    {
      description: '其他用户产生的协作消息将显示在站内通知中',
      fieldName: 'accountMessage',
      label: '协作消息',
      value: preferences.value.accountMessage,
    },
    {
      description: '平台维护、权限和资产状态消息将显示在站内通知中',
      fieldName: 'systemMessage',
      label: '系统消息',
      value: preferences.value.systemMessage,
    },
    {
      description: '任务开始、完成或失败时将显示在站内通知中',
      fieldName: 'todoTask',
      label: '任务消息',
      value: preferences.value.todoTask,
    },
  ];
});

async function loadPreferences() {
  preferences.value = await getNotificationPreferencesApi();
}

async function handleChange(change: Recordable<unknown>) {
  const fieldName = String(change.fieldName);
  if (!preferenceKeys.has(fieldName as PreferenceKey)) return;
  const key = fieldName as PreferenceKey;
  const previous = preferences.value;
  preferences.value = {
    ...previous,
    [key]: Boolean(change.value),
  };
  try {
    preferences.value = await updateNotificationPreferencesApi(
      preferences.value,
    );
    message.success('消息提醒设置已保存');
  } catch {
    preferences.value = previous;
  }
}

onMounted(loadPreferences);
</script>

<template>
  <ProfileNotificationSetting
    :form-schema="formSchema"
    @change="handleChange"
  />
</template>
