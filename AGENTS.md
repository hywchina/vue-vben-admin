# AGENTS.md

## 1. 适用范围与项目定位

本文件适用于仓库根目录及全部子目录，用于约束后续 AI Agent 和开发人员在本仓库中的分析、开发、测试、文档与 Git 操作。

本仓库最初来自 `vbenjs/vue-vben-admin` 的 `main` 分支，现已二次开发为“轨道客室智能设计平台”。它不是前端 Demo，也不是若干页面拼接：登录、用户、权限、项目、资产、任务台账、通知、审计、企业邮箱找回密码和 AI 助手本地会话层都必须使用真实平台 API 与持久化存储。

总体设计原则是“稳定的平台框架 + 可替换的外部能力适配器”：

- 平台框架负责身份、权限、项目上下文、资产、应用目录、任务台账、通知、审计、固定页面外壳和 AI 会话。
- 大模型、ComfyUI 工作流、LoRA 训练、2D 生 3D 和报告生成等能力属于外部服务，只能通过后端适配器接入。
- 外部服务未配置或执行失败时必须返回明确失败，不得用静态数据或假结果伪造成功。
- 一个外部能力的输出只有登记为项目资产后，才能被同一项目内的其他能力复用。

## 2. 开始工作前必须阅读

二次开发文档统一位于 `docs/rail-platform/`。开始任务时按需阅读，涉及跨模块改动时至少先读前四项：

1. `docs/rail-platform/README.md`：当前能力、启动方式、账号、存储和文档入口。
2. `docs/rail-platform/PRODUCT_REQUIREMENTS.md`：产品需求、角色、数据范围和验收基线。
3. `docs/rail-platform/ARCHITECTURE.md`：模块、技术栈、数据模型、数据流和外部边界。
4. `docs/rail-platform/QUALITY_GATES.md`：完成定义、测试分层和发布阻断条件。
5. `docs/rail-platform/DEPLOYMENT.md`：Linux、macOS、Windows 的源码与 Docker 部署。
6. `docs/rail-platform/OPERATIONS.md`：发布、备份、恢复和故障处理。
7. `docs/rail-platform/PRODUCT_ROADMAP.md`：已知缺口和后续优先级。
8. `docs/rail-platform/DEVELOPMENT_LOG.md`：全部二次开发的时间线和验证证据。

事实来源优先级为：当前用户明确需求、实际代码与数据库迁移、部署配置、自动化测试、说明文档。发现它们不一致时，不要静默选择某一份；应核实运行行为，并在同一变更中修正过期代码、测试或文档。

## 3. 仓库结构与职责

| 路径 | 职责 |
| --- | --- |
| `apps/web-antd/` | 实际产品 Web；Vue 3、Vite、Ant Design Vue、Pinia、Vue Router |
| `apps/platform-api/` | 独立平台 API；Nitro/H3、TypeScript、Zod、postgres.js、AWS SDK、Nodemailer |
| `apps/platform-api/api/v1/` | 文件式 REST API，统一挂载在 `/api/v1` |
| `apps/platform-api/migrations/` | PostgreSQL 顺序迁移，是数据模型的重要事实来源 |
| `apps/platform-api/scripts/` | 迁移、种子、账号重建和真实集成验收 |
| `apps/web-antd/src/views/platform/` | 概览、项目、资产、应用工作区、任务、日志、用户权限等页面 |
| `apps/web-antd/src/store/platform.ts` | 平台会话状态和 API 数据缓存，不是业务真值数据库 |
| `apps/web-antd/src/components/assistant/` | 登录后全局 AI 助手弹窗 |
| `apps/web-antd/src/modules/platform/asset-types.ts` | 前端资产文件类型的集中定义 |
| `deploy/rail-platform/` | 开发 Compose、生产镜像、生产 Compose、Nginx 和环境模板 |
| `docs/rail-platform/` | 本项目二次开发、架构、质量、部署与运维文档 |

`apps/web-antd/src/modules/platform/data.ts` 是早期样例常量遗留，不应重新作为运行时数据源。新增业务数据必须来自平台 API。

## 4. 不能破坏的业务规则

### 4.1 用户、认证与权限

- 系统只有 `admin` 和 `user` 两类角色，每个账号必须且只能拥有一个角色。
- 登录方式只保留用户名和密码；企业邮箱仍用于注册信息、个人资料和找回密码。
- 普通用户不能修改角色；管理员只能在用户与权限页面修改其他账号。
- 不能修改当前登录管理员自己的角色或状态，不能降级或停用最后一名启用管理员。
- 前端菜单、按钮隐藏只改善交互，不能代替后端认证、RBAC 和项目范围校验。
- 访问令牌短时有效；刷新令牌使用 HttpOnly Cookie 并在数据库中只保存哈希。
- 密码和重置令牌不得明文存储或写入日志。

