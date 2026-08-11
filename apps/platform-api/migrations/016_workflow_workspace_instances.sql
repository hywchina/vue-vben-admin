CREATE TABLE IF NOT EXISTS workflow_workspace_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  app_key text NOT NULL REFERENCES applications(key) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_workspace_instances_lookup_idx
  ON workflow_workspace_instances (
    user_id, project_id, app_key, last_opened_at DESC
  );

COMMENT ON TABLE workflow_workspace_instances IS
  '用户打开的持久化应用会话实例；每个实例独立保存草稿、多轮任务和待接收资产。';

INSERT INTO workflow_workspace_instances (
  user_id, project_id, app_key, title, created_at, updated_at, last_opened_at
)
SELECT
  source.user_id,
  source.project_id,
  source.app_key,
  application.short_name || ' · 历史会话',
  min(source.created_at),
  max(source.updated_at),
  max(source.updated_at)
FROM (
  SELECT
    created_by AS user_id,
    project_id,
    app_key,
    created_at,
    updated_at
  FROM jobs
  UNION ALL
  SELECT
    user_id,
    project_id,
    app_key,
    created_at,
    updated_at
  FROM workflow_workspace_drafts
  UNION ALL
  SELECT
    created_by AS user_id,
    project_id,
    target_app_key AS app_key,
    created_at,
    updated_at
  FROM workflow_asset_transfers
) source
JOIN applications application ON application.key = source.app_key
GROUP BY source.user_id, source.project_id, source.app_key, application.short_name;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS workspace_instance_id uuid;

UPDATE jobs job
SET workspace_instance_id = (
  SELECT instance.id
  FROM workflow_workspace_instances instance
  WHERE instance.user_id = job.created_by
    AND instance.project_id = job.project_id
    AND instance.app_key = job.app_key
  ORDER BY instance.created_at
  LIMIT 1
)
WHERE job.workspace_instance_id IS NULL;

ALTER TABLE jobs
  ALTER COLUMN workspace_instance_id SET NOT NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_workspace_instance_id_fkey
  FOREIGN KEY (workspace_instance_id)
  REFERENCES workflow_workspace_instances(id)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS jobs_workspace_instance_created_idx
  ON jobs (workspace_instance_id, created_at);

ALTER TABLE workflow_workspace_drafts
  ADD COLUMN IF NOT EXISTS workspace_instance_id uuid;

UPDATE workflow_workspace_drafts draft
SET workspace_instance_id = (
  SELECT instance.id
  FROM workflow_workspace_instances instance
  WHERE instance.user_id = draft.user_id
    AND instance.project_id = draft.project_id
    AND instance.app_key = draft.app_key
  ORDER BY instance.created_at
  LIMIT 1
)
WHERE draft.workspace_instance_id IS NULL;

ALTER TABLE workflow_workspace_drafts
  ALTER COLUMN workspace_instance_id SET NOT NULL;

ALTER TABLE workflow_workspace_drafts
  ADD CONSTRAINT workflow_workspace_drafts_instance_id_fkey
  FOREIGN KEY (workspace_instance_id)
  REFERENCES workflow_workspace_instances(id)
  ON DELETE CASCADE;

ALTER TABLE workflow_workspace_drafts
  DROP CONSTRAINT IF EXISTS workflow_workspace_drafts_user_id_project_id_app_key_key;

ALTER TABLE workflow_workspace_drafts
  ADD CONSTRAINT workflow_workspace_drafts_instance_id_key
  UNIQUE (workspace_instance_id);

ALTER TABLE workflow_asset_transfers
  ADD COLUMN IF NOT EXISTS target_instance_id uuid;

UPDATE workflow_asset_transfers transfer
SET target_instance_id = (
  SELECT instance.id
  FROM workflow_workspace_instances instance
  WHERE instance.user_id = transfer.created_by
    AND instance.project_id = transfer.project_id
    AND instance.app_key = transfer.target_app_key
  ORDER BY instance.created_at
  LIMIT 1
)
WHERE transfer.target_instance_id IS NULL;

ALTER TABLE workflow_asset_transfers
  ALTER COLUMN target_instance_id SET NOT NULL;

ALTER TABLE workflow_asset_transfers
  ADD CONSTRAINT workflow_asset_transfers_target_instance_id_fkey
  FOREIGN KEY (target_instance_id)
  REFERENCES workflow_workspace_instances(id)
  ON DELETE CASCADE;

DROP INDEX IF EXISTS workflow_asset_transfers_pending_slot_uidx;

CREATE UNIQUE INDEX workflow_asset_transfers_pending_instance_slot_uidx
  ON workflow_asset_transfers (target_instance_id, target_asset_index)
  WHERE status = 'pending';

CREATE INDEX workflow_asset_transfers_pending_instance_lookup_idx
  ON workflow_asset_transfers (created_by, target_instance_id, created_at DESC)
  WHERE status = 'pending';

COMMENT ON COLUMN jobs.workspace_instance_id IS
  '任务所属的应用会话实例；同一实例内按轮次展示并限制单一活动任务。';

COMMENT ON COLUMN workflow_asset_transfers.target_instance_id IS
  '资产要送达的具体目标应用实例，而不是整个应用。';
