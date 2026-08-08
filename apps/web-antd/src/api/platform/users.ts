import type { PlatformRole, PlatformUser } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function getUsersApi() {
  return requestClient.get<PlatformUser[]>('/users');
}

export function setUserStatusApi(
  userId: string,
  status: PlatformUser['status'],
) {
  return requestClient.request<{
    id: string;
    status: PlatformUser['status'];
  }>(`/users/${userId}/status`, { data: { status }, method: 'PATCH' });
}

export function setUserRolesApi(userId: string, roles: string[]) {
  return requestClient.put<{
    id: string;
    roleCodes: string[];
    roles: string[];
  }>(`/users/${userId}/roles`, { roles });
}

export function getRolesApi() {
  return requestClient.get<PlatformRole[]>('/roles');
}
