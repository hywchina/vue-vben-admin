import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    component: () => import('#/views/platform/dashboard/index.vue'),
    meta: {
      affixTab: true,
      icon: 'lucide:layout-dashboard',
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
      icon: 'lucide:message-square-more',
      order: -110,
      title: '设计生成',
    },
    name: 'PlatformDesign',
    path: '/design',
  },
  {
    component: () => import('#/views/platform/overview/index.vue'),
    meta: {
      affixTab: true,
      icon: 'lucide:folder-kanban',
      order: -100,
      title: '项目空间',
    },
    name: 'PlatformProjects',
    path: '/projects',
  },
  {
    meta: {
      hideInMenu: true,
      hideInTab: true,
      title: '项目空间',
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
      icon: 'lucide:workflow',
      title: '应用工作区',
    },
    name: 'ApplicationWorkspace',
    path: '/workspace/:appKey',
  },
  {
    component: () => import('#/views/platform/assets/index.vue'),
    meta: {
      icon: 'lucide:library-big',
      order: -80,
      title: '资产中心',
    },
    name: 'PlatformAssets',
    path: '/assets',
  },
  {
    component: () => import('#/views/platform/jobs/index.vue'),
    meta: {
      icon: 'lucide:list-checks',
      order: -60,
      title: '任务中心',
    },
    name: 'PlatformJobs',
    path: '/jobs',
  },
  {
    meta: {
      authority: ['admin'],
      icon: 'lucide:shield-check',
      order: -50,
      title: '平台管理',
    },
    name: 'PlatformAdministration',
    path: '/administration',
    children: [
      {
        component: () => import('#/views/platform/access/index.vue'),
        meta: {
          icon: 'lucide:users-round',
          title: '用户与权限',
        },
        name: 'PlatformAccess',
        path: 'access',
      },
      {
        component: () =>
          import('#/views/platform/workflow-management/index.vue'),
        meta: {
          icon: 'lucide:workflow',
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
      icon: 'lucide:scroll-text',
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
      icon: 'lucide:user',
      title: '个人中心',
    },
    name: 'Profile',
    path: '/profile',
  },
];

export default routes;
