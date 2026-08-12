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
  folderId?: string;
  format: string;
  id: string;
  mimeType?: string;
  name: string;
  owner: string;
  ownerId: string;
  ownerPublicId: string;
  projectId: string;
  publicId: string;
  size: string;
  sizeBytes?: number;
  source: 'upload' | 'workflow';
  sourceAppKey?: string;
  sourceJobId?: string;
  sourceJobPublicId?: string;
  status?: 'available' | 'failed' | 'pending';
  tags: string[];
  type: AssetType;
  version: number;
}

export interface AssetFolder {
  assetCount: number;
  createdAt: string;
  id: string;
  kind: 'favorites' | 'normal';
  name: string;
  parentId: null | string;
  updatedAt: string;
}
