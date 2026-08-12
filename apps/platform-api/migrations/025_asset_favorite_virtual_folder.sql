ALTER TABLE asset_folders
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'normal';

ALTER TABLE asset_folders
  DROP CONSTRAINT IF EXISTS asset_folders_kind_check;

ALTER TABLE asset_folders
  ADD CONSTRAINT asset_folders_kind_check
  CHECK (kind IN ('normal', 'favorites'));

UPDATE asset_folders
SET kind = 'favorites', updated_at = now()
WHERE parent_id IS NULL
  AND lower(name) = lower('收藏')
  AND deleted_at IS NULL;

UPDATE assets asset
SET folder_id = NULL, updated_at = now()
FROM asset_folders folder
WHERE asset.folder_id = folder.id
  AND folder.kind = 'favorites';

DROP INDEX IF EXISTS asset_folders_root_name_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS asset_folders_root_normal_name_uidx
  ON asset_folders (project_id, lower(name))
  WHERE parent_id IS NULL
    AND kind = 'normal'
    AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS asset_folders_project_favorites_uidx
  ON asset_folders (project_id)
  WHERE kind = 'favorites' AND deleted_at IS NULL;

COMMENT ON COLUMN asset_folders.kind IS
  'normal 为真实资产目录；favorites 为按当前用户 asset_favorites 关系展示的系统软链接目录。';
