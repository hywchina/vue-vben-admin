-- Asset kinds describe file shape only. Business meaning remains in tags,
-- application contracts and lineage instead of competing with MIME categories.

INSERT INTO asset_tags (asset_id, tag)
SELECT id, '遮罩' FROM assets WHERE kind = 'mask'
ON CONFLICT DO NOTHING;

INSERT INTO asset_tags (asset_id, tag)
SELECT id, 'CMF 材质' FROM assets WHERE kind = 'material'
ON CONFLICT DO NOTHING;

INSERT INTO asset_tags (asset_id, tag)
SELECT id, 'LoRA' FROM assets WHERE kind = 'lora'
ON CONFLICT DO NOTHING;

INSERT INTO asset_tags (asset_id, tag)
SELECT id, '报告' FROM assets WHERE kind = 'report'
ON CONFLICT DO NOTHING;

UPDATE assets AS asset
SET
  kind = CASE asset.kind
    WHEN 'mask' THEN 'image'
    WHEN 'material' THEN CASE
      WHEN EXISTS (
        SELECT 1
        FROM asset_versions AS version
        WHERE version.asset_id = asset.id
          AND version.version = asset.current_version
          AND (
            version.mime_type IN (
              'application/gzip',
              'application/vnd.rar',
              'application/x-7z-compressed',
              'application/x-rar-compressed',
              'application/x-tar',
              'application/x-zip-compressed',
              'application/zip'
            )
            OR lower(version.original_filename) ~ '\.(7z|gz|rar|tar|tgz|zip)$'
          )
      ) THEN 'archive'
      ELSE 'image'
    END
    WHEN 'lora' THEN 'model'
    WHEN 'report' THEN 'document'
    ELSE asset.kind
  END,
  updated_at = now()
WHERE asset.kind IN ('lora', 'mask', 'material', 'report');

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_kind_check;
ALTER TABLE assets
  ADD CONSTRAINT assets_kind_check
  CHECK (kind IN (
    'archive', 'audio', 'document', 'image', 'model', 'model3d', 'text', 'video'
  ));

UPDATE applications
SET
  accepted_asset_types = '["image", "model"]'::jsonb,
  output_asset_types = '["image"]'::jsonb,
  updated_at = now()
WHERE key = 'cabin-generator';

UPDATE applications
SET
  accepted_asset_types = '["archive", "image"]'::jsonb,
  output_asset_types = '["archive", "image"]'::jsonb,
  updated_at = now()
WHERE key = 'cmf-generator';

UPDATE applications
SET
  accepted_asset_types = '["image"]'::jsonb,
  output_asset_types = '["image"]'::jsonb,
  updated_at = now()
WHERE key = 'part-generator';

UPDATE applications
SET
  accepted_asset_types = '["image", "text"]'::jsonb,
  output_asset_types = '["model"]'::jsonb,
  updated_at = now()
WHERE key = 'lora-training';

UPDATE applications
SET
  accepted_asset_types = '["image"]'::jsonb,
  output_asset_types = '["model3d"]'::jsonb,
  updated_at = now()
WHERE key = 'model3d-generator';

UPDATE applications
SET
  accepted_asset_types = '["archive", "image", "model3d", "text"]'::jsonb,
  output_asset_types = '["document"]'::jsonb,
  updated_at = now()
WHERE key = 'report-generator';
