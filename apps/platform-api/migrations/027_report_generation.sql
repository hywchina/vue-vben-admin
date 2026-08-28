CREATE TABLE IF NOT EXISTS report_generation_executions (
  job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'running', 'cancel_requested',
      'succeeded', 'failed', 'cancelled'
    )),
  output_format text NOT NULL CHECK (output_format IN ('docx', 'pptx')),
  template_key text NOT NULL,
  output_asset_id uuid NOT NULL UNIQUE,
  object_key text NOT NULL UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_generation_executions_claim_idx
  ON report_generation_executions (next_attempt_at, created_at)
  WHERE status IN ('pending', 'running', 'cancel_requested');

UPDATE applications
SET
  name = '报告生成',
  short_name = '报告',
  description = '将当前项目文字与图片资产编排为可编辑的 Word 或 PowerPoint 交付报告。',
  provider = 'Builtin OOXML',
  status = 'available',
  accepted_asset_types = '["image"]'::jsonb,
  output_asset_types = '["document"]'::jsonb,
  adapter_config = '{"enabled": true, "type": "builtin-ooxml", "version": 1}'::jsonb,
  updated_at = now()
WHERE key = 'report-generator';

COMMENT ON TABLE report_generation_executions IS
  '报告生成任务的持久化执行、租约和确定性输出对象信息。';
COMMENT ON COLUMN report_generation_executions.output_asset_id IS
  '任务创建时预分配的项目文档资产 ID，确保 Worker 重试保持幂等。';
