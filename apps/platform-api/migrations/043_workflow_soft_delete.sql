ALTER TABLE workflow_definitions
  ADD COLUMN deleted_at timestamptz;

COMMENT ON COLUMN workflow_definitions.deleted_at IS
  '管理员逻辑删除时间；保留工作流版本、任务快照及历史血缘';
