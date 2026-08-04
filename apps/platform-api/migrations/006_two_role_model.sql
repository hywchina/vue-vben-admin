INSERT INTO user_roles (user_id, role_id)
SELECT user_role.user_id, admin_role.id
FROM user_roles user_role
JOIN roles old_role
  ON old_role.id = user_role.role_id AND old_role.code = 'super'
CROSS JOIN roles admin_role
WHERE admin_role.code = 'admin'
ON CONFLICT DO NOTHING;

DELETE FROM roles WHERE code = 'super';

UPDATE roles
SET
  name = '管理员',
  description = '管理用户、角色、项目、资产、任务和审计。',
  scope = 'all',
  updated_at = now()
WHERE code = 'admin';

UPDATE roles
SET
  name = '普通用户',
  description = '在本人参与的项目内使用设计、资产和任务功能。',
  scope = 'project',
  updated_at = now()
WHERE code = 'user';

DELETE FROM user_roles user_role
USING roles role
WHERE user_role.role_id = role.id
  AND role.code = 'user'
  AND EXISTS (
    SELECT 1
    FROM user_roles admin_user_role
    JOIN roles admin_role ON admin_role.id = admin_user_role.role_id
    WHERE admin_user_role.user_id = user_role.user_id
      AND admin_role.code = 'admin'
  );

CREATE UNIQUE INDEX IF NOT EXISTS user_roles_single_role_uidx
  ON user_roles (user_id);

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_supported_code_check;
ALTER TABLE roles
  ADD CONSTRAINT roles_supported_code_check CHECK (code IN ('admin', 'user'));

DELETE FROM role_permissions role_permission
USING roles role
WHERE role_permission.role_id = role.id
  AND role.code IN ('admin', 'user');

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles role
CROSS JOIN permissions permission
WHERE role.code = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles role
CROSS JOIN permissions permission
WHERE role.code = 'user'
  AND permission.code IN (
    'platform:project:read',
    'platform:project:write',
    'platform:asset:read',
    'platform:asset:write',
    'platform:job:read',
    'platform:job:write'
  )
ON CONFLICT DO NOTHING;
