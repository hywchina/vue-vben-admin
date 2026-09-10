# 统一底色深色模式 V2

本次仅制作效果图，未修改运行代码、主题配置或业务数据。使用内置 image_gen 工具基于用户标注图生成。

## 推荐方向

将标注 1、2、3 对应的大面积背景统一为中性深灰（实现时建议统一使用 #191C20 色值），移除内层分类栏边框、资产浏览器大外框、资产卡片的独立底色及外边框。通过间距、对齐、文字明度和选中态传达层级。

统一背景适用于静态页面主体；选中、悬停、输入控件仍应有可辨识的反馈。浮层弹窗可使用细边框和阴影区分遮挡关系。资产图片保留原色，不能对整页套暗化或反色滤镜。

效果图：`asset-center-dark-unified-v2.png`。生成图片用于确定视觉方向，实际实现时应使用统一主题色变量保证各背景严格同色，并以真实控件、文字及功能为准。

## 实际生成提示词

Use case: ui-mockup screenshot edit. Edit the attached Chinese rail interior asset center dark-theme concept into a more beautiful flat unified dark interface. The user marked three nested surfaces 1,2,3 in red: REMOVE those red numbers and make ALL these surfaces EXACTLY THE SAME uniform solid charcoal #191C20. Crucial: outer navigation rail, page background, inner asset category rail, asset browser content canvas, asset metadata areas, top header and tabs bar all share ONE FLAT SOLID IDENTICAL background, no gradients, no vignette, no texture, no differing panel fills, no shadows. Remove the large rounded rectangular container border surrounding the asset browser, and remove the vertical borders around the inner category sidebar. Remove individual asset card outer borders and tinted footer backgrounds: display photographs with small 6px rounded corners and filenames/meta directly beneath on the common page background. Use generous whitespace, clear alignment, typography and restrained coral/burgundy selected-state highlights to organize the UI rather than nested boxes. Keep faint single separators only under the top header/tab strip if needed. Input outlines subtle #363B42 on same charcoal background; selected assets tab, selected outer nav icon, and selected inner category 全部 can retain small dark burgundy highlight #42222B with coral #FF879B. Main text #E8EBEF, secondary #ADB5C0, tertiary #8E98A5. Preserve layout, existing brand logo and exact title 客运装备内装模块化分区快速设计平台, page title 资产中心, top tabs 首页 / 设计工作台 / 资产中心, narrow outer sidebar, inner category rail CMF/零部件/客室/报告/全部/收藏/未分类. Preserve the 3-column by 3-row image grid, existing thumbnails subjects and their full original colors and brightness (fabric, red carriage, fleet, light jar, floating buildings, train interiors and illustration). Do not tint/darken the thumbnails. Keep real Chinese filenames and small metadata under each thumbnail, clean crisp legible Simplified Chinese font. Match existing information density and functionality. Top right one project selector 全部项目 and one disabled button 登记资产 with readable subdued label; second toolbar one 新建文件夹 disabled button; do not duplicate 登记资产 elsewhere. Keep search field, filter, date sort, grid/list toggles and floating red AI button. Crop away external black screenshot margins, any screenshot viewer overlay, and all red number annotations; output ONLY the finished full-page app UI edge-to-edge, no surrounding devices, no annotations, no explanatory text. Make this an elegant, restrained professional design tool in flat monochrome charcoal with photographs as visual focus. Absolutely uniform background across marked areas 1,2,3; this is the key requested change.

## 开发落地

2026-09-10 用户确认后已实现本方案。主题入口为 `apps/web-antd/src/styles/platform-dark.css`，实际浏览器截图及验收结果见 [verification/RESULTS.md](verification/RESULTS.md)。上文效果图描述保留为设计阶段记录。
