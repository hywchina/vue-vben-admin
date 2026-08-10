import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import {
  assertWorkspaceDraftParameterKeys,
  workspaceDraftAssetSelection,
} from '~/utils/domain/workflows/drafts';
import { getCapabilityByAppKey } from '~/utils/domain/workflows/repository';
import {
  hasAdministrativeRole,
  requireIdentity,
  requirePermission,
} from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { ApiError, apiHandler } from '~/utils/response';
import { parseBody } from '~/utils/validation';

const inputAssetIdsSchema = z
  .record(z.string(), z.string().uuid())
  .refine((value) => Object.keys(value).length <= 100, '输入位不能超过 100 个');

const parameterValuesSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length <= 200, '参数不能超过 200 个');

const updateDraftSchema = z.object({
  appKey: z.string().trim().min(1).max(100),
  inputAssetIds: inputAssetIdsSchema,
  parameterValues: parameterValuesSchema,
  projectId: z.string().uuid(),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  requirePermission(identity, 'platform:job:write');
  const input = await parseBody(event, updateDraftSchema);
  await requireProjectAccess(identity, input.projectId, 'write');
  const sql = useDatabase();
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
  try {
    assertWorkspaceDraftParameterKeys(
      capability.parameterSchema,
      input.parameterValues,
    );
  } catch (error) {
    throw new ApiError(
      400,
      'WORKFLOW_DRAFT_PARAMETER_INVALID',
      error instanceof Error ? error.message : '工作流草稿参数无效',
    );
  }

  const assetIds = Object.values(input.inputAssetIds);
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
  let inputAssetIds: Record<string, string>;
  try {
    inputAssetIds = workspaceDraftAssetSelection(
      capability.parameterSchema,
      input.inputAssetIds,
      assets,
    );
  } catch (error) {
    throw new ApiError(
      400,
      'WORKFLOW_DRAFT_ASSET_INVALID',
      error instanceof Error ? error.message : '工作流草稿资产无效',
    );
  }

  const [draft] = await sql<{ updatedAt: Date }[]>`
    INSERT INTO workflow_workspace_drafts (
      user_id, project_id, app_key, parameter_values, input_asset_ids
    ) VALUES (
      ${identity.id}, ${input.projectId}, ${input.appKey},
      ${sql.json(JSON.parse(JSON.stringify(input.parameterValues)))},
      ${sql.json(inputAssetIds)}
    )
    ON CONFLICT (user_id, project_id, app_key) DO UPDATE SET
      parameter_values = EXCLUDED.parameter_values,
      input_asset_ids = EXCLUDED.input_asset_ids,
      updated_at = now()
    RETURNING updated_at AS "updatedAt"
  `;
  return {
    inputAssetIds,
    parameterValues: input.parameterValues,
    updatedAt: draft?.updatedAt.toISOString(),
  };
});
