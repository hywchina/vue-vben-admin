import type { AssetType } from './assets';

export interface DashboardProjectSummary {
  activeJobCount: number;
  assetCount: number;
  assetTypes: Array<{ count: number; type: AssetType }>;
  code: string;
  id: string;
  isPinned: boolean;
  jobCount: number;
  members: number;
  name: string;
  updatedAt: string;
}

export interface PlatformDashboard {
  assetTypes: Array<{ count: number; type: AssetType }>;
  currentProject: DashboardProjectSummary | null;
  flow: {
    applicationCount: number;
    assetCount: number;
    conversationCount: number;
    resultCount: number;
    runningJobCount: number;
  };
  jobStatuses: {
    cancelled: number;
    failed: number;
    queued: number;
    running: number;
    succeeded: number;
  };
  jobTrend: Array<{
    cancelled: number;
    day: string;
    failed: number;
    running: number;
    succeeded: number;
  }>;
  recentAssets: Array<{
    appName: null | string;
    createdAt: string;
    id: string;
    mimeType: string;
    name: string;
    projectCode: string;
    projectId: string;
    projectName: string;
    publicId: string;
    type: AssetType;
  }>;
  recentConversations: Array<{
    activeJobCount: number;
    id: string;
    lastAppKey: null | string;
    lastAppName: null | string;
    previewAssetId: null | string;
    projectCode: string;
    projectId: string;
    projectName: string;
    roundCount: number;
    title: string;
    updatedAt: string;
  }>;
  recentJobs: Array<{
    appName: string;
    createdAt: string;
    id: string;
    name: string;
    progress: number;
    projectCode: string;
    projectId: string;
    projectName: string;
    publicId: string;
    status: string;
  }>;
  recentProjects: DashboardProjectSummary[];
  summary: {
    activeJobCount: number;
    failedJobCount: number;
    projectCount: number;
    unreadNotificationCount: number;
  };
}
