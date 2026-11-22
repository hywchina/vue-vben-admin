INSERT INTO applications (
  key, name, short_name, description, category, icon, color, provider, status,
  accepted_asset_types, output_asset_types
) VALUES (
  'reference-image-edit', '参考图编辑', '参考图编辑',
  '使用一至三张图片按指令编辑设计', 'design', 'lucide:images', '#546675',
  'ComfyUI', 'available', '["image"]', '["image"]'
)
ON CONFLICT (key) DO NOTHING;

UPDATE design_mode_applications d
SET application_keys = (
      SELECT jsonb_agg(mapped.key ORDER BY mapped.position)
      FROM (
        SELECT
          CASE WHEN entry.key IN ('single-image-edit', 'image-edit-kv', 'multi-image-edit')
            THEN 'reference-image-edit' ELSE entry.key END AS key,
          min(entry.position) AS position
        FROM jsonb_array_elements_text(d.application_keys)
          WITH ORDINALITY AS entry(key, position)
        GROUP BY 1
      ) AS mapped
    ),
    default_image_application_key = CASE
      WHEN d.default_image_application_key IN ('single-image-edit', 'image-edit-kv', 'multi-image-edit')
        THEN 'reference-image-edit' ELSE d.default_image_application_key END,
    revision = d.revision + 1,
    updated_at = now()
WHERE d.application_keys ?| ARRAY['single-image-edit', 'image-edit-kv', 'multi-image-edit'];

INSERT INTO design_conversation_drafts (
  conversation_id, app_key, design_mode, parameter_values, input_asset_ids, created_at, updated_at
)
SELECT DISTINCT ON (conversation_id, design_mode)
  conversation_id, 'reference-image-edit', design_mode,
  jsonb_strip_nulls(jsonb_build_object('prompt', parameter_values -> 'prompt')),
  input_asset_ids, created_at, updated_at
FROM design_conversation_drafts
WHERE app_key IN ('single-image-edit', 'image-edit-kv', 'multi-image-edit')
ORDER BY conversation_id, design_mode, updated_at DESC, app_key
ON CONFLICT (conversation_id, app_key, design_mode) DO NOTHING;
