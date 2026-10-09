# rail-system 系统测试与修复报告

本轮对主平台、ComfyUI、AI Toolkit、Presenton，以及部署和同步配置进行了源码回归、真实 API 集成与浏览器验收。已修复资源编号校验、未入库生成图内容权限、AI Toolkit 类型检查和测试隔离问题。已验证的测试通过，但不等于所有 GPU 工作流、生产 LoRA 训练或目标服务器已完成验收。

日期为 2026-10-09，目录为 `/data_ssd/projects/rail-system`。主平台使用当前源码；运行中的 `rail-platform:1.0.0` 容器没有重新构建或替换，不能将源码结果视为该旧镜像的结果。各子仓库保留原有未提交修改，本轮未提交或推送 Git。

## 测试结果

| 范围 | 结果 | 验证边界 |
| --- | --- | --- |
| 主平台业务单元测试 | API 188、Web 248，合计 436 通过 | 认证、权限、图片复用、输入数量、LoRA 参数与分批数据集等回归 |
| 主平台整个仓库单元测试 | 128 文件、868 项通过 | 包含上述 436 项，不重复计数 |
| 主平台静态门禁 | lint、API/Web typecheck、生产 API/Web build 通过 | lint 有 98 项既有 mock 样式警告，无错误 |
| 真实 API 集成 | 五组脚本通过，隔离环境连续两轮成功 | 真实 PostgreSQL、MinIO、HTTP API；ComfyUI/LoRA 外部协议用模拟服务，模板报告用真实 CPU Worker |
| ComfyUI 单元测试 | 922 通过、10 跳过 | Python 3.12 隔离测试依赖，不能替代模型推理 |
| ComfyUI 工作流预检 | 18 个工作流，无缺失节点及已校验静态选项错误 | 真实节点目录 2334 类；动态小组件及部分自定义采样字段仍有提示 |
| ComfyUI 真实推理 | 一次文生图成功，512×512、1 张、4 步 | 页面回显、对象登记、未入库状态；不作为质量或全部 18 项推理验收 |
| Presenton Python | 617 项通过 | 单元测试，仅在测试进程移除代理环境变量 |
| Presenton 根目录 | 6 项通过，固定版本 v0.4.8 导出检查通过 | 元数据及构建入口，不启动 AI 报告服务 |
| Presenton Web | 8 项新增测试通过，Next 生产构建通过 | 3 项输出路径权限和 5 项布局代码校验 |
| AI Toolkit Web | 5 项新增测试、完整 TypeScript、Next 生产构建通过 | 路由参数与编码路径；不包含 GPU 训练或真实 SQLite 服务验收 |
| 根目录部署 | 2 项回归、Compose 全 profile 解析、Shell 语法检查通过 | 只读验证，不启动或重建容器、不删除卷 |
| rail-vllm | Dockerfile、挂载及调用配置核对 | 服务未运行，真实 Qwen-VL 请求不计为通过项 |

## 已修复的问题

### 资源编号校验

非法 UUID 曾进入数据库查询，资产、成员、AI 会话等接口返回 500。统一校验用于 48 个 UUID 资源入口：未登录优先 401，非法编号返回 400 `RESOURCE_ID_INVALID`，合法但不存在的资源返回 404。工作流字符串 key、用户业务编号及独立校验合同保持原规则。新增 5 项单元测试及真实接口回归。

### 未入库生成图内容权限

真实集成复现了同项目另一成员可取得他人未入库生成图预览地址的问题。统一内容授权现应用于预览、下载、版本、保存、重命名、收藏及版本完成等路径。

已入库资产按项目权限共享；未入库生成图须有真实任务输出关联，并属于当前用户创建的原设计会话或应用实例。管理员不能额外读取或发布他人私有生成图。本人继续编辑仍由更严格的原会话输入规则校验，不能跨会话绕过入库。集成覆盖本人可读、成员及管理员拒绝、无效来源和版本拒绝、本人主动入库后成员可读。

### 集成测试隔离

旧集成脚本直接使用共享 API/数据库，临时任务可能被真实 Worker 领取，导致测试人工结束任务后状态再次变化、删除会话偶发返回 409，也可能误提交真实 GPU 推理。

