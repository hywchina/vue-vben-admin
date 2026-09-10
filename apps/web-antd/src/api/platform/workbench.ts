import type {
  AssetGenerationCategory,
  AssetType,
} from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export type WorkbenchSection =
  | 'designs'
  | 'projects'
  | 'results'
  | 'saved'
  | 'tasks';
export interface WorkbenchItem {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  updatedAt: string;
  canWrite: boolean;
  appKey?: string;
  jobId?: string;
  appName?: string;
  assetCount?: number;
  conversationId?: string;
  roundCount?: number;
  previewAssetId?: string;
  status?: string;
  progress?: number;
  stage?: string;
  errorMessage?: string;
  type?: AssetType;
  mimeType?: string;
  filename?: string;
  folderId?: string;
  generationCategory?: AssetGenerationCategory;
  saved?: boolean;
}
export interface WorkbenchPage {
  items: WorkbenchItem[];
  total: number;
}
export function getWorkbenchApi(
  section: WorkbenchSection,
  pageSize = 6,
  page = 1,
  activeOnly = false,
) {
  return requestClient.get<WorkbenchPage>('/workbench', {
    params: { section, pageSize, page, activeOnly: String(activeOnly) },
  });
}
