import { z } from 'zod';
import { useDatabase } from '~/utils/database';
import { requireIdentity } from '~/utils/identity';
import { requireProjectAccess } from '~/utils/project-access';
import { apiHandler } from '~/utils/response';
import { parseQuery } from '~/utils/validation';

const querySchema = z.object({
  projectId: z.string().uuid(),
  targetAppKey: z.string().trim().min(1).max(100),
});

export default apiHandler(async (event) => {
  const identity = await requireIdentity(event);
  const input = parseQuery(event, querySchema);
  await requireProjectAccess(identity, input.projectId);
  const sql = useDatabase();
  const transfers = await sql<
    {
      assetId: string;
      assetKind: string;
      assetName: string;
      createdAt: Date;
      id: string;
      projectId: string;
      sourceJobId: null | string;
      targetAppKey: string;
      targetAssetIndex: number;
    }[]
  >`
    SELECT
      transfer.id,
      transfer.project_id AS "projectId",
      transfer.asset_id AS "assetId",
      asset.name AS "assetName",
      asset.kind AS "assetKind",
      transfer.source_job_id AS "sourceJobId",
      transfer.target_app_key AS "targetAppKey",
      transfer.target_asset_index AS "targetAssetIndex",
      transfer.created_at AS "createdAt"
    FROM workflow_asset_transfers transfer
    JOIN assets asset
      ON asset.id = transfer.asset_id
      AND asset.status = 'available'
      AND asset.saved_at IS NOT NULL
      AND asset.deleted_at IS NULL
    WHERE transfer.created_by = ${identity.id}
      AND transfer.project_id = ${input.projectId}
      AND transfer.target_app_key = ${input.targetAppKey}
      AND transfer.status = 'pending'
    ORDER BY transfer.target_asset_index, transfer.created_at
  `;
  return transfers.map(({ createdAt, ...transfer }) => ({
    ...transfer,
    createdAt: createdAt.toISOString(),
    sourceJobId: transfer.sourceJobId ?? undefined,
  }));
});
