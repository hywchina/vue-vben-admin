ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS actor_username text,
  ADD COLUMN IF NOT EXISTS actor_real_name text,
  ADD COLUMN IF NOT EXISTS actor_roles text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS http_method text,
  ADD COLUMN IF NOT EXISTS request_path text,
  ADD COLUMN IF NOT EXISTS status_code integer,
  ADD COLUMN IF NOT EXISTS duration_ms integer,
  ADD COLUMN IF NOT EXISTS user_agent text;

UPDATE audit_events audit_event
SET
  actor_username = users.username,
  actor_real_name = users.real_name,
  actor_roles = COALESCE(
    (
      SELECT array_agg(roles.code ORDER BY roles.code)
      FROM user_roles
      JOIN roles ON roles.id = user_roles.role_id
      WHERE user_roles.user_id = users.id
    ),
    '{}'
  )
FROM users
WHERE audit_event.actor_id = users.id
  AND audit_event.actor_username IS NULL;

CREATE INDEX IF NOT EXISTS audit_events_actor_created_idx
  ON audit_events (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_module_created_idx
  ON audit_events (module, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_request_path_created_idx
  ON audit_events (request_path, created_at DESC)
  WHERE request_path IS NOT NULL;
