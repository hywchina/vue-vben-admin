<script lang="ts" setup>
import type { VbenFormSchema } from '@vben/common-ui';
import type { Recordable } from '@vben/types';

import { computed, ref } from 'vue';

import { AuthenticationForgetPassword, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { requestPasswordResetApi } from '#/api';

defineOptions({ name: 'ForgetPassword' });

const loading = ref(false);
const submitted = ref(false);

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInput',
      componentProps: {
        placeholder: 'example@example.com',
      },
      fieldName: 'email',
      label: $t('authentication.email'),
      rules: z
        .string()
        .min(1, { message: $t('authentication.emailTip') })
        .email($t('authentication.emailValidErrorTip')),
    },
  ];
});

async function handleSubmit(value: Recordable<any>) {
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await requestPasswordResetApi(String(value.email));
    submitted.value = true;
    message.success(result.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthenticationForgetPassword
    :form-schema="formSchema"
    :loading="loading"
    :submit-button-text="submitted ? '重新发送重置邮件' : '发送重置邮件'"
    :sub-title="
      submitted
        ? '请检查企业邮箱。邮件中的链接 30 分钟内有效。'
        : '输入已登记的企业邮箱，系统将发送一次性密码重置链接。'
    "
    @submit="handleSubmit"
  />
</template>
