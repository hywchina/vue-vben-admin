export interface WorkflowWorkspaceDraft {
  revision?: number;
  inputAssetIds: Record<string, string>;
  parameterValues: Record<string, unknown>;
  updatedAt?: string;
}
