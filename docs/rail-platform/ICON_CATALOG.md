# 平台图标语义清单

本清单覆盖 rail 主平台 Web 全部业务页、路由、动态应用，以及使用的 Vben 公共外壳与基础 UI 组件。不包含未加载的上游示例、第三方 ComfyUI/AI Toolkit/Presenton 原生界面，或图标库仅导出但未被引入的图形。

业务/类型/操作集中映射共 130 项，动态能力映射 20 项，公共组件图标 63 种；集中映射条目数不是去重后的图形数。

## 使用规则

- 同一含义只使用一个集中映射：资产业务一律 `platformSemanticIcons.assets`（`lucide:library-big`），不再使用文件夹或任意文件图标表示资产中心。
- 资产“属于什么业务”与“是什么文件”分开：报告分类用报告图标，PDF/Word 文件用 document 图标；图片文件仍用 image。资产卡片展示真实文件类型不是资产入口，不应强制全换成资料库。
- 同一功能的入口、结果工具与分类保持一致；刷新用 refresh-cw，重置/旋转用 rotate-ccw，历史用 history；全屏用 maximize-2，扩图用 expand。
- 统一图形不要求所有位置同样尺寸/颜色。颜色继续表达品牌、选中、成功/失败/禁用，动作含义同时保留文本/提示与无障碍标签。
- 运行时不得散写 `lucide:*`；业务实体、文件类型、通用操作分别引用三份映射。新功能同步维护 `capability-icons.ts`；未知应用只允许本地登记图标，无法识别时回退为应用图标，避免远程取图或空白。
- `rail:mask` 为集中注册的 ComfyUI 遮罩符号；AI 助手头像 `assistant-logo.svg` 与平台 Logo `rail-logo.svg` 是品牌图形。首页轨道线稿、Loss 曲线、摄影机角度画布为内容可视化，不是操作 icon。

本文件由 `node scripts/platform-icon-catalog.mjs` 输出生成；代码变动后更新清单，并执行 `node scripts/platform-icon-catalog.mjs --check` 检查。

## 业务实体与分类

