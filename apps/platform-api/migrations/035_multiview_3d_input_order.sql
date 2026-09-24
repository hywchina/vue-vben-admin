-- Align the persisted four-view order with the product UI: front, back, left, right.
-- Existing jobs were created with front, left, back, right, so swap positions 1 and 2.
UPDATE job_inputs AS input
SET position = CASE input.position
  WHEN 1 THEN 2
  WHEN 2 THEN 1
END
FROM jobs AS job
WHERE input.job_id = job.id
  AND job.app_key = 'multiview-to-3d'
  AND input.position IN (1, 2);

UPDATE applications
SET
  description = '从前、后、左、右四个视角的设计图生成 GLB 三维资产。',
  updated_at = now()
WHERE key = 'multiview-to-3d';
