import type { PlatformApplication } from '#/modules/platform/types';

import { requestClient } from '#/api/request';
import { applicationSemanticIcon } from '#/modules/platform/capability-icons';

export async function getApplicationsApi() {
  const applications =
    await requestClient.get<PlatformApplication[]>('/applications');
  return applications.map((application) => ({
    ...application,
    icon: applicationSemanticIcon(application),
  }));
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
