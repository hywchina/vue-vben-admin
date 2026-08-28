import type { PlatformJob } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface LoraAdapterStatus {
  configured: boolean;
  gpuIds?: string;
  model: string;
  models: Array<{
    architecture: string;
    description: string;
    key: string;
    label: string;
    verified: boolean;
  }>;
  reachable: boolean;
  reason?: string;
}

export interface CreateLoraTrainingInput {
  items: Array<{ assetId: string; caption: string }>;
  name: string;
  parameters: {
    baseModel: string;
    epochs: number;
    learningRate: number;
    previewPrompt: string;
    rank: number;
    repeats: number;
    resolution: 512 | 768 | 1024;
    triggerWord: string;
  };
  projectId: string;
}

export interface LoraMetricPoint {
  step: number;
  value: number;
  wall_time: number;
}

export function getLoraStatusApi() {
  return requestClient.get<LoraAdapterStatus>('/lora/status');
}

export function createLoraTrainingApi(input: CreateLoraTrainingInput) {
  return requestClient.post<
    Pick<
      PlatformJob,
      | 'appKey'
      | 'createdAt'
      | 'id'
      | 'name'
      | 'progress'
      | 'publicId'
      | 'stage'
      | 'status'
    >
  >('/lora/trainings', input);
}

export function getLoraTrainingLogsApi(jobId: string, offset = 0) {
  return requestClient.get<{ log: string; offset: number; reset: boolean }>(
    `/lora/trainings/${jobId}/logs`,
    { params: { offset } },
  );
}

export function getLoraTrainingMetricsApi(jobId: string, sinceStep?: number) {
  return requestClient.get<{
    key: string;
    keys: string[];
    points: LoraMetricPoint[];
  }>(`/lora/trainings/${jobId}/metrics`, {
    params: { sinceStep },
  });
}

export function requestLoraCheckpointApi(jobId: string) {
  return requestClient.post<{ accepted: true; id: string }>(
    `/lora/trainings/${jobId}/checkpoint`,
  );
}
