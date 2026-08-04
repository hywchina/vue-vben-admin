export type ApplicationCategory =
  | 'design'
  | 'generation'
  | 'report'
  | 'training';

export type ApplicationStatus = 'available' | 'planned' | 'testing';

export type AssetType =
  | 'archive'
  | 'audio'
  | 'document'
  | 'image'
  | 'model3d'
  | 'model'
  | 'text'
  | 'video';

export type JobStatus =
  | 'cancelled'
  | 'failed'
  | 'queued'
  | 'running'
  | 'succeeded';

export interface PlatformProject {
  assetCount: number;
  code: string;
  description: string;
  id: string;
  members: number;
  name: string;
  stage: 'archived' | 'concept' | 'delivery' | 'design';
  updatedAt: string;
}

export interface PlatformAsset {
  accent: string;
  createdAt: string;
  description: string;
  favorite: boolean;
  format: string;
  id: string;
  mimeType?: string;
  name: string;
  owner: string;
  projectId: string;
  size: string;
  sizeBytes?: number;
  source: 'upload' | 'workflow';
  sourceAppKey?: string;
  sourceJobId?: string;
  status?: 'available' | 'failed' | 'pending';
  tags: string[];
  type: AssetType;
  version: number;
}

export interface PlatformApplication {
  acceptedAssetTypes: AssetType[];
  category: ApplicationCategory;
  color: string;
  description: string;
  icon: string;
  key: string;
  name: string;
  outputAssetTypes: AssetType[];
  provider: string;
  shortName: string;
  status: ApplicationStatus;
  updatedAt: string;
}

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

export interface PlatformUser {
  department: string;
  email: string;
  id: string;
  lastActive: string;
  name: string;
  projectCount: number;
  roleCodes: string[];
  roles: string[];
  status: 'disabled' | 'enabled';
  username: string;
}

export interface PlatformRole {
  code: string;
  description: string;
  id: string;
  name: string;
  permissionCount: number;
  scope: string;
  userCount: number;
}

export interface PlatformAuditEvent {
  action: string;
  actorId?: null | string;
  actorRoles?: string[];
  actorType?: 'admin' | 'system' | 'user';
  createdAt: string;
  durationMs?: null | number;
  id: string;
  ip: string;
  method?: null | string;
  module: string;
  operator: string;
  requestId?: string;
  result: 'failed' | 'success';
  statusCode?: null | number;
  target: string;
  username?: string;
}
