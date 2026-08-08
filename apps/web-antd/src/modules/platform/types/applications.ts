import type { AssetType } from './assets';

export type ApplicationCategory =
  | 'design'
  | 'generation'
  | 'report'
  | 'training';

export type ApplicationStatus = 'available' | 'planned' | 'testing';

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
