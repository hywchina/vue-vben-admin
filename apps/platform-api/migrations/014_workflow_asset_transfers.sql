CREATE TABLE IF NOT EXISTS workflow_asset_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  target_app_key text NOT NULL REFERENCES applications(key) ON DELETE CASCADE,
  target_asset_index integer NOT NULL CHECK (
    target_asset_index >= 0 AND target_asset_index <= 99
  ),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'consumed', 'dismissed')),
  consumed_by_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS workflow_asset_transfers_pending_slot_uidx
  ON workflow_asset_transfers (
    project_id, target_app_key, target_asset_index, created_by
  )
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS workflow_asset_transfers_pending_lookup_idx
  ON workflow_asset_transfers (
    created_by, project_id, target_app_key, created_at DESC
  )
  WHERE status = 'pending';

COMMENT ON TABLE workflow_asset_transfers IS
  '用户主动把已登记项目资产发送到目标工作流输入位的持久化记录。';

COMMENT ON COLUMN workflow_asset_transfers.status IS
  'pending 在目标工作区持续回填；任务提交后 consumed；用户改选后 dismissed。';
