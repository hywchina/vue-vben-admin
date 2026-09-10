CREATE TABLE capability_parameter_presentations (
  capability_code text PRIMARY KEY REFERENCES capabilities(code) ON DELETE CASCADE,
  quick_field_keys jsonb NOT NULL CHECK (jsonb_typeof(quick_field_keys) = 'array'),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE capability_parameter_presentations IS '功能参数展示配置，不修改已发布工作流版本';
ALTER TABLE design_conversation_drafts
  ADD COLUMN design_mode text NOT NULL DEFAULT 'cabin'
  CHECK (design_mode IN ('cabin', 'cmf', 'component'));
ALTER TABLE design_conversation_drafts DROP CONSTRAINT design_conversation_drafts_pkey;
ALTER TABLE design_conversation_drafts ADD PRIMARY KEY (conversation_id, app_key, design_mode);
