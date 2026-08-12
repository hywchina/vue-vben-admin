ALTER TABLE job_inputs
  ADD COLUMN IF NOT EXISTS annotation_asset_id uuid
    REFERENCES assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS job_inputs_annotation_asset_idx
  ON job_inputs (annotation_asset_id)
  WHERE annotation_asset_id IS NOT NULL;

COMMENT ON COLUMN job_inputs.annotation_asset_id IS
  'Optional user-visible annotated snapshot; asset_id remains the original workflow input consumed by the adapter.';
