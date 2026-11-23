-- Preserve both existing workflow versions and all historical task/draft records.
-- New local-edit color and numbered operations share region-marker-edit.
UPDATE applications SET name = '区域标记', short_name = '区域标记', updated_at = now()
WHERE key = 'region-marker-edit';
UPDATE capabilities SET name = '区域标记', description = '使用颜色或编号标记需要修改的区域，编号可选', updated_at = now()
WHERE app_key = 'region-marker-edit';
UPDATE workflow_definitions SET name = 'Flux2 Klein 区域标记', updated_at = now()
WHERE code = 'flux2-klein-region-marker-edit' AND deleted_at IS NULL;
