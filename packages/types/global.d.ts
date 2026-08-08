import type { RouteMeta as IRouteMeta } from '@vben-core/typings';

import 'vue-router';

declare module 'vue-router' {
  // oxlint-disable-next-line typescript/no-empty-object-type
  interface RouteMeta extends IRouteMeta {}
}

export interface RailPlatformAppConfigRaw {
  VITE_GLOB_API_URL: string;
}

export interface ApplicationConfig {
  apiURL: string;
}

declare global {
  interface Window {
    _RAIL_PLATFORM_APP_CONF_: RailPlatformAppConfigRaw;
  }
}
