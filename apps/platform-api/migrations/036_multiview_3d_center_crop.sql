-- Historical 3D jobs persist every advanced workflow parameter. Update their
-- CLIP crop values so "rerun" also uses the aspect-ratio-safe behavior.
UPDATE jobs
SET
  parameters = parameters || jsonb_build_object(
    'auto_n51_crop_4bef33a', 'center',
    'auto_n79_crop_e132b2c8', 'center',
    'auto_n81_crop_1fd4c7cd', 'center',
    'auto_n86_crop_f558da2a', 'center'
  ),
  updated_at = now()
WHERE app_key = 'multiview-to-3d';
