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

export function getCapabilityApi(code: string, view?: 'workflow-parameters') {
  return requestClient.get<PlatformCapability>(`/capabilities/${code}`, {
    params: { view },
  });
}

export interface LoraSelection {
  targetId: string;
  name: string;
  sha256: string;
  baseFingerprint: string;
  strength: number;
}
export interface OptionalLora {
  enabled: boolean;
  selections: LoraSelection[];
}
export interface LoraCatalog {
  targets: Array<{
    base: string;
    baseFingerprint: string;
    family: string;
    id: string;
    label: string;
    options: Array<{ name: string; sha256: string }>;
    reason?: string;
    rejected: number;
  }>;
}
export function getWorkflowLorasApi(
  code: string,
  parameters: Record<string, unknown>,
  modelUpdateId?: string,
) {
  return requestClient.post<LoraCatalog>(
    `/capabilities/${encodeURIComponent(code)}/loras`,
    { parameters, modelUpdateId },
    { timeout: 180_000 },
  );
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
    defaultPrompt?: string;
    description: string;
    name: string;
    status?: 'disabled' | 'draft' | 'published';
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

export function saveCapabilityPresentationApi(
  code: string,
  input: {
    fieldLabels?: Record<string, string>;
    quickFieldKeys: string[];
    workflowVersionId: string;
  },
) {
  return requestClient.put(
    `/capabilities/${encodeURIComponent(code)}/presentation`,
    input,
  );
}

export function deleteWorkflowApi(workflowId: string) {
  return requestClient.delete<{ id: string }>(
    `/workflow-management/${workflowId}`,
  );
}
