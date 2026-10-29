-- System models are administrator-managed runtime data, never deployment inputs.
CREATE TABLE managed_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('unet','loras','vae','text_encoders','checkpoints','controlnet','upscale_models','clip_vision')),
  note text NOT NULL DEFAULT '',
  files jsonb NOT NULL CHECK (jsonb_typeof(files) = 'array'),
  total_bytes bigint NOT NULL CHECK (total_bytes > 0),
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','queued','verifying','ready','failed','cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error text,
  lease_until timestamptz,
  lease_owner uuid,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX managed_models_pending ON managed_models(status, created_at);
CREATE TABLE managed_model_parts (
  model_id uuid NOT NULL REFERENCES managed_models(id),
  file_index integer NOT NULL CHECK (file_index >= 0),
  part_index integer NOT NULL CHECK (part_index >= 0),
  size integer NOT NULL CHECK (size > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(model_id, file_index, part_index)
);
CREATE TABLE managed_model_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id uuid NOT NULL REFERENCES managed_models(id),
  capability_code text NOT NULL REFERENCES capabilities(code),
  base_version_id uuid NOT NULL REFERENCES workflow_versions(id),
  candidate_version_id uuid NOT NULL UNIQUE REFERENCES workflow_versions(id),
  replacements jsonb NOT NULL,
  published_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE managed_model_tests (
  update_id uuid NOT NULL REFERENCES managed_model_updates(id),
  job_id uuid NOT NULL UNIQUE REFERENCES jobs(id),
  PRIMARY KEY(update_id, job_id)
);
