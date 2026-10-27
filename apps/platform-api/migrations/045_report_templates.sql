CREATE TABLE report_templates (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id),
  name text NOT NULL,
  format text NOT NULL CHECK (format IN ('docx', 'pptx')),
  filename text NOT NULL,
  object_key text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL CHECK (size_bytes BETWEEN 1 AND 20971520),
  sha256 text,
  manifest jsonb,
  configuration jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'draft', 'ready')),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX report_templates_project_idx ON report_templates(project_id, created_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE report_generation_executions ADD COLUMN template_snapshot jsonb;
COMMENT ON COLUMN report_generation_executions.template_snapshot IS 'Immutable source object SHA and confirmed field bindings, retained when a template is updated or archived';
