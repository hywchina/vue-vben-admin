import { requestClient } from '#/api/request';

export interface PlatformNotification {
  createdAt: string;
  id: string;
  isRead: boolean;
  link: null | string;
  message: string;
  title: string;
  type: string;
}

export function getNotificationsApi() {
  return requestClient.get<PlatformNotification[]>('/notifications');
}

export function markNotificationReadApi(notificationId: string) {
  return requestClient.request(`/notifications/${notificationId}/read`, {
    method: 'PATCH',
  });
}

export function markAllNotificationsReadApi() {
  return requestClient.post('/notifications/read-all');
}

export function removeNotificationApi(notificationId: string) {
  return requestClient.delete(`/notifications/${notificationId}`);
}

export function clearNotificationsApi() {
  return requestClient.delete('/notifications');
}
