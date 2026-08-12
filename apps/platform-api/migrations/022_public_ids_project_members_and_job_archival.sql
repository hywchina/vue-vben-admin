CREATE SEQUENCE IF NOT EXISTS user_public_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS asset_public_id_seq START 1;
CREATE SEQUENCE IF NOT EXISTS job_public_id_seq START 1;

ALTER TABLE users ADD COLUMN IF NOT EXISTS public_id text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS public_id text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS public_id text;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS number
  FROM users
  WHERE public_id IS NULL
)
UPDATE users target
SET public_id = 'USR-' || lpad(numbered.number::text, 6, '0')
FROM numbered
WHERE target.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS number
  FROM assets
  WHERE public_id IS NULL
)
UPDATE assets target
SET public_id = 'AST-' || lpad(numbered.number::text, 8, '0')
FROM numbered
WHERE target.id = numbered.id;

WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS number
  FROM jobs
  WHERE public_id IS NULL
)
UPDATE jobs target
SET public_id = 'TSK-' || lpad(numbered.number::text, 8, '0')
FROM numbered
WHERE target.id = numbered.id;

SELECT setval(
  'user_public_id_seq',
  GREATEST((SELECT count(*) FROM users), 1),
  EXISTS (SELECT 1 FROM users)
);
SELECT setval(
  'asset_public_id_seq',
  GREATEST((SELECT count(*) FROM assets), 1),
  EXISTS (SELECT 1 FROM assets)
);
SELECT setval(
  'job_public_id_seq',
  GREATEST((SELECT count(*) FROM jobs), 1),
  EXISTS (SELECT 1 FROM jobs)
);

ALTER TABLE users
  ALTER COLUMN public_id SET DEFAULT
    ('USR-' || lpad(nextval('user_public_id_seq')::text, 6, '0')),
  ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE assets
  ALTER COLUMN public_id SET DEFAULT
    ('AST-' || lpad(nextval('asset_public_id_seq')::text, 8, '0')),
  ALTER COLUMN public_id SET NOT NULL;
ALTER TABLE jobs
  ALTER COLUMN public_id SET DEFAULT
    ('TSK-' || lpad(nextval('job_public_id_seq')::text, 8, '0')),
  ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_uidx ON users (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS assets_public_id_uidx ON assets (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_public_id_uidx ON jobs (public_id);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id);

CREATE INDEX IF NOT EXISTS jobs_project_owner_created_idx
  ON jobs (project_id, created_by, created_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_project_owner_created_idx
  ON assets (project_id, owner_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN users.public_id IS
  '面向用户展示和项目成员邀请的稳定用户编号；内部关联继续使用 UUID。';
COMMENT ON COLUMN projects.code IS
  '面向用户展示的项目编号；内部关联继续使用 UUID。';
COMMENT ON COLUMN assets.public_id IS
  '面向用户展示和搜索的资产编号；内部关联继续使用 UUID。';
COMMENT ON COLUMN jobs.public_id IS
  '面向用户展示和搜索的任务编号；内部关联继续使用 UUID。';
COMMENT ON COLUMN jobs.archived_at IS
  '任务中心软删除时间；任务台账、输入输出血缘与审计记录不会物理删除。';
