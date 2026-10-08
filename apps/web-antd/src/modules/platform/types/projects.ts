export interface PlatformProject {
  activeJobCount: number;
  assetCount: number;
  canDelete: boolean;
  /** Compatibility alias of publicId. */
  code: string;
  legacyCodes?: string[];
  createdAt: string;
  description: string;
  id: string;
  /** Stable business number; optional only for cached legacy responses. */
  publicId?: string;
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
