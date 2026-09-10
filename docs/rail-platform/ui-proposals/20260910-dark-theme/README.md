# 资产中心完整深色模式提案

本次仅制作视觉提案，未修改运行代码、主题配置或业务数据。图片由内置 image_gen 工具根据用户提供的夜览截图生成，用于确定色彩方向；控件细节和文字以实际产品为准。

- 页面底色使用近黑深灰，顶部、侧栏、内容面板和卡片具有轻微明度差。
- 标题与主要正文用浅灰白，辅助信息用中灰，边框低对比但可辨识。
- 红色仅用于品牌、选中态及主要操作，禁用控件保留可读轮廓。
- 资产图片保留原色；后续实现不应整体反色、降低图片亮度或对页面套统一滤镜。
- 同一规则需要覆盖工作台、资产中心、设计页面，以及弹窗、下拉框、表格、分页、空态等组件。

效果图：`asset-center-dark-concept.png`。

## 实际生成提示词

Use case: ui-mockup, screenshot theme edit. Edit target: the attached exact Chinese enterprise rail interior design asset-center screenshot. Produce ONE high fidelity full-page UI screenshot presenting a coherent dark mode. Preserve original layout, Chinese brand title 客运装备内装模块化分区快速设计平台, title 资产中心, narrow outer left navigation, inner category rail CMF/零部件/客室/报告/全部/收藏/未分类, top tabs, project selector, toolbar, all nine existing asset thumbnails in exact same positions, three-column asset grid and card metadata. Preserve the thumbnails' original full colors and brightness, do not invert or tint their contents. ONLY redesign interface surface, typography and control colors into professional neutral charcoal dark theme. Whole main page background #111315, header and outer sidebar #15181C, asset browser panel and inner sidebar #1B1F24, asset cards metadata/footer #22272E, input fields #252A32; subtle 1px borders #343B45. Main heading and file names #E8EDF3, secondary labels #AFB8C5, muted metadata #8B96A5, icons soft gray. Selected asset tab and selected inner '全部' category use dark burgundy surface #3D222B with pale coral text #FF8297; retain red logo and red floating AI action. Thin subdued borders and corners, no bright white UI patches, no solid white cards. Disabled 登记资产 and 新建文件夹 use dark gray fills, subdued yet readable gray text and gray icons, keep visibly disabled because all-projects is selected. Make header and content hierarchy harmonious and restrained, never glowing neon. Font crisp Simplified Chinese sans serif. Preserve image dimensions/proportions and full interface from top header to third row; no device frame, no explanations, no palette labels, no before-after split, no watermarks. This is a proposed dark theme visual only, not an implementation screenshot.
