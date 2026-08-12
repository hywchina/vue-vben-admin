export interface PlatformProject {
  activeJobCount: number;
  assetCount: number;
  canDelete: boolean;
  code: string;
  createdAt: string;
  description: string;
  id: string;
  isPinned: boolean;
  isOwner: boolean;
  jobCount: number;
  members: number;
  name: string;
  ownerId: string;
  stage: 'archived' | 'concept' | 'delivery' | 'design';
  updatedAt: string;
}

export interface ProjectMember {
  assetCount: number;
  department: string;
  jobCount: number;
  joinedAt: string;
  name: string;
  projectRole: 'editor' | 'owner' | 'viewer';
  publicId: string;
  userId: string;
  username: string;
}