### 4.2 项目、资产、应用与任务

- 项目是普通用户的数据隔离边界；所有资产和任务查询都必须校验当前用户的项目范围。
- 资产是各外部能力之间的交换协议；应用通过输入/输出资产契约关联资产，任务记录一次执行。
- 文件类型固定为 `image`、`video`、`audio`、`text`、`document`、`model3d`、`model`、`archive` 八类。
- 遮罩、CMF 材质、LoRA、报告属于业务用途，应使用标签、来源应用和任务血缘表达，不得重新加入文件类型枚举。
- 新增或修改文件类型时，必须同步检查前端集中定义、API MIME/扩展名校验、数据库约束、应用契约、迁移和测试。
- 当前任务模块是可持久化台账，任务型外部执行器尚未完整实现；未配置时必须使用稳定错误码（如 `ADAPTER_NOT_CONFIGURED`），不能伪造输出资产。

### 4.3 AI 助手与审计

- AI 对话、消息和附件按 `user_id` 强制隔离；管理员也不能读取其他用户的聊天正文或附件内容。
- 管理员可以在操作日志中看到所有账号的操作元数据；普通用户只能看到自己的日志。
- 多个管理员必须用姓名、用户名和角色快照明确区分。
- 审计覆盖页面访问、已认证 API 请求和关键业务动作，不采集鼠标移动、每次按键或密码等原始遥测。
- 日志可以记录字符数、附件数、文件名、状态和错误码，不得记录密码、令牌、完整聊天正文、完整请求体或文件正文。

## 5. 数据与部署边界

- PostgreSQL 保存用户、角色、权限、会话、项目、资产元数据、任务、通知、审计和 AI 对话关系。
- MinIO/S3 私有桶保存图片、视频、音频、文档、3D 模型、模型文件、压缩包和 AI 附件。
- 浏览器通过平台 API 申请短时预签名 URL，再直传或读取对象存储；API 必须先校验身份、项目或对话归属。
- 开发环境中 Web 与 API 是本机 Node.js 进程，PostgreSQL、MinIO、Mailpit 由 Docker Compose 运行。
- 生产单机部署中 Web、API、迁移、PostgreSQL 和 MinIO 可全部由 `deploy/rail-platform/compose.production.yaml` 管理；企业 SMTP 和 AI/工作流服务仍是外部依赖。
- Git 只保存代码、迁移、配置模板和文档。PostgreSQL 数据、MinIO 对象、Docker 卷/镜像、`node_modules`、构建缓存、本机 `.env` 和 `/tmp` 备份不在代码同步范围内。
- 不得执行 `docker compose down -v`、删除数据卷或重建账号，除非用户明确授权且已经完成可验证备份。

## 6. 本地环境与常用命令

要求：Node.js `^22.18.0` 或 `^24.12.0`、pnpm `11.16.0`、Docker Desktop/Engine 与 Compose。

如果出现 `env: node: No such file or directory`，先修复当前 Shell 的 Node 安装或 `PATH`，再运行项目命令。不要把某台机器的用户目录或 Codex 缓存路径写入项目脚本和跨平台文档。

```bash
pnpm install --frozen-lockfile
pnpm dev:rail
```

`pnpm dev:rail` 会启动开发基础设施、执行迁移、幂等种子初始化，再并行启动 API 和 Web。默认地址：

- Web：`http://localhost:5666`
- API：`http://localhost:5320/api/v1`
- MinIO API/控制台：`http://localhost:9000` / `http://localhost:9001`
- Mailpit：`http://localhost:8025`

可拆分运行：

```bash
pnpm infra:rail:up
pnpm db:rail:migrate
pnpm db:rail:seed
pnpm dev:rail:web
pnpm --filter @rail/platform-api dev
```

## 7. 标准开发流程

1. 先检查当前分支、工作区状态、相关代码、迁移、测试和文档，不覆盖用户已有修改。
2. 明确角色、数据范围、正常与失败路径、API 契约、数据库影响、审计事件和验收用例。
3. 优先修正根因，复用现有请求、响应、权限、存储和审计工具，不另建旁路实现。
4. 前端不得使用静态数组、`localStorage` 或仅内存状态冒充持久化业务功能。
5. 外部服务地址、密钥和厂商协议只进入 API 配置或适配器，不暴露给浏览器。
6. 对跨表写入使用事务；涉及数据库与对象存储的操作要定义失败清理或补偿路径。
7. UI 改动保持固定平台外壳、当前项目上下文和全局 AI 助手一致；进入应用时只替换工作区内容。
8. 完成功能后同步测试和文档；不能把“代码能编译”当成产品功能已经完成。

