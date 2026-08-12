import type {
  AssetFolder,
  AssetType,
  PlatformAsset,
} from '#/modules/platform/types';

import { requestClient } from '#/api/request';

import { uploadPresignedFile } from './uploads';

export interface PrepareAssetUploadInput {
  description: string;
  derivedFromAssetId?: string;
  file: File;
  folderId?: string;
  kind: AssetType;
  name: string;
  projectId: string;
  tags?: string[];
}

interface PreparedAssetUpload {
  asset: PlatformAsset;
  upload: {
    expiresAt: string;
    headers: Record<string, string>;
    method: 'PUT';
    url: string;
    version: number;
  };
}

export interface AssetSortOptions {
  sortBy: 'createdAt' | 'name' | 'owner' | 'type';
  sortOrder: 'asc' | 'desc';
}

export function getAssetsApi(
  projectId: string,
  options?: Partial<AssetSortOptions> & { folderId?: string; ownerId?: string },
) {
  return requestClient.get<PlatformAsset[]>('/assets', {
    params: { projectId, ...options },
  });
}

export function getAssetApi(assetId: string) {
  return requestClient.get<PlatformAsset>(`/assets/${assetId}`);
}

export function renameAssetApi(assetId: string, name: string) {
  return requestClient.request<PlatformAsset>(`/assets/${assetId}`, {
    data: { name },
    method: 'PATCH',
  });
}

export async function uploadAssetApi(input: PrepareAssetUploadInput) {
  const prepared = await requestClient.post<PreparedAssetUpload>(
    '/assets/uploads',
    {
      description: input.description,
      derivedFromAssetId: input.derivedFromAssetId,
      filename: input.file.name,
      folderId: input.folderId,
      kind: input.kind,
      mimeType: input.file.type || 'application/octet-stream',
      name: input.name,
      projectId: input.projectId,
      sizeBytes: input.file.size,
      tags: input.tags ?? [],
    },
  );
  await uploadPresignedFile(prepared.upload, input.file, '文件上传失败');
  return await requestClient.post<PlatformAsset>(
    `/assets/${prepared.asset.id}/complete`,
  );
}

export function createTextAssetApi(input: {
  content: string;
  description: string;
  folderId?: string;
  mimeType?: 'application/json' | 'text/markdown' | 'text/plain';
  name: string;
  projectId: string;
  tags?: string[];
}) {
  return requestClient.post<PlatformAsset>('/assets/text', input);
}

export function getAssetFoldersApi(projectId: string) {
  return requestClient.get<AssetFolder[]>('/asset-folders', {
    params: { projectId },
  });
}

export function createAssetFolderApi(input: {
  name: string;
  parentId?: null | string;
  projectId: string;
}) {
  return requestClient.post<AssetFolder>('/asset-folders', input);
}

export function renameAssetFolderApi(folderId: string, name: string) {
  return requestClient.request<{ id: string; name: string }>(
    `/asset-folders/${folderId}`,
    { data: { name }, method: 'PATCH' },
  );
}

export function deleteAssetFolderApi(folderId: string) {
  return requestClient.delete<{
    assetCount: number;
    deleted: true;
    folderCount: number;
    id: string;
  }>(`/asset-folders/${folderId}`);
}

export function batchAssetsApi(input: {
  assetIds: string[];
  operation: 'copy' | 'delete' | 'move';
  projectId: string;
  targetFolderId?: null | string;
}) {
  return requestClient.post<{
    copiedAssetIds?: string[];
    deletedCount?: number;
    movedCount?: number;
  }>('/assets/batch', input);
}

export function setAssetFavoriteApi(assetId: string, favorite: boolean) {
  return requestClient.request<PlatformAsset>(`/assets/${assetId}/favorite`, {
    data: { favorite },
    method: 'PATCH',
  });
}

export function getAssetDownloadApi(assetId: string) {
  return requestClient.get<
    | { content: string; mimeType: string; mode: 'inline' }
    | { expiresAt: string; mode: 'url'; url: string }
  >(`/assets/${assetId}/download`);
}

export function getAssetPreviewApi(assetId: string) {
  return requestClient.get<
    | { content: string; mimeType: string; mode: 'inline' }
    | {
        expiresAt: string;
        mimeType: string;
        mode: 'url';
        url: string;
      }
  >(`/assets/${assetId}/preview`);
}

export function saveWorkflowOutputApi(assetId: string) {
  return requestClient.post<PlatformAsset>(`/assets/${assetId}/save`);
}

export function deleteAssetApi(assetId: string) {
  return requestClient.delete<{ deleted: true; id: string }>(
    `/assets/${assetId}`,
  );
}
