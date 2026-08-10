import type { PlatformApplication } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function getApplicationsApi() {
  return requestClient.get<PlatformApplication[]>('/applications');
}

export function setApplicationVisibilityApi(key: string, visible: boolean) {
  return requestClient.request<{
    key: string;
    updatedAt: string;
    visible: boolean;
  }>(`/applications/${key}/visibility`, {
    data: { visible },
    method: 'PATCH',
  });
}
