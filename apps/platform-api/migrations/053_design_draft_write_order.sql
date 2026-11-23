ALTER TABLE design_conversation_drafts
  ADD COLUMN revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN writer_id uuid,
  ADD COLUMN writer_sequence bigint NOT NULL DEFAULT 0 CHECK (writer_sequence >= 0);
