export interface WorkflowWorkspaceInstance {
  appKey: string;
  createdAt: string;
  id: string;
  /** Stable business number; optional only for cached legacy responses. */
  publicId?: string;
  lastOpenedAt: string;
  projectId: string;
  title: string;
  updatedAt: string;
}
