# 报告生成模块

## 1. 能力范围

`/report-generation` 将当前项目中的结构化文字与图片资产编排为 Word（`.docx`）、PowerPoint（`.pptx`）或 Markdown（`.md`）文件。报告不是浏览器静态导出：提交后创建真实任务，由平台 Worker 生成文件、写入 MinIO，并登记为当前项目资产和 `job_outputs`。DOCX/PPTX 使用 `document` 类型，Markdown 使用 `text` 类型。

页面提供“模板生成”和“AI 生成”两种方式，三种交付格式都可选择任一方式。模板生成使用平台内置 `rail-design-standard-v1` 渲染器；AI 生成由后端适配器调用独立的 `generate-file` 服务。两条路径共用平台任务、权限、项目资产、对象存储、审计和输出资产协议，浏览器不会获得外部服务地址。

报告由标题、摘要和最多 8 个有序章节组成。每章包含正文和最多 8 张图片，整份报告最多 24 张图片；图片只接受已登记到当前项目的 PNG/JPEG 资产。页面也可上传本地 PNG/JPEG，上传完成后先登记为项目 `image` 资产，再加入章节。

## 2. 接口契约

| 接口 | 用途 |
| --- | --- |
| `GET /api/v1/reports/status` | 返回生成方式及配置状态、报告类型、格式、图片 MIME 和数量限制 |
| `POST /api/v1/reports/generations` | 校验项目、资产和白名单结构后创建报告任务 |
| `GET /api/v1/jobs?projectId=...` | 查询报告任务进度和输出资产 |
| `POST /api/v1/jobs/:id/cancel` | 请求 Worker 在安全边界停止报告生成 |
| `GET /api/v1/assets/:id/download` | 获取完成报告的短时下载地址 |

创建接口只接受业务字段，不接受对象存储地址、服务端路径或任意模板代码。报告正文和图片说明保存在任务参数中，用于重现产物；审计事件只记录报告类型、格式、章节数、图片数和输入字节数，不记录正文或图片说明。

## 3. 数据与执行流程

迁移 `027_report_generation.sql` 新增 `report_generation_executions`。任务创建时预分配输出资产 ID 和对象键，Worker 重试始终复用同一目标，避免重复创建报告资产。

1. API 校验登录、`platform:job:write`、项目写权限、图片项目归属、登记状态、对象版本、MIME 和总容量。
2. API 在事务中创建或复用个人报告工作区，写入 `jobs`、有序 `job_inputs` 和报告执行记录。
3. Worker 使用租约领取任务，从 MinIO 读取输入图片；`template` 调用内置模板渲染器，`ai` 调用受控外部报告适配器。
4. 渲染器生成 Word、PowerPoint 或 UTF-8 Markdown 字节；Worker 写入私有对象存储。
5. Worker 在事务中创建 `document` 或 `text` 资产、版本、标签和 `job_outputs`，再将任务标记为成功。
6. 若对象存储成功而数据库事务失败，Worker 删除本轮对象并重试；连续 3 次失败后使用 `REPORT_GENERATION_FAILED` 结束任务。

取消请求写入 `cancel_requested`。Worker 在开始和渲染完成后检查取消状态；已取消任务不会登记输出资产。外部服务当前是同步接口且不提供取消端点，因此正在执行的上游请求只能在平台超时或返回后终止后续入库，不能保证立即释放上游计算资源。

## 4. AI 报告服务契约与配置

平台后端以 `multipart/form-data` 调用 `POST /api/v1/generate-file`：`text` 为受控中文报告内容，`type` 为 `word`、`ppt` 或 `md`，同时发送 `filename`、`language=Chinese`、`template`、`project_name`、`report_type`、`requested_by` 和 `generated_date`；PPT 页数按“封面 + 章节”推导并限制在 2–12 页。每张项目图片通过同名 `images` 字段作为真实文件重复上传，不使用 Data URL 或对象存储地址。

服务成功时必须直接返回文件字节，而不是 JSON。DOCX/PPTX 校验 ZIP/OOXML 签名，Markdown 校验非空、无 NUL 的有效 UTF-8 内容；三种格式都校验最大输出大小和可选的 `x-generated-file-type`，再交给既有 MinIO 与资产入库流程。当前本地服务公开契约的 `GeneratedFileType` 为 `word`、`md`、`ppt`。上游 4xx/5xx、超时或无效文件都使平台任务明确失败，不伪造产物。

开发环境在 `apps/platform-api/.env` 配置，生产环境在部署 `.env` 配置：

```dotenv
REPORT_AI_API_URL=http://127.0.0.1:5001/api/v1/generate-file
REPORT_AI_TIMEOUT_MS=600000
REPORT_AI_MAX_OUTPUT_BYTES=104857600
REPORT_AI_TEMPLATE=general
```

