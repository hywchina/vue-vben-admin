import { requestClient } from '#/api/request';
export interface DesignModeApplications {
  designMode: 'cabin' | 'cmf' | 'component';
  applicationKeys: string[];
  defaultImageApplicationKey: string;
  revision: number;
}
export function getDesignModeApplicationsApi() {
  return requestClient.get<DesignModeApplications[]>('/design-modes');
}
export function saveDesignModeApplicationsApi(config: DesignModeApplications) {
  const { designMode, revision, ...values } = config;
  return requestClient.put<DesignModeApplications>(
    `/design-modes/${designMode}`,
    { ...values, expectedRevision: revision },
  );
}
