ALTER TABLE workflow_definitions
  ADD COLUMN default_prompt text CHECK (char_length(default_prompt) <= 10000);

COMMENT ON COLUMN workflow_definitions.default_prompt IS
  '管理员维护的主提示词预填内容；NULL 沿用既有预设，空字符串不预填，不改变工作流版本';
