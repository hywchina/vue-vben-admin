import type { UserInfo } from '@vben/types';

import { requestClient } from '#/api/request';

export interface NotificationPreferences {
  accountMessage: boolean;
  systemMessage: boolean;
  todoTask: boolean;
}

export interface PlatformUserInfo extends UserInfo {
  department: string;
  email: string;
  id: string;
  introduction: string;
  roles: string[];
}

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  return requestClient.get<PlatformUserInfo>('/user/info');
}

export function updateUserProfileApi(input: {
  department: string;
  email: string;
  introduction: string;
  realName: string;
}) {
  return requestClient.request<{
    department: string;
    email: string;
    introduction: string;
    realName: string;
  }>('/user/profile', { data: input, method: 'PATCH' });
}

export function updateUserPasswordApi(input: {
  newPassword: string;
  oldPassword: string;
}) {
  return requestClient.put<{ changed: boolean }>('/user/password', input);
}

export function getNotificationPreferencesApi() {
  return requestClient.get<NotificationPreferences>(
    '/user/notification-preferences',
  );
}

export function updateNotificationPreferencesApi(
  input: NotificationPreferences,
) {
  return requestClient.request<NotificationPreferences>(
    '/user/notification-preferences',
    { data: input, method: 'PATCH' },
  );
}
