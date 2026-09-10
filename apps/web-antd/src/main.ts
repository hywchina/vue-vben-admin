import { initPreferences, updatePreferences } from '@vben/preferences';
import { unmountGlobalLoading } from '@vben/utils';

import { overridesPreferences } from './preferences';

/**
 * 应用初始化完成之后再进行页面加载渲染
 */
async function initApplication() {
  // name用于指定项目唯一标识
  // 用于区分不同项目的偏好设置以及存储数据的key前缀以及其他一些需要隔离的数据
  const env = import.meta.env.PROD ? 'prod' : 'dev';
  const appVersion = import.meta.env.VITE_APP_VERSION;
  const namespace = `${import.meta.env.VITE_APP_NAMESPACE}-${appVersion}-${env}`;

  // app偏好设置初始化
  await initPreferences({
    namespace,
    overrides: overridesPreferences,
  });
  // 固定平台发布外壳，避免旧的本地偏好恢复黑色独立侧栏。
  updatePreferences({
    app: {
      enablePreferences: false,
      layout: 'header-sidebar-nav',
      name: import.meta.env.VITE_APP_TITLE,
    },
    breadcrumb: { enable: false },
    copyright: {
      companyName: '客运装备内装模块化分区快速设计平台',
    },
    logo: { enable: true, showText: true },
    navigation: { split: false },
    sidebar: { draggable: false, width: 184 },
    tabbar: { showMaximize: false, showMore: false, showRefresh: false },
    theme: {
      builtinType: 'pink',
      colorPrimary: 'hsl(347 77% 60%)',
      semiDarkSidebar: false,
      semiDarkSidebarSub: false,
    },
    widget: { fullscreen: false, fullscreenButtonPosition: 'none' },
  });

  // 启动应用并挂载
  // vue应用主要逻辑及视图
  const { bootstrap } = await import('./bootstrap');
  await bootstrap(namespace);

  // 移除并销毁loading
  unmountGlobalLoading();
}

initApplication();
