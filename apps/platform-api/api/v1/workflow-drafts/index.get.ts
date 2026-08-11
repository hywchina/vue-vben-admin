import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { workspaceDraftAssetSelection } from '~/utils/domain/workflows/drafts';
import { requireWorkflowWorkspaceInstance } from '~/utils/domain/workflows/instances';
import { getCapabilityByAppKey } from '~/utils/domain/workflows/repository';
import { hasAdministrativeRole, requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  appKey: z.string().trim().min(1).max(100),
  projectId: z.string().uuid(),
  workspaceInstanceId: z.string().uuid(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = parseQuery(event, querySchema);
  await requireProjectAccess(identity, input.projectId);
  const sql = useDatabase();
  await requireWorkflowWorkspaceInstance({
    appKey: input.appKey,
    instanceId: input.workspaceInstanceId,
    projectId: input.projectId,
    userId: identity.id,
  });
  const [application] = await sql<{ visible: boolean }[]>`
    SELECT visible FROM applications WHERE key = ${input.appKey}
  `;
  if (
    !application ||
    (!application.visible && !hasAdministrativeRole(identity))
  ) {
    throw new ApiError(404, 'WORKFLOW_NOT_READY', '工作流尚未就绪');
  }
  const capability = await getCapabilityByAppKey(input.appKey);
  if (!capability) {
    throw new ApiError(404, 'WORKFLOW_NOT_READY', '工作流尚未就绪');
  }
  const [draft] = await sql<
    {
      inputAssetIds: Record<string, string>;
      parameterValues: Record<string, unknown>;
      updatedAt: Date;
    }[]
  >`
    SELECT
      parameter_values AS "parameterValues",
      input_asset_ids AS "inputAssetIds",
      updated_at AS "updatedAt"
    FROM workflow_workspace_drafts
    WHERE user_id = ${identity.id}
      AND project_id = ${input.projectId}
      AND app_key = ${input.appKey}
      AND workspace_instance_id = ${input.workspaceInstanceId}
  `;
  if (!draft) {
    return { inputAssetIds: {}, parameterValues: {}, updatedAt: undefined };
  }
  const assetIds = Object.values(draft.inputAssetIds);
  const assets =
    assetIds.length === 0
      ? []
      : await sql<{ id: string; kind: string }[]>`
          SELECT id, kind
          FROM assets
          WHERE id IN ${sql(assetIds)}
            AND project_id = ${input.projectId}
            AND status = 'available'
            AND saved_at IS NOT NULL
            AND deleted_at IS NULL
        `;
  return {
    inputAssetIds: workspaceDraftAssetSelection(
      capability.parameterSchema,
      draft.inputAssetIds,
      assets,
      false,
    ),
    parameterValues: draft.parameterValues,
    updatedAt: draft.updatedAt.toISOString(),
  };
});
