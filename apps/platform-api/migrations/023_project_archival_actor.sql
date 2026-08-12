ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id);

CREATE INDEX IF NOT EXISTS projects_archived_by_idx
  ON projects (archived_by, archived_at DESC)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN projects.archived_at IS
  '项目软删除时间；软删除后资产、任务、会话与审计数据继续保留。';
COMMENT ON COLUMN projects.archived_by IS
  '执行项目软删除的用户。';
