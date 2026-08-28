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
  memberPreviews: ProjectMemberPreview[];
  members: number;
  name: string;
  ownerId: string;
  stage: 'archived' | 'concept' | 'delivery' | 'design';
  updatedAt: string;
}

export interface ProjectMemberPreview {
  avatar: null | string;
  name: string;
  publicId: string;
}

export interface ProjectMember {
  assetCount: number;
  avatar: null | string;
  department: string;
  jobCount: number;
  joinedAt: string;
  name: string;
  projectRole: 'editor' | 'owner' | 'viewer';
  publicId: string;
  userId: string;
  username: string;
}
