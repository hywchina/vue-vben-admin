CREATE TABLE design_mode_applications (
  design_mode text PRIMARY KEY CHECK (design_mode IN ('cabin', 'component', 'cmf')),
  application_keys jsonb NOT NULL CHECK (jsonb_typeof(application_keys) = 'array'),
  default_image_application_key text NOT NULL REFERENCES applications(key),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE design_mode_applications IS '管理员维护各设计模块的功能顺序及图生图默认功能；不修改工作流版本';
INSERT INTO design_mode_applications (design_mode, application_keys, default_image_application_key) VALUES ('cabin', '["text-to-image", "region-marker-edit", "inpaint-single", "multi-image-edit", "single-image-edit", "image-upscale", "image-understanding", "camera-control-multi", "outpaint", "text-to-image-lora", "inpaint-reference", "region-edit", "camera-control-single"]'::jsonb, 'inpaint-single');
INSERT INTO design_mode_applications (design_mode, application_keys, default_image_application_key) VALUES ('component', '["text-to-image", "inpaint-single", "region-marker-edit", "multi-image-edit", "camera-control-multi", "multiview-to-3d", "image-upscale", "image-understanding", "outpaint", "text-to-image-lora", "single-image-edit", "inpaint-reference"]'::jsonb, 'inpaint-single');
INSERT INTO design_mode_applications (design_mode, application_keys, default_image_application_key) VALUES ('cmf', '["text-to-image", "inpaint-single", "multi-image-edit", "image-upscale", "image-understanding", "outpaint", "text-to-image-lora", "single-image-edit", "inpaint-reference", "image-edit-base", "image-edit-kv"]'::jsonb, 'inpaint-single');
