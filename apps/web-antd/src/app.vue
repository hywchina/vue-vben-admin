<script lang="ts" setup>
import { computed } from 'vue';

import { useAntdDesignTokens } from '@vben/hooks';
import { preferences, usePreferences } from '@vben/preferences';

import { App, ConfigProvider, theme } from 'ant-design-vue';

import { antdLocale } from '#/locales';

defineOptions({ name: 'App' });

const { isDark } = usePreferences();
const { tokens } = useAntdDesignTokens();

const tokenTheme = computed(() => {
  const algorithm = isDark.value
    ? [theme.darkAlgorithm]
    : [theme.defaultAlgorithm];

  // antd 紧凑模式算法
  if (preferences.app.compact) {
    algorithm.push(theme.compactAlgorithm);
  }

  return {
    algorithm,
    token: {
      ...tokens,
      ...(isDark.value
        ? {
            colorBgBase: '#191c20',
            colorBgContainer: '#191c20',
            colorBgLayout: '#191c20',
            colorBgElevated: '#242a31',
            colorText: '#e8ebef',
            colorTextSecondary: '#adb5c0',
            colorTextPlaceholder: '#929da9',
            colorTextDisabled: '#78838e',
            colorBgContainerDisabled: '#22272e',
            colorBorder: '#363b42',
            colorPrimary: '#c93655',
            colorPrimaryText: '#ff879b',
            colorLink: '#ff879b',
          }
        : {}),
    },
  };
});
</script>

<template>
  <ConfigProvider :locale="antdLocale" :theme="tokenTheme">
    <App>
      <RouterView />
    </App>
  </ConfigProvider>
</template>
