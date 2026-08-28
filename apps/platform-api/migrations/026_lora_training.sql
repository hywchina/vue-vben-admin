CREATE TABLE IF NOT EXISTS lora_training_executions (
  job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'submitting', 'queued', 'running', 'finalizing',
      'cancel_requested', 'succeeded', 'failed', 'cancelled'
    )),
  dataset_name text NOT NULL UNIQUE,
  external_job_id text,
  gpu_ids text NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_poll_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error jsonb,
  submitted_at timestamptz,
  last_polled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lora_training_executions_claim_idx
  ON lora_training_executions (next_poll_at, created_at)
  WHERE status IN (
    'pending', 'submitting', 'queued', 'running', 'finalizing',
    'cancel_requested'
  );

CREATE TABLE IF NOT EXISTS lora_artifact_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  external_path text NOT NULL,
  object_key text,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'failed')),
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, external_path)
);

UPDATE applications
SET
  name = 'LoRA 训练',
  short_name = 'LoRA',
  description = '使用项目图片与逐图 caption 训练项目专用 LoRA 模型。',
  provider = 'AI Toolkit',
  status = 'available',
  accepted_asset_types = '["image"]'::jsonb,
  output_asset_types = '["model"]'::jsonb,
  adapter_config = '{"enabled": true, "type": "ai-toolkit"}'::jsonb,
  updated_at = now()
WHERE key = 'lora-training';

COMMENT ON TABLE lora_training_executions IS
  '平台 LoRA 任务与内网 AI Toolkit GPU Worker 任务之间的持久化执行映射。';
COMMENT ON COLUMN lora_training_executions.dataset_name IS
  '平台按任务生成的受控数据集名称，不接受浏览器传入训练服务器路径。';
