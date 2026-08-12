CREATE TABLE IF NOT EXISTS project_user_pins (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_user_pins_user_time_idx
  ON project_user_pins (user_id, pinned_at DESC);

COMMENT ON TABLE project_user_pins IS
  '用户个人的项目置顶偏好，不改变其他成员的项目排序。';
