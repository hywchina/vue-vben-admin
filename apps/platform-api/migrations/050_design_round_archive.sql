ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS design_round_archived_at timestamptz;

COMMENT ON COLUMN jobs.design_round_archived_at IS
  '设计会话轮次的删除时间；任务台账、素材与血缘继续保留。';
