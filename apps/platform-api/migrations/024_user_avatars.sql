ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_object_key text,
  ADD COLUMN IF NOT EXISTS avatar_mime_type text,
  ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS users_avatar_object_key_uidx
  ON users (avatar_object_key)
  WHERE avatar_object_key IS NOT NULL;

COMMENT ON COLUMN users.avatar_object_key IS
  '用户头像在私有对象存储中的键，不保存图片正文或外部地址。';
COMMENT ON COLUMN users.avatar_mime_type IS
  '用户头像的受支持 MIME 类型，仅允许 PNG、JPEG 或 WebP。';
COMMENT ON COLUMN users.avatar_updated_at IS
  '用户最后一次成功更新头像的时间。';