| 含义 | 统一图标 | 代码入口 | 使用位置 |
| --- | --- | --- | --- |
| 成员、用户与权限 | `lucide:users-round` | `platformSemanticIcons.access` | `router/routes/modules/platform.ts`<br>`views/platform/overview/index.vue`<br>`views/platform/overview/workbench-tools.ts`<br>`views/platform/projects/index.vue` |
| AI 应用与能力目录 | `lucide:sparkles` | `platformSemanticIcons.applications` | `modules/platform/capability-icons.ts`<br>`views/platform/dashboard/index.vue` |
| 资产中心、项目资产、加入资产 | `lucide:library-big` | `platformSemanticIcons.assets` | `components/platform/workflow-run-card.vue`<br>`modules/platform/design-result-actions.ts`<br>`router/routes/modules/platform.ts`<br>`views/platform/dashboard/index.vue`<br>`views/platform/design/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/projects/index.vue`<br>`views/platform/workspace/asset-picker-modal.vue`<br>`views/platform/workspace/capability-media-field.vue`<br>`views/platform/workspace/index.vue` |
| 客室效果 | `lucide:train-front` | `platformSemanticIcons.cabin` | `modules/platform/asset-browser.ts`<br>`modules/platform/design-modes.ts` |
| CMF 色彩、材料与表面工艺 | `lucide:swatch-book` | `platformSemanticIcons.cmf` | `modules/platform/asset-browser.ts`<br>`modules/platform/design-modes.ts` |
| 客室零部件 | `lucide:boxes` | `platformSemanticIcons.component` | `modules/platform/asset-browser.ts`<br>`modules/platform/design-modes.ts` |
| 操作日志与审计 | `lucide:scroll-text` | `platformSemanticIcons.audit` | `router/routes/modules/platform.ts`<br>`views/platform/overview/workbench-tools.ts` |
| 会话数量、文本对话能力 | `lucide:messages-square` | `platformSemanticIcons.conversations` | `modules/platform/capability-icons.ts`<br>`views/platform/dashboard/index.vue` |
| 设计生成入口 | `lucide:message-square-more` | `platformSemanticIcons.design` | `router/routes/modules/platform.ts`<br>`views/platform/jobs/index.vue`<br>`views/platform/overview/index.vue` |
| 历史会话、查看我的设计 | `lucide:history` | `platformSemanticIcons.history` | `components/assistant/ai-assistant.vue`<br>`views/platform/dashboard/index.vue` |
| 首页 | `lucide:layout-dashboard` | `platformSemanticIcons.home` | `router/routes/modules/platform.ts` |
| 累计任务、任务台账 | `lucide:list-checks` | `platformSemanticIcons.jobs` | `router/routes/modules/platform.ts`<br>`views/platform/overview/index.vue`<br>`views/platform/workspace/index.vue` |
| LoRA 模型训练 | `lucide:graduation-cap` | `platformSemanticIcons.modelTraining` | `modules/platform/capability-icons.ts`<br>`router/routes/modules/platform.ts`<br>`views/platform/dashboard/index.vue` |
| 新建设计、无结果时的设计占位 | `lucide:wand-sparkles` | `platformSemanticIcons.newDesign` | `components/platform/design-history-preview.vue`<br>`views/platform/dashboard/index.vue`<br>`views/platform/design/index.vue` |
| 个人用户 | `lucide:user` | `platformSemanticIcons.profile` | `components/assistant/ai-assistant.vue`<br>`layouts/basic.vue`<br>`router/routes/modules/platform.ts` |
| 项目、项目选择 | `lucide:folder-kanban` | `platformSemanticIcons.projects` | `views/platform/dashboard/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/workbench/index.vue`<br>`views/platform/workbench/section-items.vue` |
| 报告生成、报告业务分类 | `lucide:file-chart-column` | `platformSemanticIcons.report` | `modules/platform/asset-browser.ts`<br>`modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`router/routes/modules/platform.ts`<br>`views/platform/dashboard/index.vue`<br>`views/platform/report-generation/index.vue` |
| 运行任务、开始运行 | `lucide:circle-play` | `platformSemanticIcons.runningJobs` | `views/platform/overview/index.vue` |
| 角色权限、安全状态 | `lucide:shield-check` | `platformSemanticIcons.security` | `router/routes/modules/platform.ts`<br>`views/platform/access/index.vue`<br>`views/platform/dashboard/index.vue`<br>`views/platform/workspace/index.vue` |
| 设计工作台 | `lucide:panels-top-left` | `platformSemanticIcons.workbench` | `router/routes/modules/platform.ts`<br>`views/platform/dashboard/index.vue`<br>`views/platform/design/index.vue` |
| 工作流管理、工作流版本 | `lucide:workflow` | `platformSemanticIcons.workflow` | `router/routes/modules/platform.ts`<br>`views/platform/jobs/index.vue`<br>`views/platform/overview/workbench-tools.ts` |
| 遮罩、局部重绘 | `rail:mask` | `platformSemanticIcons.mask` | `bootstrap.ts`<br>`components/platform/comfy-mask-editor.vue`<br>`components/platform/comfy-mask-icon.vue`<br>`modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts`<br>`views/platform/design/index.vue` |

## 八类文件类型

| 含义 | 统一图标 | 代码入口 | 使用位置 |
| --- | --- | --- | --- |
| 压缩包 | `lucide:file-archive` | `assetTypeIcons.archive` | 集中类型索引/动态映射 |
| 音频 | `lucide:audio-lines` | `assetTypeIcons.audio` | 集中类型索引/动态映射 |
| 文档 | `lucide:file-text` | `assetTypeIcons.document` | `components/assistant/ai-assistant.vue`<br>`views/platform/design/index.vue` |
| 图片 | `lucide:image` | `assetTypeIcons.image` | `components/platform/model3d-viewer.vue`<br>`components/platform/workflow-run-card.vue`<br>`views/_core/profile/avatar-cropper.vue`<br>`views/platform/design/index.vue`<br>`views/platform/model-training/index.vue`<br>`views/platform/report-generation/index.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 模型权重文件 | `lucide:brain-circuit` | `assetTypeIcons.model` | `components/platform/asset-model-preview.vue`<br>`components/platform/model3d-viewer.vue`<br>`modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts`<br>`views/platform/design/index.vue` |
| 3D 模型 | `lucide:box` | `assetTypeIcons.model3d` | `components/platform/asset-model-preview.vue`<br>`components/platform/model3d-viewer.vue`<br>`modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts`<br>`views/platform/design/index.vue` |
| 文本 | `lucide:notebook-text` | `assetTypeIcons.text` | 集中类型索引/动态映射 |
| 视频 | `lucide:video` | `assetTypeIcons.video` | 集中类型索引/动态映射 |

## 通用操作、状态与专业工具

