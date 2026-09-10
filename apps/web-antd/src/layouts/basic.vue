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

import { Button, Empty, Modal, Select } from 'ant-design-vue';

import {
  clearNotificationsApi,
  getNotificationsApi,
  markAllNotificationsReadApi,
  markNotificationReadApi,
  removeNotificationApi,
} from '#/api';
import AiAssistant from '#/components/assistant/ai-assistant.vue';
import { $t } from '#/locales';
import { platformSemanticIcons } from '#/modules/platform/semantic-icons';
import { useAuthStore, usePlatformStore } from '#/store';
import LoginForm from '#/views/_core/authentication/login.vue';

const notifications = ref<NotificationItem[]>([]);
const notificationsOpen = ref(false);

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
const unreadNotificationCount = computed(
  () => notifications.value.filter((item) => !item.isRead).length,
);
const showProjectSwitcher = computed(
  () =>
    route.name !== 'PlatformProjects' &&
    route.name !== 'PlatformProjectManagement' &&
    route.name !== 'LegacyPlatformOverview' &&
    route.name !== 'PlatformDashboard' &&
    route.name !== 'PlatformDesign' &&
    route.name !== 'PlatformAssets' &&
    route.name !== 'PlatformModelTraining' &&
    route.name !== 'PlatformReportGeneration' &&
    route.name !== 'PlatformWorkflowManagement',
);

const menus = computed(() => [
  {
    handler: () => {
      router.push({ name: 'Profile' });
    },
    icon: platformSemanticIcons.profile,
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
    avatar: '/rail-logo.svg?v=crrc',
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

const viewAll = () => {
  notificationsOpen.value = true;
};

async function openNotification(item: NotificationItem) {
  if (!item.isRead && item.id) await markRead(item.id);
  if (!item.link) return;
  notificationsOpen.value = false;
  handleClick(item);
}

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
    <template #logo-text>
      <span
        class="rail-header-brand text-xl leading-7 font-medium"
        data-header-brand-title
      >
        客运装备内装模块化分区快速设计平台
      </span>
    </template>
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
  <Modal
    v-model:open="notificationsOpen"
    :footer="null"
    title="全部通知"
    width="720px"
  >
    <section class="notification-center" aria-label="全部通知列表">
      <header class="notification-center__toolbar">
        <span>
          共 {{ notifications.length }} 条通知<span
            v-if="unreadNotificationCount"
          >
            · {{ unreadNotificationCount }} 条未读
          </span>
        </span>
        <div>
          <Button
            :disabled="unreadNotificationCount === 0"
            size="small"
            type="text"
            @click="handleMakeAll"
          >
            全部标为已读
          </Button>
          <Button
            danger
            :disabled="notifications.length === 0"
            size="small"
            type="text"
            @click="handleNoticeClear"
          >
            清空全部
          </Button>
        </div>
      </header>

      <div v-if="notifications.length" class="notification-center__list">
        <article
          v-for="item in notifications"
          :key="item.id"
          :class="{ 'is-unread': !item.isRead }"
          tabindex="0"
          @click="openNotification(item)"
          @keydown.enter="openNotification(item)"
        >
          <img :alt="item.title" :src="item.avatar" />
          <div class="notification-center__content">
            <strong>{{ item.title }}</strong>
            <p>{{ item.message }}</p>
            <time>{{ item.date }}</time>
          </div>
          <div class="notification-center__actions" @click.stop>
            <Button
              v-if="!item.isRead"
              size="small"
              type="text"
              @click="item.id && markRead(item.id)"
            >
              标为已读
            </Button>
            <Button
              danger
              size="small"
              type="text"
              @click="item.id && remove(item.id)"
            >
              删除
            </Button>
          </div>
        </article>
      </div>
      <Empty v-else description="暂无通知" />
    </section>
  </Modal>
  <AiAssistant />
</template>

<style scoped>
.rail-header-brand {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  min-width: 0;
  color: hsl(var(--foreground));
  white-space: nowrap;
}

.notification-center {
  display: grid;
  gap: 12px;
  min-height: 260px;
}

.notification-center__toolbar,
.notification-center__toolbar > div {
  display: flex;
  gap: 8px;
  align-items: center;
}

.notification-center__toolbar {
  justify-content: space-between;
  padding: 0 2px 10px;
  font-size: 13px;
  color: #6f7b83;
  border-bottom: 1px solid #e7eaec;
}

.notification-center__list {
  display: grid;
  gap: 8px;
  max-height: min(62vh, 620px);
  overflow-y: auto;
}

.notification-center__list article {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  background: #fff;
  border: 1px solid #e4e8ea;
  border-radius: 10px;
}

.notification-center__list article:hover,
.notification-center__list article:focus-visible,
.notification-center__list article.is-unread {
  outline: 0;
  background: #fff8f9;
  border-color: #ead1d6;
}

.notification-center__list img {
  width: 38px;
  height: 38px;
  object-fit: contain;
  background: #f6f7f8;
  border-radius: 50%;
}

.notification-center__content {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.notification-center__content strong,
.notification-center__content p {
  overflow: hidden;
  text-overflow: ellipsis;
}

.notification-center__content strong {
  white-space: nowrap;
}

.notification-center__content p {
  display: -webkit-box;
  margin: 0;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.45;
  color: #65717a;
  -webkit-box-orient: vertical;
}

.notification-center__content time {
  font-size: 11px;
  color: #929ba2;
}

.notification-center__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

@media (max-width: 640px) {
  .notification-center__toolbar {
    align-items: flex-start;
  }

  .notification-center__list article {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .notification-center__list img {
    width: 34px;
    height: 34px;
  }

  .notification-center__actions {
    grid-column: 2;
    justify-content: flex-end;
  }
}
</style>
