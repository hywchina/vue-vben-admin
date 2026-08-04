<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AuthenticationForgetPassword, z } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { confirmPasswordResetApi } from '#/api';

defineOptions({ name: 'ResetPassword' });

const loading = ref(false);
const route = useRoute();
const router = useRouter();
const token = computed(() =>
  typeof route.query.token === 'string' ? route.query.token : '',
);

const formSchema = computed((): VbenFormSchema[] => {
  return [
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
        placeholder: '请再次输入新密码',
      },
      dependencies: {
        rules(values) {
          return z
            .string()
            .min(1, { message: '请再次输入新密码' })
            .refine((value) => value === values.newPassword, {
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

async function handleSubmit(value: Recordable<any>) {
  if (loading.value) return;
  if (!token.value) {
    message.error('密码重置链接无效，请重新申请');
    return;
  }
  loading.value = true;
  try {
    await confirmPasswordResetApi({
      newPassword: String(value.newPassword),
      token: token.value,
    });
    message.success('密码已重置，请使用新密码登录');
    await router.replace('/auth/login');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthenticationForgetPassword
    :form-schema="formSchema"
    :loading="loading"
    submit-button-text="确认重置密码"
    sub-title="设置新的登录密码。提交成功后，其他设备上的旧会话将全部失效。"
    title="设置新密码"
    @submit="handleSubmit"
  />
</template>
