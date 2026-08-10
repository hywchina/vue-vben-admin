ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN applications.visible IS
  '普通用户是否可在应用目录中发现并创建该应用的任务；管理员始终可管理全部应用。';

INSERT INTO permissions (code, name, module)
VALUES ('platform:application:write', '管理应用可见性', 'application')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles role
CROSS JOIN permissions permission
WHERE role.code = 'admin'
  AND permission.code = 'platform:application:write'
ON CONFLICT DO NOTHING;
