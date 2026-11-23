-- Retire only the standalone entry. Immutable workflow versions, bindings,
-- queued jobs, outputs and draft snapshots remain available for history.
UPDATE applications
SET visible = false, updated_at = now()
WHERE key = 'text-to-image-lora' AND visible;

UPDATE capabilities
SET status = 'disabled', updated_at = now()
WHERE app_key = 'text-to-image-lora' AND status <> 'disabled';

UPDATE design_mode_applications d
SET application_keys = (
      SELECT jsonb_agg(mapped.key ORDER BY mapped.position)
      FROM (
        SELECT CASE WHEN entry.key = 'text-to-image-lora'
          THEN 'text-to-image' ELSE entry.key END AS key,
          min(entry.position) AS position
        FROM jsonb_array_elements_text(d.application_keys)
          WITH ORDINALITY AS entry(key, position)
        WHERE NOT (entry.key = 'text-to-image-lora' AND d.application_keys ? 'text-to-image')
        GROUP BY 1
      ) mapped
    ),
    default_image_application_key = CASE
      WHEN d.default_image_application_key = 'text-to-image-lora' THEN COALESCE((
        SELECT entry.key
        FROM jsonb_array_elements_text(d.application_keys)
          WITH ORDINALITY AS entry(key, position)
        WHERE entry.key NOT IN ('text-to-image', 'text-to-image-lora',
          'text-chat', 'screen-capture-edit', 'image-edit-base', 'region-edit')
        ORDER BY entry.position LIMIT 1
      ), d.default_image_application_key)
      ELSE d.default_image_application_key END,
    revision = d.revision + 1,
    updated_at = now()
WHERE d.application_keys ? 'text-to-image-lora'
  OR d.default_image_application_key = 'text-to-image-lora' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(d.application_keys) AS entry(key)
    WHERE entry.key NOT IN ('text-to-image', 'text-to-image-lora',
      'text-chat', 'screen-capture-edit', 'image-edit-base', 'region-edit')
  );
