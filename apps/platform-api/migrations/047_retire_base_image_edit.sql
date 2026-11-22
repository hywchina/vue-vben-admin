UPDATE applications
SET visible = false, updated_at = now()
WHERE key = 'image-edit-base' AND visible;

UPDATE capabilities
SET status = 'disabled', updated_at = now()
WHERE app_key = 'image-edit-base' AND status <> 'disabled';

UPDATE applications
SET name = '双图参考编辑', short_name = '双图参考', updated_at = now()
WHERE key = 'image-edit-kv';

UPDATE capabilities
SET name = '双图参考编辑', updated_at = now()
WHERE app_key = 'image-edit-kv';

UPDATE workflow_definitions
SET name = '双图参考编辑', updated_at = now()
WHERE code = 'flux2-klein-image-edit-kv' AND deleted_at IS NULL;

UPDATE design_mode_applications
SET
  application_keys = CASE
    WHEN application_keys ? 'image-edit-kv' THEN application_keys - 'image-edit-base'
    ELSE (
      SELECT jsonb_agg(
        CASE WHEN key = 'image-edit-base' THEN 'image-edit-kv' ELSE key END
        ORDER BY position
      )
      FROM jsonb_array_elements_text(application_keys) WITH ORDINALITY AS entry(key, position)
    )
  END,
  default_image_application_key = CASE
    WHEN default_image_application_key = 'image-edit-base' THEN 'image-edit-kv'
    ELSE default_image_application_key
  END,
  revision = revision + 1,
  updated_at = now()
WHERE application_keys ? 'image-edit-base';
