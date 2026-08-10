CREATE TABLE IF NOT EXISTS workflow_workspace_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  app_key text NOT NULL REFERENCES applications(key) ON DELETE CASCADE,
  parameter_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_asset_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id, app_key),
  CHECK (jsonb_typeof(parameter_values) = 'object'),
  CHECK (jsonb_typeof(input_asset_ids) = 'object')
);

CREATE INDEX IF NOT EXISTS workflow_workspace_drafts_lookup_idx
  ON workflow_workspace_drafts (user_id, project_id, updated_at DESC);

COMMENT ON TABLE workflow_workspace_drafts IS
  '按用户、项目和应用保存尚未提交或需要继续使用的工作区输入与参数草稿。';

COMMENT ON COLUMN workflow_workspace_drafts.input_asset_ids IS
  '以工作流资产输入位序号为键、已登记项目资产 UUID 为值的 JSON 对象。';
