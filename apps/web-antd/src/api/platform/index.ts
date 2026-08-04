import type {
  AssetType,
  PlatformApplication,
  PlatformAsset,
  PlatformAuditEvent,
  PlatformJob,
  PlatformProject,
  PlatformRole,
  PlatformUser,
} from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export * from './assistant';

export interface CreateProjectInput {
  description: string;
  name: string;
}

export interface PrepareAssetUploadInput {
  description: string;
  file: File;
  kind: AssetType;
  name: string;
  projectId: string;
  tags?: string[];
}

interface PreparedUpload {
  asset: PlatformAsset;
  upload: {
    expiresAt: string;
    headers: Record<string, string>;
    method: 'PUT';
    url: string;
    version: number;
  };
}

export function getProjectsApi() {
  return requestClient.get<{
    currentProjectId: null | string;
    items: PlatformProject[];
  }>('/projects');
}

export function createProjectApi(input: CreateProjectInput) {
  return requestClient.post<PlatformProject>('/projects', input);
}

export function selectCurrentProjectApi(projectId: string) {
  return requestClient.put<{ projectId: string }>('/users/me/current-project', {
    projectId,
  });
}

export function getApplicationsApi() {
  return requestClient.get<PlatformApplication[]>('/applications');
}

export function getAssetsApi(projectId: string) {
  return requestClient.get<PlatformAsset[]>('/assets', {
    params: { projectId },
  });
}

export async function uploadAssetApi(input: PrepareAssetUploadInput) {
  const prepared = await requestClient.post<PreparedUpload>('/assets/uploads', {
    description: input.description,
    filename: input.file.name,
    kind: input.kind,
    mimeType: input.file.type || 'application/octet-stream',
    name: input.name,
    projectId: input.projectId,
    sizeBytes: input.file.size,
    tags: input.tags ?? [],
  });
  const uploadResponse = await fetch(prepared.upload.url, {
    body: input.file,
    headers: prepared.upload.headers,
    method: prepared.upload.method,
  });
  if (!uploadResponse.ok) {
    throw new Error(`文件上传失败（HTTP ${uploadResponse.status}）`);
  }
  return await requestClient.post<PlatformAsset>(
    `/assets/${prepared.asset.id}/complete`,
  );
}

export function createTextAssetApi(input: {
  content: string;
  description: string;
  name: string;
  projectId: string;
  tags?: string[];
}) {
  return requestClient.post<PlatformAsset>('/assets/text', input);
}

export function setAssetFavoriteApi(assetId: string, favorite: boolean) {
  return requestClient.request<PlatformAsset>(`/assets/${assetId}/favorite`, {
    data: { favorite },
    method: 'PATCH',
  });
}

export function getAssetDownloadApi(assetId: string) {
  return requestClient.get<
    | { content: string; mimeType: string; mode: 'inline' }
    | { expiresAt: string; mode: 'url'; url: string }
  >(`/assets/${assetId}/download`);
}

export function getAssetPreviewApi(assetId: string) {
  return requestClient.get<{ expiresAt: string; url: string }>(
    `/assets/${assetId}/preview`,
  );
}

export function getJobsApi(projectId: string) {
  return requestClient.get<PlatformJob[]>('/jobs', { params: { projectId } });
}

export function createJobApi(input: {
  appKey: string;
  inputAssetIds: string[];
  name: string;
  parameters: Record<string, unknown>;
  projectId: string;
}) {
  return requestClient.post<PlatformJob>('/jobs', input);
}

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

export function getAuditEventsApi(params?: {
  actorId?: string;
  limit?: number;
  module?: string;
  page?: number;
}) {
  return requestClient.get<{
    items: PlatformAuditEvent[];
    limit: number;
    page: number;
    scope: 'all' | 'self';
    total: number;
  }>('/audit-events', { params });
}

export function recordPageViewApi(input: {
  fromPath?: string;
  path: string;
  title?: string;
}) {
  return requestClient.post<{ recorded: boolean }>(
    '/audit-events/client',
    input,
  );
}

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
