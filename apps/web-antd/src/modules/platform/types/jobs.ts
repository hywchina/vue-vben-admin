export type JobStatus =
  | 'cancelled'
  | 'cancelling'
  | 'failed'
  | 'queued'
  | 'running'
  | 'succeeded';

export interface PlatformJob {
  appKey: string;
  completedAt?: string;
  createdAt: string;
  createdBy: string;
  designConversationId?: string;
  designConversationTitle?: string;
  duration?: string;
  error?: {
    code: string;
    message: string;
  };
  externalReference?: string;
  id: string;
  inputAssetIds: string[];
  inputs: PlatformJobInput[];
  name: string;
  ownedByCurrentUser: boolean;
  outputAssetId?: string;
  outputs: PlatformJobOutput[];
  owner: string;
  ownerPublicId: string;
  parameters: Record<string, unknown>;
  progress: number;
  projectId: string;
  publicId: string;
  stage: string;
  status: JobStatus;
  workflowVersion?: number;
  workspaceInstanceId?: string;
  workspaceInstanceTitle?: string;
}

export interface PlatformJobInput {
  annotationAssetId?: string;
  annotationMimeType?: string;
  annotationName?: string;
  assetId: string;
  derivedFromAssetId?: string;
  kind: import('./assets').AssetType;
  mimeType: string;
  name: string;
  position: number;
}

export interface PlatformJobOutput extends PlatformJobInput {
  saved: boolean;
}
