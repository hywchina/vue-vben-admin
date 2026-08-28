import type { JobStatus, PlatformJob } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface CreateJobInput {
  appKey: string;
  designConversationId?: string;
  designMode?: 'cabin' | 'cmf' | 'component' | 'report';
  inputAnnotations?: Array<{ assetId: string; position: number }>;
  inputAssetIds: string[];
  inputTransferIds?: string[];
  name: string;
  parameters: Record<string, unknown>;
  projectId: string;
  workspaceInstanceId?: string;
}

export interface JobListOptions {
  designConversationId?: string;
  ownerId?: string;
  search?: string;
  sortBy?: 'createdAt' | 'name' | 'owner' | 'status';
  sortOrder?: 'asc' | 'desc';
  status?: 'active' | JobStatus;
}

export function getJobsApi(
  projectId: string,
  designConversationIdOrOptions?: JobListOptions | string,
) {
  const options =
    typeof designConversationIdOrOptions === 'string'
      ? { designConversationId: designConversationIdOrOptions }
      : designConversationIdOrOptions;
  return requestClient.get<PlatformJob[]>('/jobs', {
    params: { projectId, ...options },
  });
}

export function createJobApi(input: CreateJobInput) {
  return requestClient.post<PlatformJob>('/jobs', input);
}

export function cancelJobApi(jobId: string) {
  return requestClient.post<{ id: string; status: PlatformJob['status'] }>(
    `/jobs/${jobId}/cancel`,
  );
}

export function batchJobsApi(input: {
  jobIds: string[];
  operation: 'archive';
  projectId: string;
}) {
  return requestClient.post<{ archivedCount: number }>('/jobs/batch', input);
}
