import {
  defineOverridesPreferences,
  definePreferencesExtension,
} from '@vben/preferences';

interface WebAntdPreferencesExtension {
  defaultTableSize: number;
  enableFormFullscreen: boolean;
  reportTitle: string;
  tenantMode: 'multi' | 'single';
}

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
    defaultAvatar: '/rail-logo.svg',
    defaultHomePath: '/workspace/overview',
    enableCheckUpdates: false,
    enablePreferences: true,
    locale: 'zh-CN',
    name: import.meta.env.VITE_APP_TITLE,
  },
  breadcrumb: {
    showHome: true,
  },
  copyright: {
    companyName: '轨道客室智能设计平台',
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
    logoMode: 'icon',
    showText: true,
    source: '/rail-logo.svg',
    sourceDark: '/rail-logo.svg',
  },
  sidebar: {
    width: 226,
  },
  theme: {
    colorDestructive: 'hsl(351 74% 42%)',
    colorPrimary: 'hsl(351 74% 42%)',
    colorSuccess: 'hsl(151 50% 32%)',
    colorWarning: 'hsl(35 74% 37%)',
    fontSize: 15,
    mode: 'light',
    radius: '0.5',
    semiDarkSidebar: true,
  },
  widget: {
    languageToggle: false,
    lockScreen: false,
    timezone: false,
  },
});

export const preferencesExtension =
  definePreferencesExtension<WebAntdPreferencesExtension>({
    tabLabel: 'preferences.antd.tabLabel',
    title: 'preferences.antd.title',
    fields: [
      {
        component: 'switch',
        defaultValue: true,
        key: 'enableFormFullscreen',
        label: 'preferences.antd.fields.enableFormFullscreen.label',
        tip: 'preferences.antd.fields.enableFormFullscreen.tip',
      },
      {
        component: 'select',
        defaultValue: 'single',
        key: 'tenantMode',
        label: 'preferences.antd.fields.tenantMode.label',
        options: [
          {
            label: 'preferences.antd.fields.tenantMode.options.single.label',
            value: 'single',
          },
          {
            label: 'preferences.antd.fields.tenantMode.options.multi.label',
            value: 'multi',
          },
        ],
      },
      {
        component: 'number',
        componentProps: {
          max: 200,
          min: 10,
          step: 10,
        },
        defaultValue: 20,
        key: 'defaultTableSize',
        label: 'preferences.antd.fields.defaultTableSize.label',
      },
      {
        component: 'input',
        defaultValue: '',
        key: 'reportTitle',
        label: 'preferences.antd.fields.reportTitle.label',
        placeholder: 'preferences.antd.fields.reportTitle.placeholder',
      },
    ],
  });
