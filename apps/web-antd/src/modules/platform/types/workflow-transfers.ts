import type { AssetType } from './assets';

export interface WorkflowInputTransfer {
  assetId: string;
  assetKind: AssetType;
  assetName: string;
  createdAt?: string;
  id: string;
  projectId: string;
  sourceJobId?: string;
  targetAppKey: string;
  targetAssetIndex: number;
}
