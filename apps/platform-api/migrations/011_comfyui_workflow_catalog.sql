WITH catalog (
  key, name, short_name, description, category, icon, color,
  accepted_asset_types, output_asset_types
) AS (
  VALUES
    ('text-to-image-lora', 'LoRA 客室生成', 'LoRA', '使用客室内饰 LoRA 生成风格更稳定的空间效果图。', 'generation', 'lucide:badge-sparkles', '#a55231', '[]'::jsonb, '["image"]'::jsonb),
    ('single-image-edit', '单图设计编辑', '单图', '以一张客室图像为基础，按设计指令调整空间与部件。', 'design', 'lucide:scan-line', '#315f73', '["image"]'::jsonb, '["image"]'::jsonb),
    ('screen-capture-edit', '实时画面编辑', '捕获', '将屏幕画面捕获为项目资产并进入风格编辑。', 'design', 'lucide:monitor-up', '#42677a', '["image"]'::jsonb, '["image"]'::jsonb),
    ('multi-image-edit', '多图融合编辑', '多图', '组合两到三张参考图，融合空间、座椅与材质意图。', 'design', 'lucide:images', '#546675', '["image"]'::jsonb, '["image"]'::jsonb),
    ('inpaint-single', '单图局部重绘', '重绘', '在带透明遮罩的客室图像上精确替换指定区域。', 'design', 'lucide:paintbrush', '#a23d4f', '["image"]'::jsonb, '["image"]'::jsonb),
    ('inpaint-reference', '参考图局部重绘', '参考重绘', '在底图遮罩区域中引入另一张参考图。', 'design', 'lucide:blend', '#945464', '["image"]'::jsonb, '["image"]'::jsonb),
    ('outpaint', '智能扩图', '扩图', '向图像四周扩展画布，保持原有结构、光线与材质连续。', 'design', 'lucide:expand', '#80633d', '["image"]'::jsonb, '["image"]'::jsonb),
    ('region-edit', '分区设计编辑', '分区', '用颜色区域标记客室部件，一次替换多个分区。', 'design', 'lucide:square-dashed-mouse-pointer', '#9a573c', '["image"]'::jsonb, '["image"]'::jsonb),
    ('region-marker-edit', '编号分区编辑', '标记', '使用颜色和编号标记座椅、扶手、地板等部件。', 'design', 'lucide:tags', '#8b6332', '["image"]'::jsonb, '["image"]'::jsonb),
    ('multiview-to-3d', '多视图生三维', '3D', '从前、左、后、右四个视角的设计图生成 GLB 三维资产。', 'generation', 'lucide:box', '#39705a', '["image"]'::jsonb, '["model3d"]'::jsonb),
    ('image-understanding', '图片理解', '理解', '读取客室、部件或材质图像，生成详细文本描述。', 'generation', 'lucide:scan-search', '#477184', '["image"]'::jsonb, '["text"]'::jsonb),
    ('text-chat', '文本生成', '文本', '面向设计推理、方案说明与工程问题的持久文本任务。', 'generation', 'lucide:messages-square', '#5c6670', '[]'::jsonb, '["text"]'::jsonb),
    ('image-upscale', '图像放大修复', '放大', '修复小尺寸或低清客室图像，放大细节并登记新资产。', 'design', 'lucide:zoom-in', '#956a2f', '["image"]'::jsonb, '["image"]'::jsonb),
    ('camera-control-single', '单视角镜头控制', '单角度', '从单张设计图生成指定水平、俯仰和缩放的新镜头。', 'design', 'lucide:camera', '#2f6578', '["image"]'::jsonb, '["image"]'::jsonb),
    ('camera-control-multi', '多视角镜头生成', '多角度', '从单张设计图批量生成前、后、左、右与斜视角。', 'design', 'lucide:orbit', '#3d7182', '["image"]'::jsonb, '["image"]'::jsonb),
    ('image-edit-base', '双图基础编辑', '基础编辑', '使用基础编辑模型融合底图与参考图。', 'design', 'lucide:panels-top-left', '#516675', '["image"]'::jsonb, '["image"]'::jsonb),
    ('image-edit-kv', 'KV 双图编辑', 'KV', '使用 KV 缓存模型高效融合底图与参考图。', 'design', 'lucide:layers', '#587066', '["image"]'::jsonb, '["image"]'::jsonb)
)
INSERT INTO applications (
  key, name, short_name, description, category, icon, color, provider, status,
  accepted_asset_types, output_asset_types, adapter_config
)
SELECT
  key, name, short_name, description, category, icon, color, 'ComfyUI',
  'available', accepted_asset_types, output_asset_types,
  '{"enabled": true, "type": "comfyui"}'::jsonb
FROM catalog
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  short_name = EXCLUDED.short_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  provider = EXCLUDED.provider,
  status = EXCLUDED.status,
  accepted_asset_types = EXCLUDED.accepted_asset_types,
  output_asset_types = EXCLUDED.output_asset_types,
  adapter_config = EXCLUDED.adapter_config,
  updated_at = now();

INSERT INTO capabilities (code, app_key, name, description, category, status)
SELECT
  a.key,
  a.key,
  a.name,
  a.description,
  a.category,
  'published'
FROM applications a
WHERE a.key IN (
  'text-to-image-lora', 'single-image-edit', 'screen-capture-edit',
  'multi-image-edit', 'inpaint-single', 'inpaint-reference', 'outpaint',
  'region-edit', 'region-marker-edit', 'multiview-to-3d',
  'image-understanding', 'text-chat', 'image-upscale',
  'camera-control-single', 'camera-control-multi', 'image-edit-base',
  'image-edit-kv'
)
ON CONFLICT (code) DO UPDATE SET
  app_key = EXCLUDED.app_key,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  status = EXCLUDED.status,
  updated_at = now();
