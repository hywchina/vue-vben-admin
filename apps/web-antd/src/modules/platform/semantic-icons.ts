/**
 * 平台级业务语义图标。
 *
 * 同一业务含义必须复用这里的映射；文件类型图标仍由 asset-types.ts 维护。
 */
export const platformSemanticIcons = {
  access: 'lucide:users-round',
  applications: 'lucide:sparkles',
  assets: 'lucide:library-big',
  audit: 'lucide:scroll-text',
  conversations: 'lucide:messages-square',
  design: 'lucide:message-square-more',
  history: 'lucide:history',
  home: 'lucide:layout-dashboard',
  jobs: 'lucide:list-checks',
  modelTraining: 'lucide:graduation-cap',
  newDesign: 'lucide:wand-sparkles',
  profile: 'lucide:user',
  projects: 'lucide:folder-kanban',
  report: 'lucide:file-chart-column',
  runningJobs: 'lucide:circle-play',
  security: 'lucide:shield-check',
  workbench: 'lucide:panels-top-left',
  workflow: 'lucide:workflow',
} as const;