修改后必须重启平台 API 与 Worker。Docker 部署时 `127.0.0.1` 指向容器自身，应改成容器可访问的服务名或宿主机地址。未配置 `REPORT_AI_API_URL` 时，状态接口将 AI 方式标为未配置，创建 AI 任务返回稳定错误码 `ADAPTER_NOT_CONFIGURED`；模板生成不受影响。

## 5. 输出规范

Word 使用 A4 页面、独立无页眉封面、报告信息表、执行摘要、章节导航、平台页眉、页码、有序章节、等比图片和编号图注；短小的无图结论不强制另起空白页。PowerPoint 使用 16:9 页面、独立封面、报告概览、章节分页、受控图文或编号要点版式、等比图片、图注和页码。Markdown 使用 UTF-8、一级标题、报告信息表、执行摘要、章节导航、有序章节和编号图注，图片以 Data URL 内嵌，单个 `.md` 文件即可完整交付。

输出资产固定使用 `workflow` 来源、`report-generator` 来源应用，以及 `report`、报告类型、文件格式、生成方式和模板键标签；DOCX/PPTX 使用 `document` 类型，Markdown 使用 `text` 类型，生成成功后自动加入当前项目资产。最近任务同时显示“模板生成”或“AI 生成”标签。

## 6. 验证与限制

渲染器单元测试同时生成 DOCX/PPTX/Markdown，前两者检查 OOXML 结构，Markdown 检查 UTF-8 章节与自包含图片。`scripts/report-generation-smoke.ts` 可生成带真实项目截图的三种样例文件；样例 Word 需逐页渲染检查，样例 PPT 需逐页渲染检查并运行越界检测，样例 Markdown 需打开核对标题、章节与图片。

当前只提供一个平台标准模板，不支持用户上传 Word/PPT 模板；图片只支持 PNG/JPEG；模板 PowerPoint 按章节和每页最多两张图片自动分页，不提供浏览器内像素级版式编辑。AI 内容计划由外部服务生成，但 PPTX 使用确定性的本地原生 Office 布局，禁止后续阶段添加库存图片、装饰图标或无输入数据支持的图表；平台仍负责契约校验、任务追踪和资产回流。任务正文属于业务数据，会进入 `jobs.parameters`，AI 方式还会将正文和选定图片发送给已配置的外部服务；部署方需确认该服务的数据处理边界，并按项目数据策略备份和限制访问。

## 7. 生成质量基线

“接近直接由成熟对话式 AI 生成 Word/PPT 成品”的目标被拆成可重复验证的检查项，而不是依赖主观观感：

1. **事实忠实度**：标题、摘要、章节顺序、限定条件和待确认状态必须保留；不得新增尺寸、性能、法规符合性、试验结论、收益或实施成果。
2. **结构完整度**：有明确封面、报告信息、执行摘要/概览、正文层级和结论；内容不靠重复段落或空泛口号凑页数。
3. **图文证据关系**：图片只说明可见设计特征，每张图片最多使用一次，图注能说明图片对应章节和来源语义。
4. **可编辑交付**：正文、标题、表格和图注保持原生 Office 元素，避免把整页栅格化成不可编辑图片。
5. **版式稳定性**：无文字/图片越界、重叠、孤立标题和意外大空白；图片保持比例，页眉、页码、字号和品牌层级一致。
6. **来源可追踪**：项目、报告类型、编制人、日期、输入图片和平台任务/资产关系可回查。

模板和 AI 两条路径使用同一套样例和量表做前后对比。DOCX/PPTX 必须先生成真实文件，再渲染全部页面/幻灯片进行视觉检查；仅通过 OOXML 结构测试不能作为成品质量通过依据。

## 8. 模板技术路线

主流实现通常不会让模型直接决定所有坐标，而是先生成或接收结构化报告模型，再把数据合并到由业务人员维护的 Office 模板：固定报告适合占位符替换；重复章节和表格使用循环/条件；长篇 Word 使用参考文档样式；PPT 使用母版、占位符和少量受控布局组件。平台采用同样的混合思路：

```text
表单/AI 内容计划 → 规范化报告模型 → 事实与数量校验
                  → Word 模板/样式组件 → DOCX 渲染验收
                  → PPT 母版/布局选择器 → PPTX 渲染验收
                  → Markdown 语义模板 → 自包含 MD 检查
```

当前 `rail-design-standard-v1` 已把封面、元数据、摘要、导航、章节、图文和结论拆成受控组件；下一阶段若要支持客户模板，应建立版本化模板注册表，限制可用占位符和循环数据，上传时先做模板静态校验与预览，不允许任意模板代码进入 Worker。
