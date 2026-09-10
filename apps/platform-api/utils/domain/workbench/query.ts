import { z } from 'zod';

export const workbenchQuerySchema = z.object({
  section: z.enum(['designs', 'projects', 'tasks', 'results', 'saved']),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(6),
  activeOnly: z.enum(['false', 'true']).default('false'),
});

// Only these fixed SQL fragments may select a section; user input is bound separately.
export const workbenchSections = {
  designs: `SELECT c.id, c.title AS name, p.id AS "projectId", p.name AS "projectName",
    p."canWrite", c.updated_at AS "updatedAt", latest.status,
    latest.app_key AS "appKey", c.id AS "conversationId",
    (SELECT count(*)::int FROM jobs j WHERE j.design_conversation_id = c.id AND j.archived_at IS NULL) AS "roundCount",
    (SELECT a.id FROM jobs j JOIN job_outputs o ON o.job_id = j.id
      JOIN assets a ON a.id = o.asset_id AND a.deleted_at IS NULL AND a.status = 'available' AND a.kind = 'image'
      WHERE j.design_conversation_id = c.id AND j.archived_at IS NULL
      ORDER BY j.created_at DESC, o.position LIMIT 1) AS "previewAssetId"
    FROM design_conversations c JOIN visible_projects p ON p.id = c.project_id
    LEFT JOIN LATERAL (SELECT status, app_key FROM jobs j WHERE j.design_conversation_id = c.id
      AND j.archived_at IS NULL ORDER BY j.created_at DESC, j.id DESC LIMIT 1) latest ON true
    WHERE c.user_id = $1 AND c.archived_at IS NULL`,
  projects: `SELECT p.id, p.name, p.id AS "projectId", p.name AS "projectName", p."canWrite",
    p.updated_at AS "updatedAt",
    (SELECT count(*)::int FROM assets a WHERE a.project_id = p.id AND a.deleted_at IS NULL
      AND a.saved_at IS NOT NULL AND a.status = 'available') AS "assetCount"
    FROM visible_projects p`,
  tasks: `SELECT j.id, j.name, p.id AS "projectId", p.name AS "projectName", p."canWrite",
    j.created_at AS "updatedAt", j.status, j.progress, j.stage, j.error ->> 'message' AS "errorMessage",
    j.app_key AS "appKey", app.short_name AS "appName", j.design_conversation_id AS "conversationId"
    FROM jobs j JOIN visible_projects p ON p.id = j.project_id
    JOIN applications app ON app.key = j.app_key
    WHERE j.created_by = $1 AND j.archived_at IS NULL
      AND (NOT $3 OR j.status IN ('queued', 'running', 'cancelling'))`,
  results: `SELECT a.id, a.name, p.id AS "projectId", p.name AS "projectName", p."canWrite",
    a.created_at AS "updatedAt", a.kind AS type, v.mime_type AS "mimeType",
    v.original_filename AS filename, a.folder_id AS "folderId",
    a.saved_at IS NOT NULL AS saved, j.id AS "jobId", j.app_key AS "appKey",
    j.design_conversation_id AS "conversationId", a.generation_category AS "generationCategory",
    CASE WHEN a.kind = 'image' THEN a.id END AS "previewAssetId"
    FROM assets a JOIN visible_projects p ON p.id = a.project_id
    JOIN jobs j ON j.id = a.source_job_id AND j.project_id = p.id
    JOIN asset_versions v ON v.asset_id = a.id AND v.version = a.current_version
    WHERE j.created_by = $1 AND j.archived_at IS NULL AND a.source = 'workflow'
      AND a.deleted_at IS NULL AND a.status = 'available' AND v.status = 'available'`,
  saved: `SELECT a.id, a.name, p.id AS "projectId", p.name AS "projectName", p."canWrite",
    CASE WHEN a.source = 'upload' THEN COALESCE(v.completed_at, a.saved_at) ELSE a.saved_at END AS "updatedAt",
    a.kind AS type, v.mime_type AS "mimeType", v.original_filename AS filename,
    a.folder_id AS "folderId", a.generation_category AS "generationCategory", true AS saved,
    CASE WHEN a.kind = 'image' THEN a.id END AS "previewAssetId"
    FROM assets a JOIN visible_projects p ON p.id = a.project_id
    JOIN asset_versions v ON v.asset_id = a.id AND v.version = a.current_version
    WHERE a.deleted_at IS NULL AND a.saved_at IS NOT NULL AND a.status = 'available' AND v.status = 'available'`,
} as const;
