import type { WorkflowInputTransfer } from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export function createWorkflowInputTransferApi(input: {
  assetId: string;
  targetAppKey: string;
  targetAssetIndex: number;
  targetInstanceId: string;
}) {
  return requestClient.post<WorkflowInputTransfer>(
    '/workflow-transfers',
    input,
  );
}

export function getPendingWorkflowInputTransfersApi(
  projectId: string,
  targetAppKey: string,
  targetInstanceId: string,
) {
  return requestClient.get<WorkflowInputTransfer[]>('/workflow-transfers', {
    params: { projectId, targetAppKey, targetInstanceId },
  });
}

export function dismissWorkflowInputTransferApi(transferId: string) {
  return requestClient.delete<{ dismissed: boolean; id: string }>(
    `/workflow-transfers/${transferId}`,
  );
}
