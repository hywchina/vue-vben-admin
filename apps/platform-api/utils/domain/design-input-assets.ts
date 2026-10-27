import { useDatabase } from '~/utils/database';

// Public assets remain reusable everywhere. Private working images require an
// owned scope or an explicit reference authorized by the content access policy.
// Callers still require project access; the query independently checks scope.
export async function getDesignInputAssets(input: {
  assetIds: string[];
  conversationId?: string;
  projectId: string;
  userId: string;
  workspaceInstanceId?: string;
}) {
  if (input.assetIds.length === 0) return [];
  const sql = useDatabase();
  return await sql<
    { derivedFromAssetId: null | string; id: string; kind: string }[]
  >`
    SELECT a.id, a.kind,
      v.metadata ->> 'derivedFromAssetId' AS "derivedFromAssetId"
    FROM assets a
    JOIN asset_versions v ON v.asset_id = a.id
      AND v.version = a.current_version AND v.status = 'available'
    WHERE a.id IN ${sql(input.assetIds)}
      AND a.project_id = ${input.projectId}
      AND a.status = 'available' AND a.deleted_at IS NULL
      AND (
        a.saved_at IS NOT NULL OR (a.kind = 'image' AND EXISTS (
          SELECT 1 FROM design_input_assets d
          LEFT JOIN design_conversations c ON c.id = d.design_conversation_id
          LEFT JOIN workflow_workspace_instances w ON w.id = d.workspace_instance_id
          WHERE d.asset_id = a.id AND d.created_by = ${input.userId}
            AND (
              (c.id = ${input.conversationId ?? null}::uuid
                AND c.user_id = ${input.userId} AND c.project_id = a.project_id
                AND c.archived_at IS NULL)
              OR (w.id = ${input.workspaceInstanceId ?? null}::uuid
                AND w.user_id = ${input.userId} AND w.project_id = a.project_id)
            )
        )) OR (
          a.kind = 'image' AND a.source = 'workflow'
          AND EXISTS (
            SELECT 1 FROM job_outputs o
            JOIN jobs j ON j.id = o.job_id
            LEFT JOIN design_conversations c ON c.id = j.design_conversation_id
            LEFT JOIN workflow_workspace_instances w ON w.id = j.workspace_instance_id
            WHERE o.asset_id = a.id AND j.id = a.source_job_id
              AND j.project_id = a.project_id
              AND j.created_by = ${input.userId}
              AND (
                (c.project_id = a.project_id AND c.id = ${input.conversationId ?? null}::uuid
                  AND c.user_id = ${input.userId} AND c.archived_at IS NULL)
                OR (w.project_id = a.project_id AND w.id = ${input.workspaceInstanceId ?? null}::uuid
                  AND w.user_id = ${input.userId})
              )
          )
        )
      )
  `;
}
