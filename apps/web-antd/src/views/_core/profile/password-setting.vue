<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { VbenFormSchema } from '#/adapter/form';

import { computed, ref } from 'vue';

import { ProfilePasswordSetting, z } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { updateUserPasswordApi } from '#/api';
import { useAuthStore } from '#/store';

const saving = ref(false);
const authStore = useAuthStore();

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: '请输入当前密码',
      },
      fieldName: 'oldPassword',
      label: '当前密码',
      rules: z.string().min(1, { message: '请输入当前密码' }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: '请输入新密码',
      },
      fieldName: 'newPassword',
      label: '新密码',
      rules: z
        .string()
        .min(8, { message: '密码至少需要 8 个字符' })
        .regex(/[A-Za-z]/, { message: '密码必须包含字母' })
        .regex(/\d/, { message: '密码必须包含数字' })
        .regex(/[^\dA-Za-z]/, { message: '密码必须包含符号' }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: '请再次输入新密码',
      },
      dependencies: {
        rules(values) {
          const { newPassword } = values;
          return z
            .string({ error: '请再次输入新密码' })
            .min(1, { message: '请再次输入新密码' })
            .refine((value) => value === newPassword, {
              message: '两次输入的密码不一致',
            });
        },
        triggerFields: ['newPassword'],
      },
      fieldName: 'confirmPassword',
      label: '确认新密码',
    },
  ];
});

async function handleSubmit(values: Recordable<unknown>) {
  if (saving.value) return;
  saving.value = true;
  try {
    await updateUserPasswordApi({
      newPassword: String(values.newPassword ?? ''),
      oldPassword: String(values.oldPassword ?? ''),
    });
    message.success('密码已修改，请使用新密码重新登录');
    await authStore.logout(false);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ProfilePasswordSetting
    class="w-1/2 max-w-xl"
    :form-schema="formSchema"
    :submit-loading="saving"
    @submit="handleSubmit"
  />
</template>
