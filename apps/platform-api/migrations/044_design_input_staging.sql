-- Design inputs are durable, private working files until explicitly saved.
-- Existing assets and their saved_at values are deliberately left unchanged.
CREATE TABLE design_input_assets (
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  design_conversation_id uuid REFERENCES design_conversations(id) ON DELETE CASCADE,
  workspace_instance_id uuid REFERENCES workflow_workspace_instances(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_input_assets_scope CHECK (
    num_nonnulls(design_conversation_id, workspace_instance_id) = 1
  )
);

CREATE UNIQUE INDEX design_input_assets_conversation_unique
  ON design_input_assets (design_conversation_id, asset_id)
  WHERE design_conversation_id IS NOT NULL;
CREATE UNIQUE INDEX design_input_assets_workspace_unique
  ON design_input_assets (workspace_instance_id, asset_id)
  WHERE workspace_instance_id IS NOT NULL;
CREATE INDEX design_input_assets_asset_idx ON design_input_assets (asset_id);

COMMENT ON TABLE design_input_assets IS
  '会话与工作区的持久输入引用；不代表进入资产中心，不随草稿或任务归档删除。';
