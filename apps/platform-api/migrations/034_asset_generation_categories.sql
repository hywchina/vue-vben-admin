-- Business classification is independent of the eight asset file kinds.
ALTER TABLE asset_folders ADD COLUMN generation_category text
  CHECK (generation_category IN ('cmf', 'component', 'cabin', 'report'));
ALTER TABLE assets ADD COLUMN generation_category text
  CHECK (generation_category IN ('cmf', 'component', 'cabin', 'report'));

UPDATE assets a SET generation_category = j.design_mode
FROM jobs j WHERE a.source_job_id = j.id AND j.design_mode IS NOT NULL;
UPDATE assets SET generation_category = 'report'
WHERE generation_category IS NULL AND source_app_key = 'report-generator';

DROP INDEX IF EXISTS asset_folders_root_normal_name_uidx;
CREATE UNIQUE INDEX asset_folders_root_normal_category_name_uidx
  ON asset_folders (project_id, COALESCE(generation_category, ''), lower(name))
  WHERE parent_id IS NULL AND kind = 'normal' AND deleted_at IS NULL;
CREATE INDEX assets_project_category_created_idx
  ON assets (project_id, generation_category, created_at DESC, id)
  WHERE deleted_at IS NULL AND saved_at IS NOT NULL;

-- Children inherit the namespace; clients cannot create a mixed-category tree.
CREATE FUNCTION inherit_asset_folder_category() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT generation_category INTO NEW.generation_category FROM asset_folders
    WHERE id = NEW.parent_id AND project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER asset_folder_category_inherit BEFORE INSERT OR UPDATE OF parent_id, generation_category
  ON asset_folders FOR EACH ROW EXECUTE FUNCTION inherit_asset_folder_category();

-- Covers upload, Worker output, saving a result and moving into a categorized folder.
-- Moving back to an uncategorized/root folder keeps the asset's existing classification.
CREATE FUNCTION assign_asset_generation_category() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE folder_category text; job_category text;
BEGIN
  IF NEW.folder_id IS NOT NULL THEN
    SELECT generation_category INTO folder_category FROM asset_folders
    WHERE id = NEW.folder_id AND project_id = NEW.project_id;
  END IF;
  IF NEW.source_job_id IS NOT NULL THEN
    SELECT design_mode INTO job_category FROM jobs
    WHERE id = NEW.source_job_id AND project_id = NEW.project_id;
  END IF;
  NEW.generation_category := COALESCE(folder_category, NEW.generation_category, job_category,
    CASE WHEN NEW.source_app_key = 'report-generator' THEN 'report' END);
  RETURN NEW;
END;
$$;
CREATE TRIGGER asset_generation_category_assign
  BEFORE INSERT OR UPDATE OF folder_id, source_job_id, generation_category
  ON assets FOR EACH ROW EXECUTE FUNCTION assign_asset_generation_category();

COMMENT ON COLUMN assets.generation_category IS
  '资产业务分类：目录归档、显式上传分类或来源任务模式；NULL 为未分类，不替代文件类型。';
COMMENT ON COLUMN asset_folders.generation_category IS
  '生成分类目录命名空间；子目录继承父级，NULL 为旧目录或未分类。';
