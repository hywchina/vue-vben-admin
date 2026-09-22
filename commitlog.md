# 平台单镜像提交记录

每项以唯一英文提交标题关联 Git 提交，中文记录动机、范围、注意事项和测试证据。镜像、模型、环境密钥、运行日志及业务数据不提交 Git。

## docs(project): clarify report service boundary

- 动机：整合目录已经移除未接入平台的 `private-office-AI`，原架构文档仍把它描述为开发机现存项目，容易误解报告生成服务归属。
- 范围：明确平台 AI 报告只调用 Presenton，`private-office-AI` 不属于系统源码、模型、镜像或部署范围。
- 验证：文档关键词复核通过；未修改业务代码、接口配置或运行服务。

## docs(deploy): record image validation and offline delivery

- 动机：将实现与实际验证边界落到交付文档，避免把 API 健康或模板报告成功解释成所有外部模型服务已验证。
- 范围：同步架构、部署、质量门禁、项目入口和开发记录；新增完整验收表、21 项容器任务/25 份产物、最终镜像 ID、离线归档校验和复现命令，明确 ComfyUI 缓存/低参数测试的限制。
- 验证：浏览器桌面及窄屏人工复核；PNG/GLB/UTF-8/OOXML 结构检查通过；重启后再次执行三种报告通过；ESLint/Oxlint/Stylelint 全量通过。
- 注意：全仓 `pnpm lint` 仍被另一项研究报告的 8 个文件格式问题阻断，未修改或提交其内容；vLLM 助手、Presenton AI 报告和真实 LoRA 训练本轮未启用，不列为已验收。沿用用户现有功能分支提交，不把其既有业务提交强行合入 dev。

## feat(deploy): package platform services in one image

- 动机：按子项目交付一个平台业务镜像，在企业内网通过配置和 Compose 启动；不把开发机依赖、模型或账号密钥固化到镜像。
- 范围：多阶段 Node 24 镜像构建一次 Web/API，再携带 Worker、迁移和种子运行依赖；非 root Supervisor 管理三进程，Nginx 同源代理，健康检查覆盖三进程和数据库/对象存储。专用 Docker ignore 排除模型、运行目录、私有环境和文档素材。
- 部署：新增四服务 Compose（平台业务镜像加 PostgreSQL/MinIO/Mailpit 基础设施）、配置模板、私有配置忽略规则、初始化/构建/禁止拉取启动/停止/导出脚本。仅初始化缺失配置，密码随机生成；数据使用独立命名卷，停止不删除卷。
- 离线：导出平台镜像和基础设施镜像两个归档及 SHA-256/镜像 ID 清单；内网机器 load 后直接 up，无需 Node、pnpm、Python、CUDA 或联网构建。导出端清单解析使用 Python 3。
- 验证：构建成功；容器外核心集成、18 个串行真实工作流、三种模板报告成功；Worker 停止时健康检查失败、恢复后通过；无效配置在开放 HTTP 前失败；重启后管理员标识不变。平台归档重新导入通过，两个归档校验通过。
- 注意：平台不负责外部 GPU 服务资源调度；正式远程访问配置 HTTPS。镜像导出不包含 PostgreSQL/MinIO 数据和模型，完整业务迁移需另行备份恢复；模板报告不等于 Presenton AI 生成验证。

## fix(@rail/web): share router instances in production builds

- 动机：容器外 API 正常但生产登录后页面空白，控制台报 `Cannot read properties of undefined (reading 'beforeEach')`；取证发现 Web 与共享布局使用了两个不同 peer context 的 vue-router，依赖注入键不一致。
- 范围：Web Vite 配置对 Vue、Router、Pinia 统一去重，保持共享布局与入口使用同一实例；新增独立浏览器部署烟测，检查登录、刷新、主页面、加载遮罩消失、桌面/窄屏截图、浏览器异常及外部请求。
- 验证：实际生产镜像在 Chrome 中通过上述检查；桌面 1600×1000、窄屏 390×844 截图人工复核，页面内容及布局可见，错误和外部请求均为零。类型检查通过。
- 注意：没有通过捕获异常或跳过布局掩盖问题；浏览器测试使用隔离验收环境的管理员，凭据只由环境变量传入，不写结果文件。

## fix(@rail/web): remove external production analytics

- 动机：真实生产浏览器验收发现 HTML 在加载生产配置后注入百度统计，企业内网部署仍会尝试访问公网。
- 范围：移除入口 HTML 的历史统计脚本，保留平台自身服务端审计与操作日志，不修改业务页面或用户数据。
- 验证：重建生产镜像后，浏览器登录及刷新期间阻断非平台/对象存储地址，外部请求为零；原统计地址不再出现在构建入口。

## test(@rail/platform-api): verify deployment workflows sequentially

- 动机：发布前必须从平台入口验证任务、真实外部工作流、对象存储和结果下载，不能用 ComfyUI 直连成功代替整条平台链路成功。
- 范围：新增串行部署烟测工具，可选择工作流/模板报告套件和恢复起点；创建专属账号、项目及独立输入资产，清理仅限本轮数据；活动任务未结束时保留现场。修正原 Worker 协议测试依赖已有业务项目、初始化失败不释放模拟服务的问题，改为独立测试项目。
- 验证：全新隔离数据库上的核心集成和模拟 Worker 集成通过；本地 API/常驻 Worker 到真实 ComfyUI 的 18 项能力逐个通过，三种模板报告通过，均实际下载非空产物。API/Web 共 173 项单元测试通过。
- 注意：测试使用低分辨率和较少步数验证连通与产物，不评价设计质量；模板报告不代表 Presenton AI 报告通过。测试会调用 ComfyUI 卸载模型，执行前检查队列为空，须在专用验收窗口运行。需要开发机依赖和验收库访问权限，不用于生产健康探针。

## fix(@rail/platform-api): make training model defaults portable

- 动机：接续模型集中存储改造，移除开发机 `/data_hdd` 私有目录默认值，避免迁移后训练请求仍引用旧机器路径。
- 范围：API 默认配置、开发与生产环境模板、原生产 Compose 和部署文档统一使用 `models/unet`、`models/vae`。
- 注意：路径由 AI Toolkit 解释，必须相对于训练服务工作目录有效，也可配置为训练容器内的绝对挂载路径；平台自身不加载权重。此提交不搬移模型或修改现有私有环境配置。
- 验证：`pnpm typecheck:rail`、`pnpm test:rail` 通过；未以本项验证声称训练任务已完成。
