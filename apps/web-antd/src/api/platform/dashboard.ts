import type { PlatformDashboard } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function getDashboardApi() {
  return requestClient.get<PlatformDashboard>('/dashboard');
}
