import { ApiError } from '../../http/response';
import { useDatabase } from '../../infrastructure/database';

/**
 * Project access is still required by the caller. Unsaved outputs are private
 * until their creator explicitly publishes them to the asset center.
 */
export async function requireAssetContentAccess(
  assetId: string,
  userId: string,
) {
  const sql = useDatabase();
  const [asset] = await sql<{ id: string }[]>`
    SELECT a.id FROM assets a
    WHERE a.id = ${assetId} AND a.deleted_at IS NULL
      AND (
        a.saved_at IS NOT NULL OR (
          a.source = 'workflow' AND EXISTS (
            SELECT 1 FROM job_outputs o
            JOIN jobs j ON j.id = o.job_id
            LEFT JOIN design_conversations c ON c.id = j.design_conversation_id
            LEFT JOIN workflow_workspace_instances w ON w.id = j.workspace_instance_id
            WHERE o.asset_id = a.id AND j.id = a.source_job_id
              AND j.project_id = a.project_id AND j.created_by = ${userId}
              AND (
                (c.user_id = ${userId} AND c.project_id = a.project_id)
                OR (w.user_id = ${userId} AND w.project_id = a.project_id)
              )
          )
        )
      )
  `;
  if (!asset) throw new ApiError(404, 'ASSET_NOT_FOUND', '资产不存在');
}
