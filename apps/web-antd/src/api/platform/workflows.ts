import type {
  PlatformCapability,
  WorkflowManagementResult,
  WorkflowOutputDefinition,
  WorkflowParameterDefinition,
} from '#/modules/platform/types';

import { requestClient } from '#/api/request';

export interface WorkflowVersionInput {
  apiJson: Record<string, unknown>;
  modelRequirements: string[];
  outputSchema: WorkflowOutputDefinition[];
  parameterSchema: WorkflowParameterDefinition[];
}

export function getCapabilityApi(code: string) {
  return requestClient.get<PlatformCapability>(`/capabilities/${code}`);
}

export function getWorkflowManagementApi() {
  return requestClient.get<WorkflowManagementResult>('/workflow-management');
}

export function createWorkflowApi(input: {
  code: string;
  description: string;
  name: string;
  publish: boolean;
  version: WorkflowVersionInput;
}) {
  return requestClient.post<{ id: string }>('/workflow-management', input);
}

export function updateWorkflowApi(
  workflowId: string,
  input: {
    description: string;
    name: string;
    status: 'disabled' | 'draft' | 'published';
  },
) {
  return requestClient.put<{ id: string }>(
    `/workflow-management/${workflowId}`,
    input,
  );
}

export function addWorkflowVersionApi(
  workflowId: string,
  input: WorkflowVersionInput,
) {
  return requestClient.post<{ id: string; version: number }>(
    `/workflow-management/${workflowId}/versions`,
    input,
  );
}

export function bindCapabilityWorkflowApi(
  capabilityCode: string,
  workflowVersionId: string,
) {
  return requestClient.put(`/capabilities/${capabilityCode}/workflow`, {
    workflowVersionId,
  });
}
