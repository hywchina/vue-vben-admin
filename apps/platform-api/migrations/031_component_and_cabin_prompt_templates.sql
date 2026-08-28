INSERT INTO design_prompt_template_catalogs (design_mode, categories)
VALUES
  (
    'component',
    '[
      {
        "id": "component-type",
        "name": "部件类型",
        "options": [
          { "id": "component-seat", "label": "座椅", "value": "轨道客室座椅" },
          { "id": "component-table", "label": "桌板", "value": "客室折叠桌板" },
          { "id": "component-rack", "label": "行李架", "value": "客室行李架" },
          { "id": "component-partition", "label": "隔断", "value": "客室模块化隔断" }
        ]
      },
      {
        "id": "view-angle",
        "name": "观察角度",
        "options": [
          { "id": "view-front", "label": "正视图", "value": "正面视角" },
          { "id": "view-side", "label": "侧视图", "value": "侧面视角" },
          { "id": "view-three-quarter", "label": "四分之三视角", "value": "四分之三透视视角" },
          { "id": "view-top", "label": "俯视图", "value": "俯视视角" }
        ]
      },
      {
        "id": "color",
        "name": "颜色",
        "options": [
          { "id": "color-red", "label": "红色", "value": "红色" },
          { "id": "color-blue", "label": "蓝色", "value": "蓝色" },
          { "id": "color-green", "label": "绿色", "value": "绿色" },
          { "id": "color-neutral", "label": "中性色", "value": "低饱和中性色" }
        ]
      },
      {
        "id": "surface-material",
        "name": "表面材质",
        "options": [
          { "id": "material-fabric", "label": "织物", "value": "耐磨织物表面" },
          { "id": "material-leather", "label": "皮革", "value": "皮革包覆表面" },
          { "id": "material-metal", "label": "金属", "value": "拉丝金属表面" },
          { "id": "material-composite", "label": "复合材料", "value": "轻量化复合材料表面" }
        ]
      },
      {
        "id": "form-language",
        "name": "造型形式",
        "options": [
          { "id": "form-integrated", "label": "一体化", "value": "一体化流线造型" },
          { "id": "form-modular", "label": "模块化", "value": "模块化可拆装结构" },
          { "id": "form-lightweight", "label": "轻量化", "value": "轻量化纤薄造型" }
        ]
      },
      {
        "id": "design-style",
        "name": "设计风格",
        "options": [
          { "id": "style-minimal", "label": "现代简约", "value": "现代简约工业设计风格" },
          { "id": "style-technology", "label": "科技感", "value": "未来科技感工业设计风格" },
          { "id": "style-warm", "label": "温暖舒适", "value": "温暖舒适的人性化设计风格" }
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
  ),
  (
    'cabin',
    '[
      {
        "id": "cabin-type",
        "name": "客室类型",
        "options": [
          { "id": "cabin-metro", "label": "地铁客室", "value": "现代地铁客室" },
          { "id": "cabin-high-speed", "label": "高铁客室", "value": "高速铁路客室" },
          { "id": "cabin-sleeper", "label": "卧铺客室", "value": "长途卧铺客室" }
        ]
      },
      {
        "id": "camera-angle",
        "name": "画面角度",
        "options": [
          { "id": "camera-center", "label": "中央通道", "value": "中央通道平视视角" },
          { "id": "camera-wide", "label": "广角", "value": "客室广角透视" },
          { "id": "camera-corner", "label": "角落视角", "value": "客室角落斜向视角" }
        ]
      },
      {
        "id": "component-color",
        "name": "部件颜色",
        "options": [
          { "id": "component-color-red", "label": "红色", "value": "部件采用红色" },
          { "id": "component-color-blue", "label": "蓝色", "value": "部件采用蓝色" },
          { "id": "component-color-neutral", "label": "中性色", "value": "部件采用低饱和中性色" }
        ]
      },
      {
        "id": "material",
        "name": "材质",
        "options": [
          { "id": "material-fabric", "label": "织物", "value": "耐磨织物材质" },
          { "id": "material-leather", "label": "皮革", "value": "皮革包覆材质" },
          { "id": "material-metal", "label": "金属", "value": "拉丝金属材质" },
          { "id": "material-composite", "label": "复合材料", "value": "轻量化复合材料" }
        ]
      },
      {
        "id": "design-style",
        "name": "设计风格",
        "options": [
          { "id": "style-minimal", "label": "现代简约", "value": "现代简约客室风格" },
          { "id": "style-technology", "label": "科技感", "value": "未来科技感客室风格" },
          { "id": "style-warm", "label": "温暖舒适", "value": "温暖舒适客室风格" }
        ]
      },
      {
        "id": "image-size",
        "name": "图像尺寸",
        "options": [
          { "id": "size-square", "label": "方形", "value": "方形构图，1024×1024" },
          { "id": "size-landscape", "label": "横向", "value": "横向构图，2048×1080" },
          { "id": "size-panorama", "label": "全景", "value": "超宽幅全景构图，2560×1080" }
        ]
      },
      {
        "id": "light-environment",
        "name": "光环境",
        "options": [
          { "id": "light-day", "label": "白天", "value": "明亮自然的白天光环境" },
          { "id": "light-cloudy", "label": "阴天", "value": "柔和均匀的阴天光环境" },
          { "id": "light-night", "label": "夜晚", "value": "具有层次感的夜间照明环境" }
        ]
      },
      {
        "id": "outside-environment",
        "name": "窗外环境",
        "options": [
          { "id": "outside-outdoor", "label": "户外", "value": "窗外为开阔户外环境" },
          { "id": "outside-forest", "label": "森林", "value": "窗外为森林景观" },
          { "id": "outside-grassland", "label": "草地", "value": "窗外为草地景观" },
          { "id": "outside-desert", "label": "沙漠", "value": "窗外为沙漠景观" },
          { "id": "outside-city", "label": "城市", "value": "窗外为现代城市景观" }
        ]
      }
    ]'::jsonb
  )
ON CONFLICT (design_mode) DO NOTHING;
