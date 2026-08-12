CREATE TABLE IF NOT EXISTS asset_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES asset_folders(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS asset_folders_root_name_uidx
  ON asset_folders (project_id, lower(name))
  WHERE parent_id IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS asset_folders_child_name_uidx
  ON asset_folders (project_id, parent_id, lower(name))
  WHERE parent_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS asset_folders_project_parent_idx
  ON asset_folders (project_id, parent_id, created_at, id)
  WHERE deleted_at IS NULL;

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS folder_id uuid
    REFERENCES asset_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assets_project_folder_created_idx
  ON assets (project_id, folder_id, created_at DESC, id)
  WHERE deleted_at IS NULL AND saved_at IS NOT NULL;

COMMENT ON TABLE asset_folders IS
  '项目资产中心的持久化文件夹；删除采用递归软删除。';

COMMENT ON COLUMN assets.folder_id IS
  '资产中心中的当前文件夹；NULL 表示项目根目录。';
