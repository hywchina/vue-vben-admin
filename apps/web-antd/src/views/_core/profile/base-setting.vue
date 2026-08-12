<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { VbenFormSchema } from '#/adapter/form';

import { computed, onMounted, ref } from 'vue';

import { ProfileBaseSetting, z } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { getUserInfoApi, updateUserProfileApi } from '#/api';
import { useAuthStore } from '#/store';

const profileBaseSettingRef = ref();
const saving = ref(false);
const authStore = useAuthStore();

const roleLabels: Record<string, string> = {
  admin: '管理员',
  user: '普通用户',
};

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'Input',
      fieldName: 'realName',
      label: '姓名',
      rules: z
        .string()
        .trim()
        .min(1, { message: '姓名不能为空' })
        .max(100, { message: '姓名不能超过 100 个字符' }),
    },
    {
      component: 'Input',
      componentProps: {
        disabled: true,
      },
      fieldName: 'publicId',
      help: '该用户 ID 全平台唯一，项目创建者或平台管理员可通过它邀请你加入项目。',
      label: '用户 ID',
    },
    {
      component: 'Input',
      componentProps: {
        disabled: true,
      },
      fieldName: 'username',
      label: '登录用户名',
    },
    {
      component: 'Input',
      fieldName: 'email',
      label: '企业邮箱',
      rules: z
        .string()
        .trim()
        .min(1, { message: '请输入企业邮箱' })
        .email('请输入有效的企业邮箱'),
    },
    {
      component: 'Input',
      fieldName: 'department',
      label: '所属部门',
      rules: z
        .string()
        .trim()
        .max(100, {
          message: '部门名称不能超过 100 个字符',
        })
        .optional(),
    },
    {
      component: 'Input',
      componentProps: {
        disabled: true,
        placeholder: '由管理员分配',
      },
      fieldName: 'rolesDisplay',
      help: '平台角色和权限只能由管理员在“用户与权限”中调整。',
      label: '平台角色',
    },
    {
      component: 'Textarea',
      componentProps: {
        maxlength: 500,
        rows: 5,
        showCount: true,
      },
      fieldName: 'introduction',
      label: '个人简介',
      rules: z
        .string()
        .trim()
        .max(500, {
          message: '个人简介不能超过 500 个字符',
        })
        .optional(),
    },
  ];
});

function toFormValues(data: Awaited<ReturnType<typeof getUserInfoApi>>) {
  return {
    department: data.department ?? '',
    email: data.email ?? '',
    introduction: data.introduction ?? '',
    realName: data.realName,
    publicId: data.publicId,
    rolesDisplay: data.roles.map((role) => roleLabels[role] ?? role).join('、'),
    username: data.username,
  };
}

async function loadProfile() {
  const data = await getUserInfoApi();
  await profileBaseSettingRef.value?.getFormApi().setValues(toFormValues(data));
}

async function handleSubmit(values: Recordable<unknown>) {
  if (saving.value) return;
  saving.value = true;
  try {
    await updateUserProfileApi({
      department: String(values.department ?? ''),
      email: String(values.email ?? ''),
      introduction: String(values.introduction ?? ''),
      realName: String(values.realName ?? ''),
    });
    const updated = await authStore.fetchUserInfo();
    await profileBaseSettingRef.value
      ?.getFormApi()
      .setValues(toFormValues(updated));
    message.success('基本信息已更新');
  } finally {
    saving.value = false;
  }
}

onMounted(loadProfile);
</script>

<template>
  <ProfileBaseSetting
    ref="profileBaseSettingRef"
    :form-schema="formSchema"
    :submit-loading="saving"
    @submit="handleSubmit"
  />
</template>
