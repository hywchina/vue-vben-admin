export type JobStatus =
  | 'cancelled'
  | 'cancelling'
  | 'failed'
  | 'queued'
  | 'running'
  | 'succeeded';

export interface PlatformJob {
  appKey: string;
  createdAt: string;
  duration?: string;
  error?: {
    code: string;
    message: string;
  };
  externalReference?: string;
  id: string;
  inputAssetIds: string[];
  name: string;
  outputAssetId?: string;
  outputs: Array<{
    assetId: string;
    kind: import('./assets').AssetType;
    mimeType: string;
    name: string;
    saved: boolean;
  }>;
  owner: string;
  progress: number;
  projectId: string;
  stage: string;
  status: JobStatus;
  workflowVersion?: number;
}
