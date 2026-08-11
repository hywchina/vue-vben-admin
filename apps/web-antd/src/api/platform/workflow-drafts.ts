import type { WorkflowWorkspaceDraft } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function getWorkflowWorkspaceDraftApi(
  projectId: string,
  appKey: string,
  workspaceInstanceId: string,
) {
  return requestClient.get<WorkflowWorkspaceDraft>('/workflow-drafts', {
    params: { appKey, projectId, workspaceInstanceId },
  });
}

export function saveWorkflowWorkspaceDraftApi(input: {
  appKey: string;
  inputAssetIds: Record<string, string>;
  parameterValues: Record<string, unknown>;
  projectId: string;
  workspaceInstanceId: string;
}) {
  return requestClient.put<WorkflowWorkspaceDraft>('/workflow-drafts', input);
}
