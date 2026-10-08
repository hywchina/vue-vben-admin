-- Display/download metadata only; object keys, hashes, IDs and lineage remain unchanged.
LOCK TABLE assets, asset_versions, jobs, job_outputs IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE generated_asset_name_counters (
  context_id uuid NOT NULL,
  generated_on date NOT NULL,
  last_sequence integer NOT NULL CHECK (last_sequence > 0),
  PRIMARY KEY (context_id, generated_on)
);
COMMENT ON COLUMN generated_asset_name_counters.context_id IS
  'Design conversation UUID, or legacy/dedicated workspace UUID when there is no design conversation';

CREATE TABLE generated_asset_name_history (
  asset_id uuid PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
  context_id uuid NOT NULL,
  generated_on date NOT NULL,
  sequence integer NOT NULL CHECK (sequence > 0),
  previous_name text NOT NULL,
  previous_filenames jsonb NOT NULL,
  renamed_to text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Match actual task outputs, not uploaded originals or user-created copies.
WITH numbered AS (
  SELECT asset.id, asset.name,
    COALESCE(job.design_conversation_id, job.workspace_instance_id, job.id) AS context_id,
    (asset.created_at AT TIME ZONE 'Asia/Shanghai')::date AS generated_on,
    row_number() OVER (
      PARTITION BY COALESCE(job.design_conversation_id, job.workspace_instance_id, job.id),
        (asset.created_at AT TIME ZONE 'Asia/Shanghai')::date
      ORDER BY asset.created_at, job.created_at, output.position, asset.id
    )::integer AS sequence,
    COALESCE(substring(lower(version.original_filename) FROM '(\.[a-z0-9]{1,16})$'),
      CASE version.mime_type
        WHEN 'image/png' THEN '.png' WHEN 'image/jpeg' THEN '.jpg'
        WHEN 'image/webp' THEN '.webp' WHEN 'text/markdown' THEN '.md'
        WHEN 'text/plain' THEN '.txt' WHEN 'application/pdf' THEN '.pdf'
        ELSE '.bin' END) AS extension
  FROM assets asset
  JOIN jobs job ON job.id = asset.source_job_id
  JOIN job_outputs output ON output.job_id = job.id AND output.asset_id = asset.id
  JOIN asset_versions version ON version.asset_id = asset.id AND version.version = asset.current_version
  WHERE asset.source = 'workflow'
)
INSERT INTO generated_asset_name_history (
  asset_id, context_id, generated_on, sequence, previous_name, previous_filenames, renamed_to
)
SELECT numbered.id, context_id, generated_on, sequence, name,
  (SELECT jsonb_agg(jsonb_build_object('id', id, 'filename', original_filename) ORDER BY version)
   FROM asset_versions WHERE asset_id = numbered.id),
  context_id::text || '-' || to_char(generated_on, 'YYYYMMDD') || '-' ||
    lpad(sequence::text, greatest(3, length(sequence::text)), '0') || extension
FROM numbered;

UPDATE assets asset SET name = history.renamed_to
FROM generated_asset_name_history history WHERE asset.id = history.asset_id;

UPDATE asset_versions version SET original_filename =
  history.context_id::text || '-' || to_char(history.generated_on, 'YYYYMMDD') || '-' ||
  lpad(history.sequence::text, greatest(3, length(history.sequence::text)), '0') ||
  COALESCE(substring(lower(version.original_filename) FROM '(\.[a-z0-9]{1,16})$'),
    CASE version.mime_type
      WHEN 'image/png' THEN '.png' WHEN 'image/jpeg' THEN '.jpg'
      WHEN 'image/webp' THEN '.webp' WHEN 'text/markdown' THEN '.md'
      WHEN 'text/plain' THEN '.txt' WHEN 'application/pdf' THEN '.pdf'
      ELSE '.bin' END)
FROM generated_asset_name_history history WHERE version.asset_id = history.asset_id;

INSERT INTO generated_asset_name_counters (context_id, generated_on, last_sequence)
SELECT context_id, generated_on, max(sequence)
FROM generated_asset_name_history GROUP BY context_id, generated_on;
