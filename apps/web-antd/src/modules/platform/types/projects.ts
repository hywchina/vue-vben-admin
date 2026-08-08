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
