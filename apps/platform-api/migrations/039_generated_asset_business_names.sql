-- Replace only automatically assigned UUID prefixes. Dates, ordinals, content,
-- counters, internal IDs and manually maintained names remain unchanged.
LOCK TABLE assets, asset_versions, jobs, job_outputs IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE generated_asset_business_name_history (
  asset_id uuid PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  previous_name text NOT NULL,
  renamed_to text NOT NULL,
  previous_filenames jsonb NOT NULL,
  renamed_filenames jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE generated_asset_business_name_history IS
  '039 名称升级快照；保留 037 原始快照，仅替换真实任务输出的自动 UUID 前缀。';

WITH contexts AS (
  SELECT asset.id, asset.name,
    COALESCE(job.design_conversation_id, job.workspace_instance_id, job.id) AS context_id,
    CASE
      WHEN job.design_conversation_id IS NOT NULL THEN conversation.public_id
      WHEN job.workspace_instance_id IS NOT NULL THEN instance.public_id
      ELSE job.public_id
    END AS context_public_id
  FROM assets asset
  JOIN jobs job ON job.id = asset.source_job_id
  LEFT JOIN design_conversations conversation ON conversation.id = job.design_conversation_id
  LEFT JOIN workflow_workspace_instances instance ON instance.id = job.workspace_instance_id
  WHERE asset.source = 'workflow'
    AND EXISTS (SELECT 1 FROM job_outputs output
      WHERE output.job_id = job.id AND output.asset_id = asset.id)
), candidates AS (
  SELECT contexts.*,
    '^' || context_id::text || '-[0-9]{8}-[0-9]{3,}\.[a-zA-Z0-9]{1,16}$' AS name_pattern
  FROM contexts
), replacements AS (
  SELECT candidates.id, candidates.name AS previous_name,
    CASE WHEN candidates.name ~* name_pattern
      THEN context_public_id || substring(candidates.name FROM 37)
      ELSE candidates.name END AS renamed_to,
    (SELECT jsonb_agg(jsonb_build_object('id', version.id, 'filename', version.original_filename) ORDER BY version.version)
      FROM asset_versions version WHERE version.asset_id = candidates.id) AS previous_filenames,
    (SELECT jsonb_agg(jsonb_build_object('id', version.id, 'filename',
      CASE WHEN version.original_filename ~* name_pattern
        THEN context_public_id || substring(version.original_filename FROM 37)
        ELSE version.original_filename END) ORDER BY version.version)
      FROM asset_versions version WHERE version.asset_id = candidates.id) AS renamed_filenames
  FROM candidates
)
INSERT INTO generated_asset_business_name_history (
  asset_id, previous_name, renamed_to, previous_filenames, renamed_filenames
)
SELECT id, previous_name, renamed_to, previous_filenames, renamed_filenames
FROM replacements
WHERE previous_name IS DISTINCT FROM renamed_to
  OR previous_filenames IS DISTINCT FROM renamed_filenames;

UPDATE assets asset SET name = history.renamed_to
FROM generated_asset_business_name_history history
WHERE asset.id = history.asset_id AND asset.name IS DISTINCT FROM history.renamed_to;

UPDATE asset_versions version SET original_filename = replacement.item->>'filename'
FROM generated_asset_business_name_history history,
  LATERAL jsonb_array_elements(history.renamed_filenames) AS replacement(item)
WHERE version.id = (replacement.item->>'id')::uuid
  AND version.original_filename IS DISTINCT FROM replacement.item->>'filename';
