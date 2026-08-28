ALTER TABLE report_generation_executions
DROP CONSTRAINT IF EXISTS report_generation_executions_output_format_check;

ALTER TABLE report_generation_executions
ADD CONSTRAINT report_generation_executions_output_format_check
CHECK (output_format IN ('docx', 'pptx', 'md'));

UPDATE applications
SET
  description = '使用平台模板或外部 AI 服务生成 Word、PowerPoint、Markdown 交付报告。',
  output_asset_types = '["document", "text"]'::jsonb,
  adapter_config = '{"enabled": true, "type": "report-provider-router", "version": 3, "providers": ["template", "ai"], "formats": ["docx", "pptx", "md"]}'::jsonb,
  updated_at = now()
WHERE key = 'report-generator';

COMMENT ON COLUMN report_generation_executions.output_format IS
  '报告交付格式：docx、pptx 或 md。';
