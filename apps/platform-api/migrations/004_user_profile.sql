ALTER TABLE users
  ADD COLUMN IF NOT EXISTS introduction text NOT NULL DEFAULT '';

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb NOT NULL DEFAULT
    '{"accountMessage": true, "systemMessage": true, "todoTask": true}'::jsonb;
