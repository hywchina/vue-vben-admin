export interface WorkflowWorkspaceDraft {
  inputAssetIds: Record<string, string>;
  parameterValues: Record<string, unknown>;
  updatedAt?: string;
}
