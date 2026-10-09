import { useDatabase } from '~/utils/database';

// Ordinary project assets remain reusable everywhere. Unsaved images are only
// reusable inside their originating, personally owned design conversation.
// Callers still require project access; the query independently checks scope.
export async function getDesignInputAssets(input: {
  assetIds: string[];
  conversationId?: string;
  projectId: string;
  userId: string;
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
        a.saved_at IS NOT NULL OR (
          a.kind = 'image' AND a.source = 'workflow'
          AND EXISTS (
            SELECT 1 FROM job_outputs o
            JOIN jobs j ON j.id = o.job_id
            JOIN design_conversations c ON c.id = j.design_conversation_id
            WHERE o.asset_id = a.id AND j.id = a.source_job_id
              AND j.project_id = a.project_id
              AND c.project_id = a.project_id
              AND c.id = ${input.conversationId ?? null}::uuid
              AND c.user_id = ${input.userId}
              AND j.created_by = ${input.userId}
              AND c.archived_at IS NULL
          )
        )
      )
  `;
}
