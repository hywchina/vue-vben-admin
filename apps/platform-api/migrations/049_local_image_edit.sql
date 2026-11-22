INSERT INTO applications (
  key, name, short_name, description, category, icon, color, provider, status,
  accepted_asset_types, output_asset_types
) VALUES (
  'local-image-edit', '局部编辑', '局部编辑',
  '使用遮罩、颜色或编号指定需要重绘的区域', 'design', 'lucide:scan-line', '#546675',
  'ComfyUI', 'available', '["image"]', '["image"]'
)
ON CONFLICT (key) DO NOTHING;

UPDATE design_mode_applications d
SET application_keys = (
      SELECT jsonb_agg(mapped.key ORDER BY mapped.position)
      FROM (
        SELECT
          CASE WHEN entry.key IN ('inpaint-single', 'inpaint-reference', 'region-edit', 'region-marker-edit')
            THEN 'local-image-edit' ELSE entry.key END AS key,
          min(entry.position) AS position
        FROM jsonb_array_elements_text(d.application_keys)
          WITH ORDINALITY AS entry(key, position)
        GROUP BY 1
      ) AS mapped
    ),
    default_image_application_key = CASE
      WHEN d.default_image_application_key IN ('inpaint-single', 'inpaint-reference', 'region-edit', 'region-marker-edit')
        THEN 'local-image-edit' ELSE d.default_image_application_key END,
    revision = d.revision + 1,
    updated_at = now()
WHERE d.application_keys ?| ARRAY['inpaint-single', 'inpaint-reference', 'region-edit', 'region-marker-edit'];

-- Retain the most recent local-edit draft per design module. Keep its previous
-- record as well, so history and direct workflows remain independent.
WITH latest AS (
  SELECT DISTINCT ON (conversation_id, design_mode) *
  FROM design_conversation_drafts
  WHERE app_key IN ('inpaint-single', 'inpaint-reference', 'region-edit', 'region-marker-edit')
  ORDER BY conversation_id, design_mode, updated_at DESC, app_key
)
INSERT INTO design_conversation_drafts (
  conversation_id, app_key, design_mode, parameter_values, input_asset_ids, created_at, updated_at
)
SELECT d.conversation_id, 'local-image-edit', d.design_mode,
  jsonb_strip_nulls(jsonb_build_object(
    'prompt', d.parameter_values -> 'prompt',
    'localEdit', jsonb_build_object(
      'mode', CASE d.app_key WHEN 'region-edit' THEN 'color'
        WHEN 'region-marker-edit' THEN 'number' ELSE 'mask' END,
      'color', CASE WHEN d.app_key = 'region-edit' THEN d.parameter_values -> 'regionMarks' END,
      'number', CASE WHEN d.app_key = 'region-marker-edit' THEN d.parameter_values -> 'regionMarks' END
    )
  )),
  jsonb_strip_nulls(jsonb_build_object(
    '0', COALESCE(base.id::text, d.input_asset_ids ->> '0'),
    '1', CASE WHEN d.app_key = 'inpaint-reference' THEN d.input_asset_ids ->> '1' END,
    '2', CASE WHEN base.id IS NOT NULL THEN d.input_asset_ids ->> '0' END
  )),
  d.created_at, d.updated_at
FROM latest d
LEFT JOIN assets edited ON d.app_key IN ('inpaint-single', 'inpaint-reference')
  AND edited.id::text = d.input_asset_ids ->> '0'
LEFT JOIN asset_versions version ON version.asset_id = edited.id
  AND version.version = edited.current_version
LEFT JOIN assets base ON base.id::text = version.metadata ->> 'derivedFromAssetId'
  AND base.project_id = edited.project_id AND base.deleted_at IS NULL
  AND base.kind = 'image' AND base.status = 'available'
ON CONFLICT (conversation_id, app_key, design_mode) DO NOTHING;
