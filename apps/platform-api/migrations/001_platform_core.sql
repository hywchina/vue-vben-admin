CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  password_hash text NOT NULL,
  real_name text NOT NULL,
  department text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled', 'disabled')),
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx
  ON users (lower(username));

CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  scope text NOT NULL DEFAULT 'owned',
  system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  module text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid REFERENCES refresh_sessions(id),
  created_ip inet,
  last_used_ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS refresh_sessions_user_idx
  ON refresh_sessions (user_id, expires_at DESC);

CREATE SEQUENCE IF NOT EXISTS project_code_seq START 1;

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'concept'
    CHECK (stage IN ('concept', 'design', 'delivery', 'archived')),
  owner_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_role text NOT NULL DEFAULT 'viewer'
    CHECK (project_role IN ('owner', 'editor', 'viewer')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_members_user_idx
  ON project_members (user_id, project_id);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  key text PRIMARY KEY,
  name text NOT NULL,
  short_name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN ('design', 'generation', 'report', 'training')),
  icon text NOT NULL,
  color text NOT NULL,
  provider text NOT NULL DEFAULT '待配置服务',
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('available', 'testing', 'planned')),
  accepted_asset_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  output_asset_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  adapter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  app_key text NOT NULL REFERENCES applications(key),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  stage text NOT NULL DEFAULT '等待外部能力适配器接收',
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_reference text,
  error jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_project_created_idx
  ON jobs (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL,
  source text NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'workflow')),
  source_app_key text REFERENCES applications(key),
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES users(id),
  current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'failed', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS assets_project_created_idx
  ON assets (project_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  storage_kind text NOT NULL CHECK (storage_kind IN ('inline', 'object')),
  object_key text,
  text_content text,
  original_filename text,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  sha256 char(64),
  storage_etag text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'available', 'failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (asset_id, version),
  CHECK (
    (storage_kind = 'object' AND object_key IS NOT NULL AND text_content IS NULL)
    OR (storage_kind = 'inline' AND object_key IS NULL AND text_content IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS asset_versions_object_key_uidx
  ON asset_versions (object_key)
  WHERE object_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  tag text NOT NULL,
  PRIMARY KEY (asset_id, tag)
);

CREATE TABLE IF NOT EXISTS asset_favorites (
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, user_id)
);

CREATE TABLE IF NOT EXISTS job_inputs (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id),
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, asset_id)
);

CREATE TABLE IF NOT EXISTS job_outputs (
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id),
  position integer NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, asset_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  module text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  result text NOT NULL DEFAULT 'success' CHECK (result IN ('success', 'failed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  request_id text NOT NULL,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_created_idx
  ON audit_events (created_at DESC);

INSERT INTO roles (code, name, description, scope, system)
VALUES
  ('admin', '管理员', '管理用户、角色、项目、资产、任务和审计。', 'all', true),
  ('user', '普通用户', '在本人参与的项目内使用设计、资产和任务功能。', 'project', true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  scope = EXCLUDED.scope,
  updated_at = now();

INSERT INTO permissions (code, name, module)
VALUES
  ('platform:project:read', '查看项目', 'project'),
  ('platform:project:write', '管理项目', 'project'),
  ('platform:asset:read', '查看资产', 'asset'),
  ('platform:asset:write', '管理资产', 'asset'),
  ('platform:job:read', '查看任务', 'job'),
  ('platform:job:write', '管理任务', 'job'),
  ('platform:user:read', '查看用户', 'identity'),
  ('platform:user:write', '管理用户', 'identity'),
  ('platform:role:read', '查看角色', 'identity'),
  ('platform:role:write', '管理角色', 'identity'),
  ('platform:audit:read', '查看审计', 'audit')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'user'
  AND p.code IN (
    'platform:project:read',
    'platform:project:write',
    'platform:asset:read',
    'platform:asset:write',
    'platform:job:read',
    'platform:job:write'
  )
ON CONFLICT DO NOTHING;

INSERT INTO applications (
  key, name, short_name, description, category, icon, color, provider, status,
  accepted_asset_types, output_asset_types
)
VALUES
  (
    'cabin-generator', '客室效果生成', '客室',
    '根据平面、参考图与设计约束生成客室整体效果方案。',
    'generation', 'lucide:train-front', '#b91c32', '待配置适配器', 'testing',
    '["image", "mask", "lora", "material"]', '["image"]'
  ),
  (
    'cmf-generator', 'CMF 方案生成', 'CMF',
    '形成可复用的色彩、材料与表面纹理组合。',
    'design', 'lucide:swatch-book', '#9b6b43', '待配置适配器', 'testing',
    '["image", "material"]', '["image", "material"]'
  ),
  (
    'part-generator', '零部件生成', '部件',
    '生成座椅、桌板、行李架等零部件多角度方案。',
    'generation', 'lucide:boxes', '#315b70', '待配置适配器', 'testing',
    '["image", "mask"]', '["image"]'
  ),
  (
    'lora-training', 'LoRA 训练', 'LoRA',
    '管理训练数据集、训练参数、模型版本与发布状态。',
    'training', 'lucide:brain-circuit', '#62558b', '待配置适配器', 'planned',
    '["image", "text"]', '["lora"]'
  ),
  (
    'model3d-generator', '2D 生 3D', '3D',
    '基于正视、侧视和俯视输入生成三维模型资产。',
    'generation', 'lucide:box', '#3f6b5a', '待配置适配器', 'planned',
    '["image"]', '["model3d"]'
  ),
  (
    'report-generator', '自动报告', '报告',
    '选取项目资产，生成结构化 Word 或 PPT 方案报告。',
    'report', 'lucide:file-chart-column', '#876d37', '待配置适配器', 'planned',
    '["image", "material", "model3d", "text"]', '["report"]'
  )
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  accepted_asset_types = EXCLUDED.accepted_asset_types,
  output_asset_types = EXCLUDED.output_asset_types,
  updated_at = now();
