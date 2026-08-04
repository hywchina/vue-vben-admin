<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { ProfileSecuritySetting } from '@vben/common-ui';

import { getUserInfoApi } from '#/api';

const email = ref('');

function maskEmail(value: string) {
  const [name = '', domain = ''] = value.split('@');
  if (!domain) return value;
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'*'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}

const formSchema = computed(() => [
  {
    description: email.value
      ? `已绑定企业邮箱：${maskEmail(email.value)}`
      : '尚未绑定企业邮箱，请先在“基本设置”中登记',
    disabled: true,
    fieldName: 'securityEmail',
    label: '企业邮箱',
    value: Boolean(email.value),
  },
]);

onMounted(async () => {
  const profile = await getUserInfoApi();
  email.value = profile.email ?? '';
});
</script>

<template>
  <ProfileSecuritySetting :form-schema="formSchema" />
</template>
