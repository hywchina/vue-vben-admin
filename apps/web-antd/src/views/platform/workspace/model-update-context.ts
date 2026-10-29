export function canonicalWorkspaceQuery(
  instanceId: string,
  query: Record<string, unknown>,
) {
  return {
    instanceId,
    ...(typeof query.modelUpdateId === 'string'
      ? { modelUpdateId: query.modelUpdateId }
      : {}),
  };
}