| 含义 | 统一图标 | 代码入口 | 使用位置 |
| --- | --- | --- | --- |
| 关闭、取消或移除待发附件 | `lucide:x` | `platformUiIcons.close` | `components/assistant/ai-assistant.vue`<br>`components/platform/comfy-mask-editor.vue`<br>`views/platform/assets/index.vue`<br>`views/platform/design/design-prompt-template-popover.vue`<br>`views/platform/design/index.vue`<br>`views/platform/jobs/index.vue`<br>`views/platform/model-training/index.vue` |
| 向下移动或输入到输出方向 | `lucide:arrow-down` | `platformUiIcons.arrowDown` | `components/assistant/ai-assistant.vue`<br>`views/platform/report-generation/index.vue`<br>`views/platform/workspace/index.vue` |
| 降序排列 | `lucide:arrow-down-wide-narrow` | `platformUiIcons.arrowDownWideNarrow` | `components/assistant/ai-assistant.vue` |
| 返回或上一步 | `lucide:arrow-left` | `platformUiIcons.arrowLeft` | `views/platform/design/index.vue`<br>`views/platform/workspace/index.vue` |
| 进入或下一步 | `lucide:arrow-right` | `platformUiIcons.arrowRight` | `components/platform/workflow-run-card.vue`<br>`views/platform/dashboard/index.vue`<br>`views/platform/design/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/projects/index.vue` |
| 向上移动 | `lucide:arrow-up` | `platformUiIcons.arrowUp` | `components/assistant/ai-assistant.vue`<br>`views/platform/report-generation/index.vue` |
| 升序排列 | `lucide:arrow-up-narrow-wide` | `platformUiIcons.arrowUpNarrowWide` | `components/assistant/ai-assistant.vue` |
| 无可用结果或禁止操作 | `lucide:ban` | `platformUiIcons.ban` | `components/platform/workflow-run-card.vue` |
| 结构化参数或 JSON | `lucide:braces` | `platformUiIcons.braces` | `views/platform/workspace/index.vue` |
| 摄影机或单视角 | `lucide:camera` | `platformUiIcons.camera` | `components/platform/model3d-viewer.vue`<br>`modules/platform/capability-icons.ts`<br>`views/platform/workspace/capability-media-field.vue` |
| 图片标注 | `lucide:captions` | `platformUiIcons.captions` | `views/platform/model-training/index.vue` |
| 确认或已完成 | `lucide:check` | `platformUiIcons.check` | `components/assistant/ai-assistant.vue`<br>`components/platform/comfy-mask-editor.vue`<br>`views/platform/design/index.vue` |
| 展开下拉 | `lucide:chevron-down` | `platformUiIcons.chevronDown` | `views/platform/design/design-image-size.vue`<br>`views/platform/design/design-quick-field.vue`<br>`views/platform/design/index.vue`<br>`views/platform/report-generation/index.vue` |
| 上一张或收起侧栏 | `lucide:chevron-left` | `platformUiIcons.chevronLeft` | `components/platform/image-lightbox.vue`<br>`views/platform/design/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/report-generation/index.vue` |
| 下一张或展开侧栏 | `lucide:chevron-right` | `platformUiIcons.chevronRight` | `components/platform/image-lightbox.vue`<br>`views/platform/assets/index.vue`<br>`views/platform/dashboard/index.vue`<br>`views/platform/design/design-prompt-template-popover.vue`<br>`views/platform/design/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/report-generation/index.vue`<br>`views/platform/workspace/asset-picker-modal.vue` |
| 失败或警告 | `lucide:circle-alert` | `platformUiIcons.circleAlert` | `components/assistant/ai-assistant.vue`<br>`components/platform/workflow-run-card.vue`<br>`views/platform/model-training/index.vue` |
| 成功状态 | `lucide:circle-check` | `platformUiIcons.circleCheck` | `views/platform/design/index.vue`<br>`views/platform/model-training/index.vue` |
| 当前参数选项 | `lucide:circle-dot` | `platformUiIcons.circleDot` | `views/platform/design/design-quick-field.vue` |
| 帮助说明 | `lucide:circle-help` | `platformUiIcons.circleHelp` | `views/platform/model-training/index.vue`<br>`views/platform/model-training/lora-parameter-label.vue` |
| 任务已停止 | `lucide:circle-stop` | `platformUiIcons.circleStop` | `components/platform/workflow-run-card.vue` |
| 时间或等待 | `lucide:clock-3` | `platformUiIcons.clock3` | `views/platform/overview/index.vue` |
| 图片前后对比 | `lucide:columns-2` | `platformUiIcons.columns2` | `components/platform/workflow-run-card.vue` |
| 复制 | `lucide:copy` | `platformUiIcons.copy` | `components/assistant/ai-assistant.vue`<br>`components/platform/workflow-run-card.vue`<br>`views/platform/assets/index.vue`<br>`views/platform/overview/index.vue` |
| 随机种子 | `lucide:dices` | `platformUiIcons.dices` | `views/platform/design/design-quick-field.vue` |
| 下载或导出 | `lucide:download` | `platformUiIcons.download` | `components/platform/model3d-viewer.vue`<br>`components/platform/workflow-run-card.vue`<br>`modules/platform/design-result-actions.ts`<br>`views/platform/report-generation/index.vue` |
| 更多操作 | `lucide:ellipsis` | `platformUiIcons.ellipsis` | `components/platform/workflow-run-card.vue` |
| 擦除 | `lucide:eraser` | `platformUiIcons.eraser` | `components/platform/comfy-mask-editor.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 向外扩图（与全屏查看不同） | `lucide:expand` | `platformUiIcons.expand` | `modules/platform/capability-icons.ts` |
| 未知文件类型 | `lucide:file` | `platformUiIcons.file` | `components/platform/asset-text-preview.vue`<br>`modules/platform/asset-types.ts`<br>`views/platform/assets/index.vue` |
| 文件已选择 | `lucide:file-check-2` | `platformUiIcons.fileCheck2` | `views/platform/assets/index.vue` |
| 文件无法加载 | `lucide:file-warning` | `platformUiIcons.fileWarning` | `components/platform/asset-text-preview.vue` |
| 文件夹或未分类目录 | `lucide:folder` | `platformUiIcons.folder` | `modules/platform/asset-browser.ts`<br>`views/platform/assets/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/report-generation/index.vue`<br>`views/platform/workspace/asset-picker-modal.vue` |
| 移动到文件夹 | `lucide:folder-input` | `platformUiIcons.folderInput` | `views/platform/assets/index.vue` |
| 新建文件夹 | `lucide:folder-plus` | `platformUiIcons.folderPlus` | `views/platform/assets/index.vue` |
| 未找到项目 | `lucide:folder-search-2` | `platformUiIcons.folderSearch2` | `views/platform/overview/index.vue` |
| 网格视图 | `lucide:grid-2x2` | `platformUiIcons.grid2x2` | `views/platform/assets/index.vue`<br>`views/platform/overview/index.vue` |
| 拖动平移 | `lucide:hand` | `platformUiIcons.hand` | `components/platform/image-lightbox.vue` |
| 图片无法加载 | `lucide:image-off` | `platformUiIcons.imageOff` | `views/platform/assets/index.vue` |
| 文生图或添加图片 | `lucide:image-plus` | `platformUiIcons.imagePlus` | `components/assistant/ai-assistant.vue`<br>`modules/platform/capability-icons.ts`<br>`modules/platform/design-generation.ts`<br>`modules/platform/design-modes.ts`<br>`views/platform/design/index.vue`<br>`views/platform/report-generation/index.vue` |
| 图片输入到图生图 | `lucide:image-up` | `platformUiIcons.imageUp` | `views/platform/design/index.vue` |
| 多图或图生图 | `lucide:images` | `platformUiIcons.images` | `modules/platform/capability-icons.ts`<br>`modules/platform/design-generation.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts`<br>`views/platform/design/index.vue` |
| 信息提示 | `lucide:info` | `platformUiIcons.info` | `components/assistant/ai-assistant.vue`<br>`views/platform/access/index.vue` |
| 全部分类 | `lucide:layout-grid` | `platformUiIcons.layoutGrid` | `modules/platform/asset-browser.ts` |
| 列表视图 | `lucide:list` | `platformUiIcons.list` | `views/platform/assets/index.vue`<br>`views/platform/design/design-quick-field.vue`<br>`views/platform/overview/index.vue` |
| 下拉选项参数 | `lucide:list-filter` | `platformUiIcons.listFilter` | `views/platform/design/design-quick-field.vue` |
| 加载中 | `lucide:loader-circle` | `platformUiIcons.loaderCircle` | `components/assistant/ai-assistant.vue`<br>`components/platform/asset-model-preview.vue`<br>`components/platform/asset-text-preview.vue`<br>`components/platform/comfy-mask-editor.vue`<br>`components/platform/model3d-viewer.vue`<br>`views/platform/assets/index.vue`<br>`views/platform/dashboard/index.vue`<br>`views/platform/design/index.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 锁定或固定比例 | `lucide:lock-keyhole` | `platformUiIcons.lockKeyhole` | `views/platform/design/design-image-size.vue` |
| 解除锁定 | `lucide:lock-keyhole-open` | `platformUiIcons.lockKeyholeOpen` | `views/platform/design/design-image-size.vue` |
| 平面图填色 | `lucide:map` | `platformUiIcons.map` | `modules/platform/design-modes.ts` |
| 全屏或展开查看 | `lucide:maximize-2` | `platformUiIcons.maximize2` | `components/platform/comfy-mask-editor.vue`<br>`components/platform/model3d-viewer.vue`<br>`components/platform/workflow-run-card.vue`<br>`views/platform/model-training/index.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 新建个人会话 | `lucide:message-square-plus` | `platformUiIcons.messageSquarePlus` | `views/platform/dashboard/index.vue` |
| 退出全屏或还原 | `lucide:minimize-2` | `platformUiIcons.minimize2` | `components/platform/model3d-viewer.vue` |
| 屏幕捕获 | `lucide:monitor-up` | `platformUiIcons.monitorUp` | `modules/platform/capability-icons.ts`<br>`views/platform/workspace/capability-media-field.vue` |
| 选取输入或启动操作 | `lucide:mouse-pointer-click` | `platformUiIcons.mousePointerClick` | `views/platform/workspace/index.vue` |
| 3D 空间控制 | `lucide:move-3d` | `platformUiIcons.move3d` | `components/platform/model3d-viewer.vue`<br>`views/platform/workspace/camera-angle-control.vue` |
| 提示词模板 | `lucide:notebook-tabs` | `platformUiIcons.notebookTabs` | `views/platform/design/design-prompt-template-popover.vue` |
| 多视角生成 | `lucide:orbit` | `platformUiIcons.orbit` | `modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts`<br>`views/platform/workspace/camera-angle-control.vue` |
| 空结果 | `lucide:package-open` | `platformUiIcons.packageOpen` | `views/platform/assets/index.vue`<br>`views/platform/workspace/index.vue` |
| 3D 模型加载失败 | `lucide:package-x` | `platformUiIcons.packageX` | `components/platform/model3d-viewer.vue` |
| 填充 | `lucide:paint-bucket` | `platformUiIcons.paintBucket` | `components/platform/comfy-mask-editor.vue` |
| 画笔绘制 | `lucide:paintbrush` | `platformUiIcons.paintbrush` | `components/platform/comfy-mask-editor.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 将结果填入输入区 | `lucide:panel-bottom-open` | `platformUiIcons.panelBottomOpen` | `views/platform/design/index.vue` |
| 附件 | `lucide:paperclip` | `platformUiIcons.paperclip` | `components/assistant/ai-assistant.vue`<br>`views/platform/design/index.vue` |
| 编辑或重命名 | `lucide:pencil` | `platformUiIcons.pencil` | `components/assistant/ai-assistant.vue`<br>`components/platform/workflow-run-card.vue`<br>`views/platform/assets/index.vue`<br>`views/platform/design/index.vue`<br>`views/platform/overview/index.vue` |
| 置顶 | `lucide:pin` | `platformUiIcons.pin` | `views/platform/overview/index.vue` |
| 取色 | `lucide:pipette` | `platformUiIcons.pipette` | `components/platform/comfy-mask-editor.vue` |
| 新增 | `lucide:plus` | `platformUiIcons.plus` | `components/assistant/ai-assistant.vue`<br>`views/platform/design/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/projects/index.vue`<br>`views/platform/report-generation/index.vue`<br>`views/platform/workbench/index.vue` |
| 实时捕获 | `lucide:radio` | `platformUiIcons.radio` | `views/platform/workspace/capability-media-field.vue` |
| 图片尺寸或画面比例 | `lucide:rectangle-horizontal` | `platformUiIcons.rectangleHorizontal` | `views/platform/design/design-image-size.vue` |
| 重做 | `lucide:redo-2` | `platformUiIcons.redo2` | `components/platform/comfy-mask-editor.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 刷新/重试 | `lucide:refresh-cw` | `platformUiIcons.refreshCw` | `components/platform/workflow-run-card.vue`<br>`modules/platform/design-result-actions.ts`<br>`views/platform/model-training/index.vue`<br>`views/platform/report-generation/index.vue`<br>`views/platform/workbench/index.vue` |
| 向左旋转或重置 | `lucide:rotate-ccw` | `platformUiIcons.rotateCcw` | `components/platform/comfy-mask-editor.vue`<br>`views/_core/profile/avatar-cropper.vue`<br>`views/platform/workspace/camera-angle-control.vue` |
| 向右旋转 | `lucide:rotate-cw` | `platformUiIcons.rotateCw` | `components/platform/comfy-mask-editor.vue`<br>`views/_core/profile/avatar-cropper.vue` |
| 查看捕获结果 | `lucide:scan` | `platformUiIcons.scan` | `modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts`<br>`views/platform/workspace/capability-media-field.vue` |
| 区域编辑 | `lucide:scan-line` | `platformUiIcons.scanLine` | `modules/platform/capability-icons.ts`<br>`views/platform/workspace/capability-media-field.vue` |
| 图片理解 | `lucide:scan-search` | `platformUiIcons.scanSearch` | `modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts` |
| 搜索 | `lucide:search` | `platformUiIcons.search` | `components/assistant/ai-assistant.vue`<br>`views/platform/access/index.vue`<br>`views/platform/assets/index.vue`<br>`views/platform/audit/index.vue`<br>`views/platform/dashboard/index.vue`<br>`views/platform/design/index.vue`<br>`views/platform/jobs/index.vue`<br>`views/platform/model-training/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/projects/index.vue`<br>`views/platform/workspace/asset-picker-modal.vue` |
| 发送消息 | `lucide:send` | `platformUiIcons.send` | `components/assistant/ai-assistant.vue`<br>`views/platform/design/index.vue` |
| 模板设置 | `lucide:settings-2` | `platformUiIcons.settings2` | `views/platform/design/design-prompt-template-popover.vue` |
| 参数/筛选 | `lucide:sliders-horizontal` | `platformUiIcons.slidersHorizontal` | `views/platform/assets/index.vue`<br>`views/platform/design/design-quick-field.vue`<br>`views/platform/design/index.vue`<br>`views/platform/workspace/index.vue` |
| AI 能力或 LoRA 应用 | `lucide:sparkles` | `platformUiIcons.sparkles` | `modules/platform/capability-icons.ts`<br>`views/platform/workspace/index.vue` |
| 矩形框 | `lucide:square` | `platformUiIcons.square` | `modules/platform/capability-icons.ts`<br>`views/platform/jobs/index.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 色块区域 | `lucide:square-dashed` | `platformUiIcons.squareDashed` | `modules/platform/capability-icons.ts`<br>`views/platform/workspace/capability-media-field.vue` |
| 分区编辑 | `lucide:square-dashed-mouse-pointer` | `platformUiIcons.squareDashedMousePointer` | `modules/platform/capability-icons.ts`<br>`views/platform/workspace/capability-media-field.vue` |
| 收藏 | `lucide:star` | `platformUiIcons.star` | `modules/platform/asset-browser.ts`<br>`views/platform/assets/index.vue`<br>`views/platform/workspace/asset-picker-modal.vue` |
| 灯光 | `lucide:sun` | `platformUiIcons.sun` | `components/platform/model3d-viewer.vue`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts` |
| 环境调整 | `lucide:sun-medium` | `platformUiIcons.sunMedium` | `modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts` |
| 编号标记编辑 | `lucide:tags` | `platformUiIcons.tags` | `modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts` |
| 开关参数 | `lucide:toggle-left` | `platformUiIcons.toggleLeft` | `views/platform/design/design-quick-field.vue` |
| 删除 | `lucide:trash-2` | `platformUiIcons.trash2` | `components/assistant/ai-assistant.vue`<br>`views/platform/assets/index.vue`<br>`views/platform/design/index.vue`<br>`views/platform/jobs/index.vue`<br>`views/platform/overview/index.vue`<br>`views/platform/report-generation/index.vue` |
| 文本参数 | `lucide:type` | `platformUiIcons.type` | `views/platform/design/design-quick-field.vue` |
| 撤销 | `lucide:undo-2` | `platformUiIcons.undo2` | `components/platform/comfy-mask-editor.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 上传 | `lucide:upload` | `platformUiIcons.upload` | `adapter/component/index.ts`<br>`views/platform/assets/index.vue`<br>`views/platform/design/index.vue`<br>`views/platform/model-training/index.vue`<br>`views/platform/report-generation/index.vue`<br>`views/platform/workspace/capability-media-field.vue` |
| 新增用户 | `lucide:user-plus` | `platformUiIcons.userPlus` | `views/platform/access/index.vue` |
| 放大图片或图像超分 | `lucide:zoom-in` | `platformUiIcons.zoomIn` | `components/platform/image-lightbox.vue`<br>`modules/platform/capability-icons.ts`<br>`modules/platform/design-modes.ts`<br>`modules/platform/design-result-actions.ts`<br>`views/_core/profile/avatar-cropper.vue` |
| 缩小图片 | `lucide:zoom-out` | `platformUiIcons.zoomOut` | `components/platform/image-lightbox.vue` |
| 参考图局部重绘 | `lucide:blend` | `platformUiIcons.blend` | `modules/platform/capability-icons.ts` |
| KV 双图编辑 | `lucide:layers` | `platformUiIcons.layers` | `modules/platform/capability-icons.ts` |
| 水平翻转 | `lucide:flip-horizontal-2` | `platformUiIcons.flipHorizontal2` | `components/platform/comfy-mask-editor.vue` |
| 垂直翻转 | `lucide:flip-vertical-2` | `platformUiIcons.flipVertical2` | `components/platform/comfy-mask-editor.vue` |

