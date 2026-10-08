-- Public business numbers only. UUID primary/foreign keys and provider IDs never change.
CREATE TABLE business_id_aliases (
  entity_type text NOT NULL,
  legacy_id text NOT NULL,
  entity_id uuid NOT NULL,
  PRIMARY KEY (entity_type, legacy_id)
);
CREATE INDEX business_id_aliases_entity_idx ON business_id_aliases(entity_type, entity_id);

CREATE FUNCTION format_business_id(prefix text, number bigint) RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
BEGIN
  IF prefix !~ '^[A-Z]{3}$' OR number < 1 THEN
    RAISE EXCEPTION 'Invalid business ID prefix or sequence';
  END IF;
  -- lpad(number, 8) alone truncates values beyond eight digits.
  RETURN prefix || '-' || lpad(number::text, GREATEST(8, length(number::text)), '0');
END;
$$;

-- Retain the actual historical strings rather than guessing aliases from padding.
INSERT INTO business_id_aliases SELECT 'USR', public_id, id FROM users;
INSERT INTO business_id_aliases SELECT 'PRJ', code, id FROM projects;

UPDATE users SET public_id = format_business_id('USR', substring(public_id FROM 5)::bigint);

CREATE FUNCTION protect_business_id() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN
    RAISE EXCEPTION 'Business ID is immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- Every entity owns a non-recycled PostgreSQL sequence; sequence gaps are intentional.
DO $$
DECLARE
  item record;
  high_water bigint;
  sequence_value bigint;
  sequence_called boolean;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('users', 'USR', 'user_public_id_seq'),
    ('projects', 'PRJ', 'project_code_seq'),
    ('design_conversations', 'DSC', 'design_conversation_public_id_seq'),
    ('ai_conversations', 'AIC', 'ai_conversation_public_id_seq'),
    ('jobs', 'TSK', 'job_public_id_seq'),
    ('assets', 'AST', 'asset_public_id_seq'),
    ('asset_versions', 'ASV', 'asset_version_public_id_seq'),
    ('asset_folders', 'FLD', 'asset_folder_public_id_seq'),
    ('workflow_definitions', 'WFL', 'workflow_definition_public_id_seq'),
    ('workflow_versions', 'WFV', 'workflow_version_public_id_seq'),
    ('workflow_workspace_instances', 'INS', 'workspace_instance_public_id_seq'),
    ('ai_messages', 'MSG', 'ai_message_public_id_seq'),
    ('ai_attachments', 'ATT', 'ai_attachment_public_id_seq'),
    ('notifications', 'NTF', 'notification_public_id_seq'),
    ('audit_events', 'AUD', 'audit_event_public_id_seq')
  ) AS registry(table_name, prefix, sequence_name)
  LOOP
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', item.sequence_name);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS public_id text', item.table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN public_id SET DEFAULT format_business_id(%L, nextval(%L))',
      item.table_name, item.prefix, item.sequence_name);

    EXECUTE format('SELECT last_value, is_called FROM %I', item.sequence_name)
      INTO sequence_value, sequence_called;
    EXECUTE format('SELECT COALESCE(max(substring(public_id FROM 5)::bigint), 0) FROM %I', item.table_name)
      INTO high_water;
    -- Do not move existing sequences backwards after deletion or aborted transactions.
    PERFORM setval(item.sequence_name::regclass, GREATEST(sequence_value, high_water, 1),
      sequence_called OR high_water >= sequence_value);
    -- Explicit ordering makes historical assignments reproducible on the same snapshot.
    EXECUTE format('UPDATE %I target SET public_id = numbered.public_id FROM
      (SELECT id, format_business_id(%L, nextval(%L)) AS public_id FROM
        (SELECT id FROM %I WHERE public_id IS NULL ORDER BY created_at, id) ordered) numbered
      WHERE target.id = numbered.id', item.table_name, item.prefix, item.sequence_name, item.table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN public_id SET NOT NULL', item.table_name);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I(public_id)',
      item.table_name || '_public_id_uidx', item.table_name);
    EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I CHECK (public_id ~ %L)',
      item.table_name, item.table_name || '_public_id_format', '^' || item.prefix || '-[0-9]{8,}$');
    EXECUTE format('CREATE TRIGGER immutable_business_id BEFORE UPDATE OF public_id ON %I
      FOR EACH ROW EXECUTE FUNCTION protect_business_id()', item.table_name);
  END LOOP;
END;
$$;

-- code remains a backwards-compatible API/SQL field containing the canonical PRJ ID.
UPDATE projects SET code = public_id;
CREATE FUNCTION sync_project_business_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'Project business code is immutable';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.code IS NOT NULL AND NEW.code <> NEW.public_id THEN
    INSERT INTO business_id_aliases(entity_type, legacy_id, entity_id)
      VALUES ('PRJ', NEW.code, NEW.id);
  END IF;
  NEW.code := NEW.public_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_business_code BEFORE INSERT OR UPDATE OF code ON projects
  FOR EACH ROW EXECUTE FUNCTION sync_project_business_code();
COMMENT ON TABLE business_id_aliases IS
  '旧业务编号永久兼容映射；不是授权表。解析后必须沿用资源的原权限校验。';
COMMENT ON COLUMN projects.code IS '兼容字段，与 public_id 相同；历史编号保存在 business_id_aliases。';
