CREATE TABLE IF NOT EXISTS design_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '新设计会话'
    CHECK (char_length(title) BETWEEN 1 AND 120),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS design_conversations_user_project_updated_idx
  ON design_conversations (user_id, project_id, updated_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON TABLE design_conversations IS
  '项目内的用户设计会话；同一会话可以按轮次调用多个应用。';

-- Preserve every historical application instance as one design conversation.
-- Reusing the UUID makes the migration deterministic and keeps old task ordering.
INSERT INTO design_conversations (
  id, user_id, project_id, title, created_at, updated_at
)
SELECT
  id, user_id, project_id, title, created_at, updated_at
FROM workflow_workspace_instances
ON CONFLICT (id) DO NOTHING;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS design_conversation_id uuid;

UPDATE jobs
SET design_conversation_id = workspace_instance_id
WHERE design_conversation_id IS NULL
  AND workspace_instance_id IS NOT NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_design_conversation_id_fkey
  FOREIGN KEY (design_conversation_id)
  REFERENCES design_conversations(id)
  ON DELETE RESTRICT;

ALTER TABLE jobs
  ALTER COLUMN workspace_instance_id DROP NOT NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_execution_context_check
  CHECK (
    design_conversation_id IS NOT NULL
    OR workspace_instance_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS jobs_design_conversation_created_idx
  ON jobs (design_conversation_id, created_at)
  WHERE design_conversation_id IS NOT NULL;

COMMENT ON COLUMN jobs.design_conversation_id IS
  '普通用户项目设计会话归属；一个会话可包含多个应用任务。';

CREATE TABLE IF NOT EXISTS design_conversation_drafts (
  conversation_id uuid NOT NULL
    REFERENCES design_conversations(id) ON DELETE CASCADE,
  app_key text NOT NULL REFERENCES applications(key) ON DELETE CASCADE,
  parameter_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_asset_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, app_key)
);

COMMENT ON TABLE design_conversation_drafts IS
  '设计会话内按应用保存的参数与输入草稿，切换应用和刷新后可恢复。';

INSERT INTO design_conversation_drafts (
  conversation_id,
  app_key,
  parameter_values,
  input_asset_ids,
  created_at,
  updated_at
)
SELECT
  workspace_instance_id,
  app_key,
  parameter_values,
  input_asset_ids,
  created_at,
  updated_at
FROM workflow_workspace_drafts
WHERE workspace_instance_id IS NOT NULL
ON CONFLICT (conversation_id, app_key) DO NOTHING;
