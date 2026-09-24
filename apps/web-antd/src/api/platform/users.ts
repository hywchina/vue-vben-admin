import type { PlatformRole, PlatformUser } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface CreatePlatformUserInput {
  department: string;
  email: string;
  password: string;
  realName: string;
  role: 'admin' | 'user';
  username: string;
}

export function getUsersApi() {
  return requestClient.get<PlatformUser[]>('/users');
}

export function createUserApi(input: CreatePlatformUserInput) {
  return requestClient.post<PlatformUser>('/users', input);
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

export function resetUserPasswordApi(userId: string, newPassword: string) {
  return requestClient.put<{ changed: true; id: string }>(
    `/users/${userId}/password`,
    { newPassword },
  );
}

export function getRolesApi() {
  return requestClient.get<PlatformRole[]>('/roles');
}
