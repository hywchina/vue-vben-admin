import { defineOverridesPreferences } from '@vben/preferences';

/**
 * @description 项目配置文件
 * 只需要覆盖项目中的一部分配置，不需要的配置不用覆盖，会自动使用默认配置
 * !!! 更改配置后请清空缓存，否则可能不生效
 */
export const overridesPreferences = defineOverridesPreferences({
  app: {
    accessMode: 'frontend',
    authPageLayout: 'panel-right',
    contentCompact: 'wide',
    defaultAvatar: '/rail-logo.svg?v=crrc',
    defaultHomePath: '/home',
    enableCheckUpdates: false,
    enablePreferences: false,
    layout: 'header-sidebar-nav',
    locale: 'zh-CN',
    name: '客运装备内装模块化分区快速设计平台',
  },
  breadcrumb: {
    enable: false,
    showHome: true,
  },
  copyright: {
    companyName: '客运装备内装模块化分区快速设计平台',
    companySiteLink: '',
    date: '2026',
    enable: false,
    icp: '',
    icpLink: '',
    settingShow: false,
  },
  header: {
    height: 54,
  },
  logo: {
    enable: true,
    logoMode: 'icon',
    showText: true,
    source: '/rail-logo.svg?v=crrc',
    sourceDark: '/rail-logo.svg?v=crrc',
  },
  navigation: {
    split: false,
  },
  sidebar: {
    draggable: false,
    width: 184,
  },
  tabbar: {
    showMaximize: false,
    showMore: false,
    showRefresh: false,
  },
  theme: {
    builtinType: 'pink',
    colorDestructive: 'hsl(351 74% 42%)',
    colorPrimary: 'hsl(347 77% 60%)',
    colorSuccess: 'hsl(151 50% 32%)',
    colorWarning: 'hsl(35 74% 37%)',
    fontSize: 15,
    mode: 'light',
    radius: '0.5',
    semiDarkSidebar: false,
    semiDarkSidebarSub: false,
  },
  widget: {
    fullscreen: false,
    fullscreenButtonPosition: 'none',
    languageToggle: false,
    lockScreen: false,
    timezone: false,
  },
});
