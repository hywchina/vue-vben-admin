import type { WorkflowWorkspaceInstance } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function createWorkflowWorkspaceInstanceApi(input: {
  appKey: string;
  projectId: string;
  title?: string;
}) {
  return requestClient.post<WorkflowWorkspaceInstance>(
    '/workflow-instances',
    input,
  );
}

export function getWorkflowWorkspaceInstancesApi(
  projectId: string,
  appKey?: string,
) {
  return requestClient.get<WorkflowWorkspaceInstance[]>('/workflow-instances', {
    params: { appKey, projectId },
  });
}
