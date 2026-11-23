-- Keep administrator visibility/order and historical drafts/tasks unchanged.
-- Repair only the old text-only LoRA entry used as an image-category default.
WITH replacements AS (
  SELECT d.design_mode, (
    SELECT item.key
    FROM jsonb_array_elements_text(d.application_keys) WITH ORDINALITY AS item(key, position)
    WHERE item.key NOT IN (
      'text-to-image', 'text-to-image-lora', 'text-chat',
      'screen-capture-edit', 'image-edit-base', 'region-edit'
    )
    ORDER BY item.position
    LIMIT 1
  ) AS image_key
  FROM design_mode_applications d
  WHERE d.default_image_application_key = 'text-to-image-lora'
)
UPDATE design_mode_applications d
SET default_image_application_key = r.image_key,
    revision = d.revision + 1,
    updated_at = now()
FROM replacements r
WHERE d.design_mode = r.design_mode AND r.image_key IS NOT NULL;
