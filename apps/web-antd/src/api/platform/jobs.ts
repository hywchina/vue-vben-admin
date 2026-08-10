import type { PlatformJob } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface CreateJobInput {
  appKey: string;
  inputAssetIds: string[];
  inputTransferIds?: string[];
  name: string;
  parameters: Record<string, unknown>;
  projectId: string;
}

export function getJobsApi(projectId: string) {
  return requestClient.get<PlatformJob[]>('/jobs', { params: { projectId } });
}

export function createJobApi(input: CreateJobInput) {
  return requestClient.post<PlatformJob>('/jobs', input);
}

export function cancelJobApi(jobId: string) {
  return requestClient.post<{ id: string; status: PlatformJob['status'] }>(
    `/jobs/${jobId}/cancel`,
  );
}
