import type {
  ApplicationConfig,
  RailPlatformAppConfigRaw,
} from '@vben/types/global';

/**
 * 由 vite-inject-app-config 注入的全局配置
 */
export function useAppConfig(
  env: Record<string, any>,
  isProduction: boolean,
): ApplicationConfig {
  // 生产环境下，直接使用 window._RAIL_PLATFORM_APP_CONF_ 全局变量
  const config = isProduction
    ? window._RAIL_PLATFORM_APP_CONF_
    : (env as RailPlatformAppConfigRaw);

  const { VITE_GLOB_API_URL } = config;

  const applicationConfig: ApplicationConfig = {
    apiURL: VITE_GLOB_API_URL,
  };

  return applicationConfig;
}