`pnpm test:rail:integration` 现在先构建 API，再创建唯一命名的临时数据库、数据库账号及随机端口 API，应用 001—039 迁移和种子，仅启动 CPU 报告 Worker。模拟 ComfyUI Worker 限定到明确任务 ID，以无关任务哨兵验证隔离。结束时清理自己的进程、数据库和账号，不回退到共享业务数据库。连续两轮成功均为隔离后的结果。

CI 配套生成临时 MinIO 凭据。环境须有 `CREATE DATABASE` / `CREATE ROLE` 权限及可访问的 MinIO；生产 API 仍执行安全配置校验，没有跳过认证或弱化门禁。

### AI Toolkit 构建与文件路由

原 `ignoreBuildErrors: true` 掩盖了 17 个路由或页面的参数类型问题。现按 Next 异步参数规则修复，取消跳过类型检查，增加独立 `typecheck` 和真实测试。文件、图片、音频路由统一还原 catch-all 参数，保留编码绝对路径、分段路径和中文文件名，原资源路径授权保留。可选 macOS 温度传感器在 Linux 的打包问题也已处理。

### 测试入口与部署配置

Presenton Web 原命令可在零测试时成功。现有 8 项真实测试覆盖导出归属、路径越界、布局 TSX 与不安全 schema，分类测试命令指向实际文件；提取导出权限逻辑但保持行为。

主平台修复默认偏好快照、sortable mock 顺序及表单异步断言。报告渲染条件改为清晰等价分支，通过真实 DOCX/PPTX/Markdown 集成验证。

根 Compose 与服务器模板不再要求管理员邮箱和已废弃 SMTP 设置，保留 Mailpit 兼容服务与持久卷。同步源默认使用脚本所在的当前项目，避免搬迁后同步旧路径；虚拟环境、`images/` 等既有排除规则有效，没有加入 `--delete-excluded`。

## 浏览器验收与清理

独立临时用户和项目用于登录、项目创建、设计分类、缺图提交保护、训练基础及专业参数、问号说明、服务不可用时禁止训练，以及 390px 设计/训练布局检查，不修改用户原会话或资料。

真实 DOCX 模板报告完成并在资产中心可见。真实 ComfyUI 图片经原生拖拽填入局部重绘和 AI 助手附件，未自动发送或入库，原图仍未保存。检查时控制台无 error。附件填入不代表 Qwen-VL 分析已成功。截图见 [本轮证据目录](evidence/2026-10-09/system-regression/)。

临时账号、项目、任务和关联已删除，两个存储对象已清理。ComfyUI 测试原文件移至 `/tmp/rail-system-regression-cleanup.w0k9dC/Flux2-Klein_00423_.png`，临时目录仍存在时可恢复；截图保留。隔离集成数据库与账号均已清理，未删除用户资产、既有数据库或持久卷。

## 发布前仍需验证

当前 AI Toolkit、vLLM、Presenton 未同时运行。发布前仍需真实 Flux2 LoRA 训练、Qwen-VL 文字及图片分析、Presenton 调用 Qwen-VL 的三格式 AI 报告、全部 GPU 工作流推理及取消恢复。本轮没有切换 GPU 模式或关闭当前 ComfyUI。

AI Toolkit UI 缺少可直接运行的 ESLint 配置，`npm run lint` 进入交互式初始化，未计为通过。还需并发/容量压力、显存峰值、故障重启恢复、新 Docker 镜像构建、离线部署和目标双卡服务器验收。历史记录保留，但不代替本轮未执行项。

## 回归命令

主平台执行 `pnpm lint`、`pnpm typecheck:rail`、`pnpm test:rail`、`pnpm test:unit`、`pnpm test:rail:integration`、`pnpm build:rail`；集成命令自行构建 API 和启动隔离进程。根目录执行 `npm run test:deployment`。AI Toolkit `ui/` 执行 `npm test`、`npm run typecheck`、`npm run build`；Presenton 根目录和 `servers/nextjs/` 分别执行 `npm test`，Web 执行 `npm run build`。Python 按子项目依赖执行；缺失的 ComfyUI 测试插件安装在临时目录，未修改生产依赖。
