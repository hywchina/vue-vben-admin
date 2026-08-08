CREATE TABLE IF NOT EXISTS workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT 'comfyui'
    CHECK (provider IN ('comfyui')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'disabled')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  api_json jsonb NOT NULL,
  parameter_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  checksum char(64) NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version),
  UNIQUE (workflow_id, checksum)
);

CREATE TABLE IF NOT EXISTS capabilities (
  code text PRIMARY KEY,
  app_key text NOT NULL UNIQUE REFERENCES applications(key) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'generation',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS capability_workflows (
  capability_code text NOT NULL REFERENCES capabilities(code) ON DELETE CASCADE,
  workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (capability_code, workflow_version_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS capability_workflows_active_uidx
  ON capability_workflows (capability_code)
  WHERE active;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS workflow_version_id uuid
  REFERENCES workflow_versions(id) ON DELETE RESTRICT;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'queued', 'running', 'cancelling', 'succeeded', 'failed', 'cancelled'
  ));

CREATE TABLE IF NOT EXISTS job_executions (
  job_id uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'comfyui'
    CHECK (provider IN ('comfyui')),
  workflow_version_id uuid NOT NULL
    REFERENCES workflow_versions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'submitting', 'queued', 'running', 'finalizing',
      'cancel_requested', 'succeeded', 'failed', 'cancelled'
    )),
  external_job_id text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_poll_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error jsonb,
  submitted_at timestamptz,
  last_polled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_executions_claim_idx
  ON job_executions (next_poll_at, created_at)
  WHERE status IN (
    'pending', 'submitting', 'queued', 'running', 'finalizing', 'cancel_requested'
  );

CREATE TABLE IF NOT EXISTS job_output_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  external_output_key text NOT NULL,
  node_id text NOT NULL,
  filename text NOT NULL,
  subfolder text NOT NULL DEFAULT '',
  output_type text NOT NULL DEFAULT 'output',
  object_key text,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'failed')),
  error jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, external_output_key)
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  instance_id text PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

INSERT INTO permissions (code, name, module)
VALUES
  ('platform:workflow:read', '查看工作流配置', 'workflow'),
  ('platform:workflow:write', '管理工作流配置', 'workflow')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'admin'
  AND p.code IN ('platform:workflow:read', 'platform:workflow:write')
ON CONFLICT DO NOTHING;

INSERT INTO applications (
  key, name, short_name, description, category, icon, color, provider, status,
  accepted_asset_types, output_asset_types, adapter_config
)
VALUES (
  'text-to-image',
  '文生图',
  '文生图',
  '使用业务提示词生成客室设计、材质与视觉方案图片。',
  'generation',
  'lucide:image-plus',
  '#b91c32',
  'ComfyUI',
  'available',
  '[]'::jsonb,
  '["image"]'::jsonb,
  '{"enabled": true, "type": "comfyui"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  provider = EXCLUDED.provider,
  status = EXCLUDED.status,
  accepted_asset_types = EXCLUDED.accepted_asset_types,
  output_asset_types = EXCLUDED.output_asset_types,
  adapter_config = EXCLUDED.adapter_config,
  updated_at = now();

INSERT INTO capabilities (
  code, app_key, name, description, category, status
)
VALUES (
  'text-to-image',
  'text-to-image',
  '文生图',
  '将业务提示词和受控生成参数映射到已发布的 ComfyUI API 工作流。',
  'generation',
  'published'
)
ON CONFLICT (code) DO UPDATE SET
  app_key = EXCLUDED.app_key,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  updated_at = now();
