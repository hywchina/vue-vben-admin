export type JobStatus =
  | 'cancelled'
  | 'failed'
  | 'queued'
  | 'running'
  | 'succeeded';

export interface PlatformJob {
  appKey: string;
  createdAt: string;
  duration?: string;
  id: string;
  inputAssetIds: string[];
  name: string;
  outputAssetId?: string;
  owner: string;
  progress: number;
  projectId: string;
  stage: string;
  status: JobStatus;
}
