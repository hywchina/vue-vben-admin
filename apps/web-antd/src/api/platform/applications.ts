import type { PlatformApplication } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function getApplicationsApi() {
  return requestClient.get<PlatformApplication[]>('/applications');
}
