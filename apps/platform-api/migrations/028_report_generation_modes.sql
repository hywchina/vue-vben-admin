ALTER TABLE report_generation_executions
ADD COLUMN IF NOT EXISTS generation_mode text NOT NULL DEFAULT 'template'
  CHECK (generation_mode IN ('template', 'ai'));

UPDATE applications
SET
  description = '使用平台模板或外部 AI 服务生成可编辑的 Word、PowerPoint 交付报告。',
  provider = 'Platform report adapters',
  adapter_config = '{"enabled": true, "type": "report-provider-router", "version": 2, "providers": ["template", "ai"]}'::jsonb,
  updated_at = now()
WHERE key = 'report-generator';

COMMENT ON COLUMN report_generation_executions.generation_mode IS
  '报告生成方式：template 使用内置 OOXML 模板，ai 使用受控外部报告服务。';
