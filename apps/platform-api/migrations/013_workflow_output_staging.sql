ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS saved_at timestamptz;

UPDATE assets
SET saved_at = created_at
WHERE saved_at IS NULL;

ALTER TABLE assets
  ALTER COLUMN saved_at SET DEFAULT now();

COMMENT ON COLUMN assets.saved_at IS
  '工作流输出为空时表示仅作为任务暂存结果；用户确认后才进入资产中心。';

CREATE INDEX IF NOT EXISTS assets_project_saved_created_idx
  ON assets (project_id, created_at DESC)
  WHERE deleted_at IS NULL AND saved_at IS NOT NULL;