### 数据库迁移

- 已有 `001` 至 `009` 迁移视为已在环境中应用，不得为新需求改写历史迁移。
- 新变更创建下一个顺序迁移（当前应从 `010_*.sql` 开始），并保证可在已有数据上升级。
- 迁移必须考虑约束、索引、旧数据转换、回滚/恢复策略和种子脚本兼容性。
- `pnpm db:rail:reset-users -- --confirm=DELETE_ALL_USERS` 是破坏性维护命令，未经明确授权和备份不得运行。

## 8. 测试与完成定义

开发中先运行与改动直接相关的测试；交付前原则上执行完整门禁：

```bash
pnpm lint
pnpm typecheck:rail
pnpm test:rail
pnpm test:rail:integration
pnpm build:rail
```

- API 单元测试与纯函数测试放在 `apps/platform-api/**/*.test.ts`。
- Web 平台状态测试目前入口为 `apps/web-antd/src/store/platform.test.ts`。
- 跨 PostgreSQL、MinIO、用户隔离和权限边界的变更必须运行真实集成验收。
- 登录、表单、上传预览、弹窗、退出和响应式等 UI 改动必须在真实浏览器中验证，并检查控制台错误。
- 集成测试使用唯一测试数据并只清理本轮创建的数据，不得清空开发或生产数据。
- 任何身份绕过、跨用户/跨项目读取、明文密钥、敏感正文入日志、迁移失败或外部适配器伪成功都属于发布阻断问题。

交付说明必须区分：已实现并验证、仅预留契约、尚未实现、因环境未验证。不得把路线图或页面占位描述成已经可用的后端能力。

## 9. 文档与变更记录

所有项目交付文件必须留在本仓库中。仓库旁的 `frontend-demo` 仅曾用于视觉参考，除非用户明确要求，否则不得修改或作为运行时依赖。

每次实质性二次开发至少更新：

- `docs/rail-platform/DEVELOPMENT_LOG.md`：记录需求、实现、迁移、验证结果和已知限制。
- 影响架构、部署、权限、数据模型或验收标准时，同步更新对应的 `ARCHITECTURE.md`、`DEPLOYMENT.md`、`PRODUCT_REQUIREMENTS.md`、`QUALITY_GATES.md` 或 `OPERATIONS.md`。
- 新增环境变量时同步更新 `apps/platform-api/.env.example`、生产环境模板和部署文档；示例中只能使用占位值。

文档应使用中文，代码标识、提交标题和稳定错误码使用英文。不要记录真实密码、密钥、Cookie、令牌或可访问生产数据的地址。

## 10. Git 协作规则

本项目约定的远程和分支关系：

```text
origin/dev    -> hywchina/vue-vben-admin 的二次开发分支
origin/main   -> Fork 保留的官方基线分支
upstream/main -> vbenjs/vue-vben-admin 官方主分支
本地 dev      -> 跟踪 origin/dev，日常开发使用
本地 main     -> 跟踪 upstream/main，只用于获取官方基线
```

- 开始工作前运行 `git status`、`git branch -vv` 和 `git remote -v`；新机器不能盲目假设远程名称已经正确。
- 二次开发提交到 `dev`，不得把项目改动推送到 `upstream`。
- 不使用强制推送，不重写已共享提交，不用破坏性命令丢弃用户改动。
- 上游更新必须作为独立任务评估、合并和回归，不能在普通功能提交中顺手同步大量官方变更。
- 提交标题使用简洁的英文 Conventional Commit，例如 `feat(platform): ...`、`fix(auth): ...`、`docs(project): ...`。
- 推送前确认工作区干净、本地 `dev` 与 `origin/dev` 的提交关系明确，并检查没有真实环境文件或密钥进入 Git。

## 11. 任务交接清单

完成任务前确认：

- 需求和范围已经落到真实代码，而不是只改页面或样例数据。
- 后端身份、角色和资源范围校验完整，失败路径可解释。
- 数据库迁移、对象存储、事务/补偿和审计已按需要覆盖。
- 目标测试、类型检查、规范检查、集成验收和生产构建已按风险执行。
- 文档和 `DEVELOPMENT_LOG.md` 已更新，所有交付物位于仓库内。
- 未修改无关文件，未删除用户数据，未提交密钥或本机运行产物。
- 最终说明列出改动文件、验证命令与结果、迁移/部署要求及仍存在的外部依赖。
