import type { PlatformProject, ProjectMember } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface CreateProjectInput {
  description: string;
  name: string;
}

export interface ProjectSortOptions {
  sortBy: 'createdAt' | 'name' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
}

export function getProjectsApi(options?: Partial<ProjectSortOptions>) {
  return requestClient.get<{
    currentProjectId: null | string;
    items: PlatformProject[];
  }>('/projects', { params: options });
}

export function createProjectApi(input: CreateProjectInput) {
  return requestClient.post<PlatformProject>('/projects', input);
}

export function selectCurrentProjectApi(projectId: string) {
  return requestClient.put<{ projectId: string }>('/users/me/current-project', {
    projectId,
  });
}

export function updateProjectApi(
  projectId: string,
  input: { description?: string; name?: string },
) {
  return requestClient.request<{
    description: string;
    id: string;
    name: string;
  }>(`/projects/${projectId}`, { data: input, method: 'PATCH' });
}

export function deleteProjectApi(projectId: string) {
  return requestClient.delete<{ archived: true; id: string }>(
    `/projects/${projectId}`,
  );
}

export function getProjectMembersApi(projectId: string) {
  return requestClient.get<{
    canInvite: boolean;
    items: ProjectMember[];
    projectId: string;
  }>(`/projects/${projectId}/members`);
}

export function inviteProjectMemberApi(
  projectId: string,
  input: {
    projectRole: 'editor' | 'viewer';
    userPublicId: string;
  },
) {
  return requestClient.post<ProjectMember>(
    `/projects/${projectId}/members`,
    input,
  );
}

export function removeProjectMemberApi(
  projectId: string,
  userPublicId: string,
) {
  return requestClient.delete<{
    name: string;
    projectId: string;
    removed: true;
    userPublicId: string;
  }>(`/projects/${projectId}/members/${userPublicId}`);
}

export function setProjectPinnedApi(projectId: string, pinned: boolean) {
  return requestClient.request<{ id: string; pinned: boolean }>(
    `/projects/${projectId}/pin`,
    { data: { pinned }, method: 'PATCH' },
  );
}
