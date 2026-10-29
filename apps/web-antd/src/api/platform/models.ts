import type { PlatformCapability } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface SystemModelFile {
  path: string;
  size: number;
  sha256?: string;
  actualSha256?: string;
}
export interface SystemModel {
  id: string;
  name: string;
  category: string;
  note: string;
  files: SystemModelFile[];
  totalBytes: number;
  status:
    | 'cancelled'
    | 'failed'
    | 'queued'
    | 'ready'
    | 'uploading'
    | 'verifying';
  progress: number;
  error: null | string;
  createdAt: string;
}
export interface ModelReference {
  capabilityCode: string;
  appKey: string;
  workflowName: string;
  versionId: string;
  version: number;
  nodeId: string;
  inputName: string;
  classType: string;
  filename: string;
  category: string;
}
export interface ModelUpdate {
  id: string;
  modelId: string;
  capabilityCode: string;
  appKey: string;
  workflowName: string;
  version: number;
  publishedAt: null | string;
  testJobId: null | string;
  testStatus: null | string;
  testPublicId: null | string;
}
export interface SystemModelOverview {
  models: SystemModel[];
  references: ModelReference[];
  updates: ModelUpdate[];
  choices: Array<{
    category: string;
    classType: string;
    files: string[];
    inputName: string;
  }>;
  serviceError: null | string;
  storageConfigured: boolean;
  partBytes: number;
  maxBytes: number;
}
export interface ModelUploadStatus extends SystemModel {
  partBytes: number;
  parts: Array<{
    fileIndex: number;
    partIndex: number;
    sha256: string;
    size: number;
  }>;
}
export function getSystemModelsApi() {
  return requestClient.get<SystemModelOverview>('/model-management');
}
export function createSystemModelApi(input: {
  category: string;
  files: SystemModelFile[];
  name: string;
  note: string;
}) {
  return requestClient.post<{ id: string; partBytes: number }>(
    '/model-management',
    input,
  );
}
export function getModelUploadApi(id: string) {
  return requestClient.get<ModelUploadStatus>(`/model-management/${id}`);
}
export function putModelPartApi(
  id: string,
  file: number,
  part: number,
  blob: Blob,
  signal: AbortSignal,
) {
  return requestClient.put(
    `/model-management/${id}/parts/${file}/${part}`,
    blob,
    {
      headers: { 'Content-Type': 'application/octet-stream' },
      timeout: 120_000,
      signal,
    },
  );
}
export function completeSystemModelApi(id: string) {
  return requestClient.post(`/model-management/${id}/complete`);
}
export function cancelSystemModelApi(id: string) {
  return requestClient.post(`/model-management/${id}/cancel`);
}
export function prepareModelUpdateApi(
  modelId: string,
  input: {
    baseVersionId: string;
    capabilityCode: string;
    replacements: Array<{
      filePath: string;
      inputName: string;
      nodeId: string;
      oldValue: string;
    }>;
  },
) {
  return requestClient.post<{ id: string }>(
    `/model-management/${modelId}/updates`,
    input,
  );
}
export function getModelUpdateApi(id: string) {
  return requestClient.get<{
    appKey: string;
    capability: PlatformCapability;
    capabilityCode: string;
    id: string;
    lockedParameters: Record<string, unknown>;
    modelId: string;
    publishedAt: null | string;
    tests: Array<{
      id: string;
      progress: number;
      publicId: string;
      stage: string;
      status: string;
    }>;
    versionId: string;
  }>(`/model-management/updates/${id}`);
}
export function publishModelUpdateApi(id: string) {
  return requestClient.post(`/model-management/updates/${id}/publish`);
}