## 动态应用功能映射

应用 API 返回后按稳定功能代码归一化图标；兼容已有数据库的旧图标，不修改数据库、发布版本或绑定。

| 功能代码                | 统一映射                                   |
| ----------------------- | ------------------------------------------ |
| `text-to-image`         | `platformUiIcons.imagePlus`                |
| `text-to-image-lora`    | `platformUiIcons.sparkles`                 |
| `single-image-edit`     | `platformUiIcons.scanLine`                 |
| `screen-capture-edit`   | `platformUiIcons.monitorUp`                |
| `multi-image-edit`      | `platformUiIcons.images`                   |
| `inpaint-single`        | `platformSemanticIcons.mask`               |
| `inpaint-reference`     | `platformUiIcons.blend`                    |
| `outpaint`              | `platformUiIcons.expand`                   |
| `region-edit`           | `platformUiIcons.squareDashedMousePointer` |
| `region-marker-edit`    | `platformUiIcons.tags`                     |
| `multiview-to-3d`       | `assetTypeIcons.model3d`                   |
| `image-understanding`   | `platformUiIcons.scanSearch`               |
| `text-chat`             | `platformSemanticIcons.conversations`      |
| `image-upscale`         | `platformUiIcons.zoomIn`                   |
| `camera-control-single` | `platformUiIcons.camera`                   |
| `camera-control-multi`  | `platformUiIcons.orbit`                    |
| `image-edit-base`       | `platformUiIcons.layers`                   |
| `image-edit-kv`         | `platformUiIcons.layers`                   |
| `lora-training`         | `platformSemanticIcons.modelTraining`      |
| `report-generator`      | `platformSemanticIcons.report`             |

