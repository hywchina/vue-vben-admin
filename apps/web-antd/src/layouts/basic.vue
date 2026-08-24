<script lang="ts" setup>
import type { NotificationItem } from '@vben/layouts';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { AuthenticationLoginExpiredModal } from '@vben/common-ui';
import { useWatermark } from '@vben/hooks';
import {
  BasicLayout,
  LockScreen,
  Notification,
  UserDropdown,
} from '@vben/layouts';
import { preferences, usePreferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';

import { Select } from 'ant-design-vue';

import {
  clearNotificationsApi,
  getNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  removeNotificationApi,
} from '#/api';
import AiAssistant from '#/components/assistant/ai-assistant.vue';
import { $t } from '#/locales';
import { useAuthStore, usePlatformStore } from '#/store';
import LoginForm from '#/views/_core/authentication/login.vue';

const notifications = ref<NotificationItem[]>([]);

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const authStore = useAuthStore();
const accessStore = useAccessStore();
const platformStore = usePlatformStore();
const { destroyWatermark, updateWatermark } = useWatermark();
const { isDark } = usePreferences();
const showDot = computed(() =>
  notifications.value.some((item) => !item.isRead),
);
const showProjectSwitcher = computed(
  () =>
    route.name !== 'PlatformProjects' &&
    route.name !== 'LegacyPlatformOverview' &&
    route.name !== 'PlatformDashboard',
);

const menus = computed(() => [
  {
    handler: () => {
      router.push({ name: 'Profile' });
    },
    icon: 'lucide:user',
    text: $t('page.auth.profile'),
  },
]);

const projectOptions = computed(() =>
  platformStore.projects.map((project) => ({
    label: project.name,
    value: project.id,
  })),
);

const avatar = computed(() => {
  return userStore.userInfo?.avatar ?? preferences.app.defaultAvatar;
});
const userPublicId = computed(
  () => (userStore.userInfo as null | { publicId?: string })?.publicId ?? '',
);

onMounted(async () => {
  await Promise.all([platformStore.initialize(), loadNotifications()]);
});

async function loadNotifications() {
  const result = await getNotificationsApi();
  notifications.value = result.map((notification) => ({
    avatar: '/rail-logo.svg',
    date: new Date(notification.createdAt).toLocaleString('zh-CN'),
    id: notification.id,
    isRead: notification.isRead,
    link: notification.link ?? undefined,
    message: notification.message,
    title: notification.title,
  }));
}

async function handleLogout() {
  await authStore.logout(false);
}

async function handleNoticeClear() {
  await clearNotificationsApi();
  notifications.value = [];
}

async function markRead(id: number | string) {
  await markNotificationReadApi(String(id));
  const item = notifications.value.find((item) => item.id === id);
  if (item) {
    item.isRead = true;
  }
}

async function remove(id: number | string) {
  await removeNotificationApi(String(id));
  notifications.value = notifications.value.filter((item) => item.id !== id);
}

async function handleMakeAll() {
  await markAllNotificationsReadApi();
  notifications.value.forEach((item) => (item.isRead = true));
}

const viewAll = () => router.push('/jobs');

const handleClick = (item: NotificationItem) => {
  // 如果通知项有链接，点击时跳转
  if (item.link) {
    navigateTo(item.link, item.query, item.state);
  }
};

function navigateTo(
  link: string,
  query?: Record<string, any>,
  state?: Record<string, any>,
) {
  if (link.startsWith('http://') || link.startsWith('https://')) {
    // 外部链接，在新标签页打开
    window.open(link, '_blank');
  } else {
    // 内部路由链接，支持 query 参数和 state
    router.push({
      path: link,
      query: query || {},
      state,
    });
  }
}

watch(
  () => ({
    enable: preferences.app.watermark,
    content: preferences.app.watermarkContent,
    isDark: isDark.value,
  }),
  async ({ enable, content, isDark: isDarkValue }) => {
    if (enable) {
      const watermarkColor = isDarkValue
        ? 'rgba(255, 255, 255, 0.12)'
        : 'rgba(0, 0, 0, 0.12)';

      await updateWatermark({
        advancedStyle: {
          colorStops: [
            {
              color: watermarkColor,
              offset: 0,
            },
            {
              color: watermarkColor,
              offset: 1,
            },
          ],
          type: 'linear',
        },
        content:
          content ||
          `${userStore.userInfo?.username} - ${userStore.userInfo?.realName}`,
      });
    } else {
      destroyWatermark();
    }
  },
  {
    immediate: true,
  },
);
</script>

<template>
  <BasicLayout
    :avatar
    :text="userStore.userInfo?.realName"
    @clear-preferences-and-logout="handleLogout"
    @logout="handleLogout"
  >
    <template #header-left-600>
      <div v-if="showProjectSwitcher" class="rail-project-switcher">
        <span class="rail-project-switcher__label">当前项目</span>
        <Select
          :options="projectOptions"
          :value="platformStore.currentProjectId"
          class="w-64"
          size="small"
          @change="(value) => platformStore.switchProject(String(value))"
        />
      </div>
    </template>
    <template #user-dropdown>
      <UserDropdown
        :avatar
        :menus
        :text="userStore.userInfo?.realName"
        :description="`${userPublicId}${platformStore.currentProject?.name ? ` · ${platformStore.currentProject.name}` : ''}`"
        tag-text="快速设计平台"
        @clear-preferences-and-logout="handleLogout"
        @logout="handleLogout"
      />
    </template>
    <template #notification>
      <Notification
        :dot="showDot"
        :notifications="notifications"
        @clear="handleNoticeClear"
        @read="(item) => item.id && markRead(item.id)"
        @remove="(item) => item.id && remove(item.id)"
        @make-all="handleMakeAll"
        @on-click="handleClick"
        @view-all="viewAll"
      />
    </template>
    <template #extra>
      <AuthenticationLoginExpiredModal
        v-model:open="accessStore.loginExpired"
        :avatar
      >
        <LoginForm />
      </AuthenticationLoginExpiredModal>
    </template>
    <template #lock-screen>
      <LockScreen :avatar @to-login="handleLogout" />
    </template>
  </BasicLayout>
  <AiAssistant />
</template>
