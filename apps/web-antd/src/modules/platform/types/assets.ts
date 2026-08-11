export type AssetType =
  | 'archive'
  | 'audio'
  | 'document'
  | 'image'
  | 'model3d'
  | 'model'
  | 'text'
  | 'video';

export interface PlatformAsset {
  accent: string;
  createdAt: string;
  derivedFromAssetId?: string;
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
