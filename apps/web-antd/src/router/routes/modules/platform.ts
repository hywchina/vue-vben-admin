import type { RouteRecordRaw } from 'vue-router';

import { platformSemanticIcons } from '#/modules/platform/semantic-icons';

const routes: RouteRecordRaw[] = [
  {
    component: () => import('#/views/platform/dashboard/index.vue'),
    meta: {
      affixTab: true,
      icon: platformSemanticIcons.home,
      order: -120,
      title: '首页',
    },
    name: 'PlatformDashboard',
    path: '/home',
  },
  {
    component: () => import('#/views/platform/design/index.vue'),
    meta: {
      hideInTab: true,
      icon: platformSemanticIcons.design,
      order: -110,
      title: '设计生成',
    },
    name: 'PlatformDesign',
    path: '/design',
  },
  {
    component: () => import('#/views/platform/model-training/index.vue'),
    meta: {
      icon: platformSemanticIcons.modelTraining,
      order: -100,
      title: '模型训练',
    },
    name: 'PlatformModelTraining',
    path: '/model-training',
  },
  {
    component: () => import('#/views/platform/report-generation/index.vue'),
    meta: {
      icon: platformSemanticIcons.report,
      order: -80,
      title: '报告生成',
    },
    name: 'PlatformReportGeneration',
    path: '/report-generation',
  },
  {
    component: () => import('#/views/platform/overview/index.vue'),
    meta: {
      affixTab: true,
      icon: platformSemanticIcons.workbench,
      order: -70,
      title: '设计工作台',
    },
    name: 'PlatformProjects',
    path: '/projects',
  },
  {
    meta: {
      hideInMenu: true,
      hideInTab: true,
      title: '设计工作台',
    },
    name: 'LegacyPlatformOverview',
    path: '/workspace/overview',
    redirect: '/projects',
  },
  {
    component: () => import('#/views/platform/workspace/index.vue'),
    meta: {
      authority: ['admin'],
      fullPathKey: true,
      hideInMenu: true,
      icon: platformSemanticIcons.workflow,
      title: '应用工作区',
    },
    name: 'ApplicationWorkspace',
    path: '/workspace/:appKey',
  },
  {
    component: () => import('#/views/platform/assets/index.vue'),
    meta: {
      icon: platformSemanticIcons.assets,
      order: -90,
      title: '资产中心',
    },
    name: 'PlatformAssets',
    path: '/assets',
  },
  {
    component: () => import('#/views/platform/jobs/index.vue'),
    meta: {
      hideInMenu: true,
      icon: platformSemanticIcons.jobs,
      order: -60,
      title: '任务中心',
    },
    name: 'PlatformJobs',
    path: '/jobs',
  },
  {
    meta: {
      authority: ['admin'],
      hideInMenu: true,
      icon: platformSemanticIcons.security,
      order: -50,
      title: '平台管理',
    },
    name: 'PlatformAdministration',
    path: '/administration',
    children: [
      {
        component: () => import('#/views/platform/access/index.vue'),
        meta: {
          icon: platformSemanticIcons.access,
          title: '用户与权限',
        },
        name: 'PlatformAccess',
        path: 'access',
      },
      {
        component: () =>
          import('#/views/platform/workflow-management/index.vue'),
        meta: {
          icon: platformSemanticIcons.workflow,
          title: '工作流管理',
        },
        name: 'PlatformWorkflowManagement',
        path: 'workflows',
      },
    ],
  },
  {
    component: () => import('#/views/platform/audit/index.vue'),
    meta: {
      hideInMenu: true,
      icon: platformSemanticIcons.audit,
      order: -40,
      title: '操作日志',
    },
    name: 'PlatformAudit',
    path: '/audit',
  },
  {
    component: () => import('#/views/_core/profile/index.vue'),
    meta: {
      hideInMenu: true,
      icon: platformSemanticIcons.profile,
      title: '个人中心',
    },
    name: 'Profile',
    path: '/profile',
  },
];

export default routes;
