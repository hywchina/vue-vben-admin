ALTER TABLE capability_parameter_presentations
  ADD COLUMN field_labels jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(field_labels) = 'object'),
  ADD COLUMN label_workflow_version_id uuid REFERENCES workflow_versions(id);
COMMENT ON COLUMN capability_parameter_presentations.field_labels IS
  '管理员参数展示名称；仅对 label_workflow_version_id 对应版本生效，不修改执行映射';
