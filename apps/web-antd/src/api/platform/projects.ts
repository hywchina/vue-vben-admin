import type { PlatformProject } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface CreateProjectInput {
  description: string;
  name: string;
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
