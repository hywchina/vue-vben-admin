ALTER TABLE design_conversations
  ADD COLUMN IF NOT EXISTS title_manually_edited boolean NOT NULL DEFAULT false;

UPDATE design_conversations
SET title_manually_edited = true
WHERE title <> '新设计会话';

COMMENT ON COLUMN design_conversations.title_manually_edited IS
  'True after an explicit user rename; automatic first-text titles never overwrite it.';
