export const CAPABILITY_ADAPTER_NOT_CONFIGURED =
  'ADAPTER_NOT_CONFIGURED' as const;

export type CapabilityExecutionStatus =
  | 'cancelled'
  | 'failed'
  | 'queued'
  | 'running'
  | 'succeeded';

export interface CapabilitySubmission {
  assetIds: string[];
  parameters: Record<string, unknown>;
  projectId: string;
}

export interface CapabilityExecutionSnapshot {
  errorCode?: string;
  externalJobId: string;
  progress: number;
  status: CapabilityExecutionStatus;
}

export interface CapabilityAdapter {
  cancel(externalJobId: string): Promise<void>;
  getStatus(externalJobId: string): Promise<CapabilityExecutionSnapshot>;
  submit(input: CapabilitySubmission): Promise<{ externalJobId: string }>;
}
