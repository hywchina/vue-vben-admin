import type { AssetType } from './assets';

export type WorkflowParameterType =
  | 'asset'
  | 'boolean'
  | 'capture'
  | 'mask'
  | 'number'
  | 'region'
  | 'select'
  | 'text'
  | 'textarea';

export interface CapabilityField {
  acceptedKinds: AssetType[];
  advanced: boolean;
  assetIndex?: number;
  defaultValue?: unknown;
  help?: string;
  integer: boolean;
  key: string;
  label: string;
  max?: number;
  maxLength?: number;
  min?: number;
  options: Array<{ label: string; value: number | string }>;
  placeholder?: string;
  required: boolean;
  step?: number;
  type: WorkflowParameterType;
}

export interface PlatformCapability {
  appKey: string;
  code: string;
  description: string;
  fields: CapabilityField[];
  name: string;
  outputTypes: AssetType[];
  provider: string;
  workflow: {
    code: string;
    name: string;
    version: number;
  };
}

export interface WorkflowParameterDefinition extends CapabilityField {
  inputName?: string;
  nodeId?: string;
  targets: Array<{
    inputName: string;
    nodeId: string;
    transport: 'data-url' | 'upload';
  }>;
}

export interface WorkflowOutputDefinition {
  field: string;
  kind: string;
  nodeId: string;
  role: 'auxiliary' | 'primary';
  tags: string[];
}

export interface WorkflowVersion {
  activeCapabilities: string[];
  apiJson: Record<string, unknown>;
  checksum: string;
  createdAt: string;
  id: string;
  modelRequirements: string[];
  outputSchema: WorkflowOutputDefinition[];
  parameterSchema: WorkflowParameterDefinition[];
  version: number;
}

export interface WorkflowDefinition {
  code: string;
  createdAt: string;
  description: string;
  id: string;
  name: string;
  provider: string;
  status: 'disabled' | 'draft' | 'published';
  updatedAt: string;
  versions: WorkflowVersion[];
}

export interface WorkflowManagementResult {
  capabilities: Array<{
    code: string;
    name: string;
    ready: boolean;
    status: string;
    workflowVersion: null | number;
  }>;
  worker: null | {
    instanceId: string;
    lastSeenAt: string;
    online: boolean;
    startedAt: string;
  };
  workflows: WorkflowDefinition[];
}