## 公共外壳与基础组件

以下为实际源文件引入的组件（包括受偏好设置控制的可选 UI），不代表每个页面同时显示。业务页面不能拿主题调色板代替 CMF，或拿通知信封代替报告。

| 组件图标 | 含义 | 使用位置 |
| --- | --- | --- |
| `ArrowDown` | 向下移动 | `packages/effects/layouts/src/widgets/global-search/global-search.vue` |
| `ArrowLeft` | 返回 | `packages/effects/common-ui/src/ui/fallback/fallback.vue` |
| `ArrowLeftToLine` | 关闭右侧标签 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts` |
| `ArrowRightLeft` | 切换/调整标签 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts` |
| `ArrowRightToLine` | 关闭左侧标签 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts` |
| `ArrowUp` | 向上移动 | `packages/effects/layouts/src/widgets/global-search/global-search.vue` |
| `ArrowUpToLine` | 返回顶部 | `packages/@core/ui-kit/shadcn-ui/src/components/back-top/back-top.vue` |
| `Bell` | 通知 | `packages/effects/layouts/src/widgets/notification/notification.vue` |
| `Check` | 确认/选中 | `packages/@core/ui-kit/shadcn-ui/src/ui/checkbox/Checkbox.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/context-menu/ContextMenuCheckboxItem.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/dropdown-menu/DropdownMenuCheckboxItem.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/select/SelectItem.vue` |
| `ChevronDown` | 展开下拉 | `packages/@core/ui-kit/menu-ui/src/components/sub-menu-content.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/breadcrumb/breadcrumb.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/expandable-arrow/expandable-arrow.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/accordion/AccordionTrigger.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/select/SelectScrollDownButton.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/select/SelectTrigger.vue` |
| `ChevronLeft` | 上一项/收起 | `packages/@core/ui-kit/shadcn-ui/src/ui/pagination/PaginationPrevious.vue` |
| `ChevronRight` | 下一项/展开 | `packages/@core/ui-kit/menu-ui/src/components/sub-menu-content.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/breadcrumb/BreadcrumbSeparator.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/context-menu/ContextMenuSubTrigger.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/dropdown-menu/DropdownMenuSubTrigger.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/tree/tree.vue` |
| `ChevronRightIcon` | 下一页（ChevronRight 同图） | `packages/@core/ui-kit/shadcn-ui/src/ui/pagination/PaginationNext.vue` |
| `ChevronsDown` | 展开全部 | `packages/@core/ui-kit/form-ui/src/form-render/form-field.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/collapsible/collapsible-params.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/collapsible/collapsible.vue` |
| `ChevronsLeft` | 快速向左 | `packages/@core/ui-kit/layout-ui/src/components/widgets/sidebar-collapse-button.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/pagination/PaginationFirst.vue`<br>`packages/@core/ui-kit/tabs-ui/src/tabs-view.vue` |
| `ChevronsRight` | 快速向右 | `packages/@core/ui-kit/layout-ui/src/components/widgets/sidebar-collapse-button.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/pagination/PaginationLast.vue`<br>`packages/@core/ui-kit/tabs-ui/src/tabs-view.vue` |
| `ChevronUp` | 向上滚动 | `packages/@core/ui-kit/shadcn-ui/src/ui/select/SelectScrollUpButton.vue` |
| `Circle` | 未选中 | `packages/@core/ui-kit/shadcn-ui/src/components/button/check-button-group.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/context-menu/ContextMenuRadioItem.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/dropdown-menu/DropdownMenuRadioItem.vue` |
| `CircleAlert` | 警告 | `packages/@core/ui-kit/form-ui/src/form-render/form-field.vue`<br>`packages/@core/ui-kit/popup-ui/src/alert/alert.vue` |
| `CircleCheck` | 成功/选中 | `packages/effects/layouts/src/widgets/notification/notification.vue`<br>`packages/@core/ui-kit/popup-ui/src/alert/alert.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/button/check-button-group.vue` |
| `CircleHelp` | 帮助 | `packages/effects/layouts/src/widgets/preferences/blocks/checkbox-item.vue`<br>`packages/effects/layouts/src/widgets/preferences/blocks/input-item.vue`<br>`packages/effects/layouts/src/widgets/preferences/blocks/layout/layout.vue`<br>`packages/effects/layouts/src/widgets/preferences/blocks/number-field-item.vue`<br>`packages/effects/layouts/src/widgets/preferences/blocks/select-item.vue`<br>`packages/effects/layouts/src/widgets/preferences/blocks/switch-item.vue`<br>`packages/@core/ui-kit/popup-ui/src/alert/alert.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/tooltip/help-tooltip.vue` |
| `CircleIcon` | 单选项（Circle 同图） | `packages/@core/ui-kit/shadcn-ui/src/ui/radio-group/RadioGroupItem.vue` |
| `CircleX` | 关闭/清空全部 | `packages/effects/layouts/src/widgets/notification/notification.vue`<br>`packages/effects/layouts/src/widgets/preferences/blocks/input-item.vue`<br>`packages/@core/ui-kit/popup-ui/src/alert/alert.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/select/select.vue` |
| `Copy` | 复制 | `packages/effects/layouts/src/widgets/preferences/preferences-drawer.vue` |
| `CornerDownLeft` | 回车快捷键 | `packages/effects/layouts/src/widgets/global-search/global-search.vue` |
| `Ellipsis` | 更多 | `packages/@core/ui-kit/menu-ui/src/components/menu.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/table-action/table-action.vue` |
| `EmptyIcon` | 公共空列表插画（不是业务资产） | `packages/effects/common-ui/src/components/icon-picker/icon-picker.vue` |
| `ExternalLink` | 外部链接 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts` |
| `Eye` | 显示密码 | `packages/@core/ui-kit/shadcn-ui/src/components/input-password/input-password.vue` |
| `EyeOff` | 隐藏密码 | `packages/@core/ui-kit/shadcn-ui/src/components/input-password/input-password.vue` |
| `FoldHorizontal` | 标签两侧收拢 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts` |
| `Grip` | 拖拽排序 | `packages/effects/common-ui/src/components/icon-picker/icon-picker.vue` |
| `GripVertical` | 竖向拖拽手柄 | `packages/effects/layouts/src/widgets/preferences/blocks/draggable-list.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/resizable/ResizableHandle.vue` |
| `IconDefault` | 默认菜单项 | `packages/@core/ui-kit/shadcn-ui/src/components/icon/icon.vue` |
| `Inbox` | 通知为空 | `packages/effects/common-ui/src/components/tree/tree.vue` |
| `Info` | 信息提示 | `packages/@core/ui-kit/popup-ui/src/alert/alert.vue` |
| `InspectionPanel` | 标签概览 | `packages/effects/layouts/src/widgets/layout-toggle.vue` |
| `Languages` | 语言 | `packages/effects/layouts/src/widgets/language-toggle.vue`<br>`packages/effects/layouts/src/widgets/user-dropdown/user-dropdown.vue` |
| `LayoutGrid` | 网格布局 | `packages/@core/ui-kit/tabs-ui/src/components/widgets/tool-more.vue` |
| `LoaderCircle` | 加载中 | `packages/effects/common-ui/src/components/api-component/api-component.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/button/button.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/button/check-button-group.vue` |
| `LockKeyhole` | 锁定屏幕 | `packages/effects/layouts/src/basic/header/header.vue`<br>`packages/effects/layouts/src/widgets/lock-screen/lock-screen.vue`<br>`packages/effects/layouts/src/widgets/user-dropdown/user-dropdown.vue` |
| `LogOut` | 退出登录 | `packages/effects/layouts/src/basic/header/header.vue`<br>`packages/effects/layouts/src/widgets/user-dropdown/user-dropdown.vue` |
| `MailCheck` | 通知已读（沿用信箱图形，不是邮件服务） | `packages/effects/layouts/src/widgets/notification/notification.vue` |
| `Maximize2` | 全屏 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts`<br>`packages/@core/ui-kit/popup-ui/src/modal/modal.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/full-screen/full-screen.vue`<br>`packages/@core/ui-kit/tabs-ui/src/components/widgets/tool-screen.vue` |
| `MdiKeyboardEsc` | Esc 快捷键 | `packages/effects/layouts/src/widgets/global-search/global-search.vue` |
| `Minimize2` | 退出全屏 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts`<br>`packages/@core/ui-kit/popup-ui/src/modal/modal.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/components/full-screen/full-screen.vue`<br>`packages/@core/ui-kit/tabs-ui/src/components/widgets/tool-screen.vue` |
| `Minus` | 减少/部分选择/分隔符 | `packages/@core/ui-kit/shadcn-ui/src/ui/checkbox/Checkbox.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/number-field/NumberFieldDecrement.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/pin-input/PinInputSeparator.vue` |
| `MoonStar` | 暗色主题 | `packages/effects/layouts/src/widgets/preferences/blocks/theme/theme.vue`<br>`packages/effects/layouts/src/widgets/theme-toggle/theme-toggle.vue` |
| `MoreHorizontal` | 更多（Ellipsis 同图） | `packages/@core/ui-kit/shadcn-ui/src/ui/breadcrumb/BreadcrumbEllipsis.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/pagination/PaginationEllipsis.vue` |
| `Palette` | 主题颜色（不是 CMF 业务分类） | `packages/effects/layouts/src/widgets/color-toggle.vue` |
| `PanelLeft` | 左侧布局 | `packages/effects/layouts/src/widgets/layout-toggle.vue` |
| `PanelRight` | 右侧布局 | `packages/effects/layouts/src/widgets/layout-toggle.vue` |
| `Pin` | 置顶 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts`<br>`packages/effects/layouts/src/widgets/preferences/preferences-drawer.vue`<br>`packages/@core/ui-kit/layout-ui/src/components/widgets/sidebar-fixed-button.vue`<br>`packages/@core/ui-kit/tabs-ui/src/components/tabs/tabs.vue`<br>`packages/@core/ui-kit/tabs-ui/src/components/tabs-chrome/tabs.vue` |
| `PinOff` | 取消置顶 | `packages/effects/layouts/src/basic/tabbar/use-tabbar.ts`<br>`packages/effects/layouts/src/widgets/preferences/preferences-drawer.vue`<br>`packages/@core/ui-kit/layout-ui/src/components/widgets/sidebar-fixed-button.vue` |
| `Plus` | 新增 | `packages/@core/ui-kit/form-ui/src/components/form-field-array.vue`<br>`packages/@core/ui-kit/shadcn-ui/src/ui/number-field/NumberFieldIncrement.vue` |
| `RefreshCw` | 刷新/重试 | `packages/effects/layouts/src/basic/header/header.vue`<br>`packages/effects/layouts/src/basic/tabbar/use-tabbar.ts`<br>`packages/effects/layouts/src/widgets/user-dropdown/user-dropdown.vue`<br>`packages/@core/ui-kit/tabs-ui/src/components/widgets/tool-refresh.vue` |
| `RotateCcw` | 重置/向左旋转 | `packages/effects/layouts/src/widgets/preferences/preferences-drawer.vue` |
| `Search` | 搜索 | `packages/effects/layouts/src/widgets/global-search/global-search.vue`<br>`packages/effects/layouts/src/widgets/user-dropdown/user-dropdown.vue` |
| `SearchX` | 无搜索结果 | `packages/effects/layouts/src/widgets/global-search/search-panel.vue` |
| `Settings` | 设置 | `packages/effects/layouts/src/widgets/preferences/preferences-button.vue`<br>`packages/effects/layouts/src/widgets/preferences/preferences.vue`<br>`packages/effects/layouts/src/widgets/user-dropdown/user-dropdown.vue` |
| `Sun` | 亮色主题 | `packages/effects/layouts/src/widgets/preferences/blocks/theme/theme.vue`<br>`packages/effects/layouts/src/widgets/theme-toggle/theme-toggle.vue` |
| `SunMoon` | 跟随系统主题 | `packages/effects/layouts/src/widgets/preferences/blocks/theme/theme.vue`<br>`packages/effects/layouts/src/widgets/theme-toggle/theme-toggle.vue` |
| `UserRoundPen` | 编辑个人资料 | `packages/effects/layouts/src/widgets/preferences/blocks/theme/builtin.vue` |

公共外壳额外使用的字符串图标：`lucide:panel-left-close`（收起侧栏）、`lucide:panel-left-open`（展开侧栏）、`lucide:globe-2`（时区），以及首页面包屑的 `lucide:layout-dashboard`（与业务首页同图）。这些是共享包内部定义，不能反向依赖 Web 应用模块。
