ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS design_mode text;

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_design_mode_check;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_design_mode_check
  CHECK (
    design_mode IS NULL
    OR design_mode IN ('component', 'cmf', 'cabin', 'report')
  );

COMMENT ON COLUMN jobs.design_mode IS
  '设计会话提交任务时的业务模式；用于历史轮次恢复模式专属操作。';

CREATE TABLE IF NOT EXISTS design_prompt_template_catalogs (
  design_mode text PRIMARY KEY
    CHECK (design_mode IN ('component', 'cmf', 'cabin')),
  categories jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(categories) = 'array'),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE design_prompt_template_catalogs IS
  '按设计业务模式保存管理员可维护的提示词分类与选项目录。';

INSERT INTO design_prompt_template_catalogs (design_mode, categories)
VALUES (
  'cmf',
  '[
    {
      "id": "color",
      "name": "颜色",
      "options": [
        { "id": "color-red", "label": "红色", "value": "红色" },
        { "id": "color-blue", "label": "蓝色", "value": "蓝色" },
        { "id": "color-green", "label": "绿色", "value": "绿色" }
      ]
    },
    {
      "id": "material",
      "name": "材质",
      "options": [
        { "id": "material-fabric", "label": "布料", "value": "布料材质" },
        { "id": "material-leather", "label": "皮革", "value": "皮革材质" }
      ]
    },
    {
      "id": "pattern-type",
      "name": "纹样类型",
      "options": [
        { "id": "pattern-two-way", "label": "二方连续", "value": "二方连续纹样" },
        { "id": "pattern-four-way", "label": "四方连续", "value": "四方连续纹样" }
      ]
    },
    {
      "id": "pattern-form",
      "name": "图案形式",
      "options": [
        { "id": "form-geometric", "label": "几何图形", "value": "几何图形" },
        { "id": "form-organic", "label": "自然有机", "value": "自然有机图案" },
        { "id": "form-linear", "label": "线性构成", "value": "线性构成图案" }
      ]
    },
    {
      "id": "style",
      "name": "设计风格",
      "options": [
        { "id": "style-minimal", "label": "现代简约", "value": "现代简约风格" },
        { "id": "style-technology", "label": "科技感", "value": "科技感风格" },
        { "id": "style-oriental", "label": "东方美学", "value": "东方美学风格" }
      ]
    },
    {
      "id": "image-size",
      "name": "图像尺寸",
      "options": [
        { "id": "size-square", "label": "方形", "value": "方形构图，1024×1024" },
        { "id": "size-landscape", "label": "横向", "value": "横向构图，2048×1080" },
        { "id": "size-portrait", "label": "竖向", "value": "竖向构图，1080×2048" }
      ]
    }
  ]'::jsonb
)
ON CONFLICT (design_mode) DO NOTHING;
