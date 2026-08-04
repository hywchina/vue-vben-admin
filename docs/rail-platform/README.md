# 轨道客室智能设计平台：开发与复现指南

本目录是二次开发项目的交接入口。当前交付不是前端 Demo：登录、用户、权限、项目、资产、任务、通知、审计和 AI 助手的本地会话层均使用真实平台 API 与持久化存储。ComfyUI、大模型、LoRA 训练、2D 生 3D、报告生成等执行能力仍通过外部服务适配器接入。

## 1. 当前系统组成

| 组成 | 技术 | 当前职责 |
| --- | --- | --- |
| Web | Vue 3、Vite、Ant Design Vue、Pinia | 页面、项目上下文、权限路由、业务交互和全局 AI 助手弹窗 |
| 平台 API | Nitro、TypeScript、Nodemailer | 认证、邮件找回密码、RBAC、项目、资产、任务、通知、审计、AI 会话与外部服务转发 |
| 关系数据库 | PostgreSQL 17 | 用户、密码散列、刷新会话、权限、项目、资产元数据、AI 对话与消息 |
| 对象存储 | MinIO（S3 兼容） | 图片、视频、音频、模型、LoRA、报告以及 AI 对话附件 |
| 开发邮件沙箱 | Mailpit | 接收开发环境的密码重置邮件，不向真实邮箱投递 |
| 本地基础设施 | Docker Compose | 可复现地运行 PostgreSQL、MinIO 与 Mailpit |

任务型外部能力目前只保留应用契约与适配器边界。未配置适配器时，任务会明确记录为失败并返回 `ADAPTER_NOT_CONFIGURED`，不会伪造成功结果。AI 助手的外部 API 调用边界已实现；未配置时仍保存用户消息，并显示明确的“AI 服务待接入”状态。

## 2. 新机器从零启动

### 2.1 前置环境

- Docker Desktop
- Node.js `^22.18.0` 或 `^24.12.0`
- Corepack 与仓库锁定的 pnpm `11.16.0`

```bash
corepack enable
corepack prepare pnpm@11.16.0 --activate
node --version
pnpm --version
docker version
```

### 2.2 安装项目

```bash
git clone <二次开发仓库地址> vue-vben-admin
cd vue-vben-admin
pnpm install --frozen-lockfile
```

如需覆盖开发默认值，先创建平台 API 环境文件：

```bash
cp apps/platform-api/.env.example apps/platform-api/.env
```

生产环境必须修改 `JWT_SECRET`、数据库密码、MinIO/S3 凭据和初始管理员密码，不能使用仓库中的开发默认值。

### 2.3 一键启动

先启动 Docker Desktop，再执行：

```bash
pnpm dev:rail
```

该命令依次完成：

1. 启动并等待 PostgreSQL、MinIO、Mailpit 健康。
2. 按文件名顺序应用尚未执行的数据库迁移。
3. 初始化系统角色、权限、应用目录和首个管理员。
4. 并行启动平台 API 与 Web。

默认地址：

- Web：`http://localhost:5666`
- 平台 API：`http://localhost:5320/api/v1`
- MinIO API：`http://localhost:9000`
- MinIO 控制台：`http://localhost:9001`
- 开发邮件箱：`http://localhost:8025`

电脑重启后的手动恢复方式相同：启动 Docker Desktop，进入仓库，再执行 `pnpm dev:rail`。

## 3. 开发账号、角色与注册

系统只有两种平台角色：`admin`（管理员）和 `user`（普通用户），每个账号必须且只能拥有一个角色。开发环境默认创建以下三个账号：

| 用户名  | 开发默认密码     | 姓名       | 企业邮箱           | 角色    |
| ------- | ---------------- | ---------- | ------------------ | ------- |
| `admin` | `RailAdmin123!`  | 平台管理员 | `admin@rail.local` | `admin` |
| `user1` | `RailUser1!2026` | 普通用户一 | `user1@rail.local` | `user`  |
| `user2` | `RailUser2!2026` | 普通用户二 | `user2@rail.local` | `user`  |

三个账号分别由 `BOOTSTRAP_ADMIN_*`、`BOOTSTRAP_USER1_*`、`BOOTSTRAP_USER2_*` 环境变量配置，完整默认值见 `apps/platform-api/.env.example`。这些密码只用于本机开发，生产部署前必须全部替换。种子脚本确保三个账号存在，并同步引导配置中的姓名、补齐空邮箱；不会覆盖已存在账号的密码或人工调整后的角色。

如需把某个已有开发数据库重新收敛为上述三个账号，应先备份，再运行带显式确认参数的重建脚本：

```bash
docker compose -f deploy/rail-platform/compose.yaml exec -T postgres \
  pg_dump -U rail_platform -d rail_platform -Fc \
  > rail-platform-before-user-reset.dump

pnpm db:rail:migrate
pnpm db:rail:reset-users -- --confirm=DELETE_ALL_USERS
```

重建脚本会删除所有已有账号、会话、个人偏好和账号关联数据，然后创建一个管理员和两个普通用户；已有项目、资产、资产版本和任务的归属会在同一数据库事务中转移给新管理员，并写入一条 `system.users.reset` 系统维护日志。该命令具有破坏性，正式环境不得直接执行。

`ALLOW_SELF_REGISTRATION=true` 时允许内网用户使用用户名、企业邮箱和密码自助注册，新用户固定获得 `user` 角色；设置为 `false` 后只能由管理员流程创建账号。登录方式仅保留用户名与密码。

忘记密码使用企业邮箱完成：用户提交邮箱后，平台通过后端 SMTP 发送一次性重置链接；链接默认 30 分钟失效，成功重置后撤销该账号全部刷新会话。开发环境的邮件统一进入 Mailpit，生产环境应将 `SMTP_*` 配置替换为企业内网邮件系统参数。

## 4. 数据与文件存储

- 用户、角色、权限、刷新会话、项目、成员关系、任务、资产元数据、AI 对话与消息、收藏、通知和审计日志写入 PostgreSQL。
- 文本资产在大小限制内写入 PostgreSQL。
- 图片、视频、音频、3D 模型、LoRA 和报告等文件写入 MinIO/S3 私有桶。
- 上传流程为“平台申请预签名 PUT → 浏览器直传对象存储 → 平台校验对象并完成登记”。
- 下载和图片预览均使用经过身份、权限和项目范围检查的短时预签名 URL。

### 4.1 AI 设计助手

登录后的每个平台页面右下角都有 AI 设计助手入口。它支持历史对话、新对话、文本发送、图片/音视频/文档附件、图片预览、文件下载和清空当前对话。

- `ai_conversations`、`ai_messages`、`ai_attachments` 保存对话、消息和附件元数据。
- 每个查询都由后端强制 `conversation.user_id = 当前用户`。管理员也只能查看自己的聊天正文，不会因为日志全局权限获得他人对话权限。
- 附件使用与资产相同的“申请预签名地址 → 浏览器直传 → API 校验”流程，但与对话绑定，不会自动转换为项目资产。
- 审计日志记录发送、上传和清空的字符数、附件数、文件名与执行结果，不记录聊天正文和文件内容。

外部 AI 服务通过平台 API 环境变量配置，所有密钥都只保留在服务端：

```dotenv
AI_ASSISTANT_API_URL=https://ai.internal.example/v1/chat
AI_ASSISTANT_API_KEY=<由部署平台注入>
AI_ASSISTANT_MODEL=rail-cabin-assistant
AI_ASSISTANT_TIMEOUT_MS=60000
AI_ASSISTANT_MAX_ATTACHMENT_BYTES=52428800
```

`AI_ASSISTANT_API_URL` 是可直接接收 `POST` 的完整地址。平台发送用户、项目、对话与最近 50 条已完成消息；附件以短时可读的签名 URL 传递。外部服务应返回以下任一 JSON 结构：

```json
{ "content": "AI 回复正文", "messageId": "optional-upstream-id" }
```

```json
{ "data": { "content": "AI 回复正文", "messageId": "optional-upstream-id" } }
```

如果配置了 `AI_ASSISTANT_API_KEY`，请求会携带 `Authorization: Bearer <key>`。超时、限流、非 2xx 或无效返回都会保存为明确的失败消息，已发送的用户消息不会丢失。

Docker 使用命名卷保存数据，普通重启或 `docker compose down` 不会删除数据。不要对含有正式数据的环境执行 `down -v`。

常用基础设施命令：

| 命令                   | 作用                               |
| ---------------------- | ---------------------------------- |
| `pnpm infra:rail:up`   | 启动 PostgreSQL、MinIO 与 Mailpit  |
| `pnpm infra:rail:down` | 停止容器但保留命名卷               |
| `pnpm infra:rail:logs` | 持续查看基础设施日志               |
| `pnpm db:rail:migrate` | 应用未执行的数据库迁移             |
| `pnpm db:rail:seed`    | 幂等初始化角色、权限、应用和管理员 |

## 5. 权限边界

- 访问令牌短时有效；刷新令牌为 HttpOnly Cookie，数据库仅保存其哈希并在刷新时轮换。
- 密码使用带随机盐的 scrypt 散列，数据库不保存明文密码。
- 普通用户只能访问其参与的项目，管理员按平台角色获得全局管理范围。
- AI 聊天数据不使用管理员全局范围；所有用户都只能读写自己的对话、消息和附件。
- 个人资料页不能修改角色。管理员只能在“用户与权限”中修改其他用户角色。
- 每个账号只能是 `admin` 或 `user`；不能修改当前登录账号自身的角色或状态。
- 平台始终至少保留一名启用状态的管理员，最后一名管理员不能被降级或停用。
- 修改密码后撤销该账号全部刷新会话并要求重新登录。
- 密码重置链接只使用一次，数据库仅保存令牌 SHA-256 摘要；申请接口不泄露邮箱是否存在。

## 6. 操作日志

登录后的“操作日志”入口为 `/audit`，所有用户都可进入，但数据范围由后端强制控制：

- `admin` 可以查看全部管理员、普通用户、匿名认证事件和系统维护事件，也可以按具体账号筛选。
- `user` 只能读取 `actor_id` 等于自身账号编号的日志，即使伪造 `actorId` 查询参数也不会越权。
- 日志保存操作人的用户名、姓名和当时的角色快照，因此账号后来改名、删除或发生角色变化后，历史记录仍能区分；多个管理员会分别显示为“姓名、`@用户名`、管理员”。

统一审计层会记录每个已认证 API 请求（包括读取操作），字段包含请求方法、路径、结果、HTTP 状态、耗时、IP、User-Agent 和 Request ID；项目、资产、任务、用户、角色、资料、密码等写操作还会写入更明确的业务事件；前端路由切换会写入 `page.view`。登录、注册、密码重置和系统维护也有独立事件。

审计边界是“页面访问、API 请求和业务动作”，不会采集鼠标移动、每次点击、键盘输入、密码、令牌、完整请求体或文件正文，避免把敏感数据写入日志。审计写入失败只记录服务端错误，不会用错误的日志结果覆盖业务响应。

## 7. 标准验证

提交或交接前至少执行：

```bash
pnpm lint
pnpm typecheck:rail
pnpm test:rail
pnpm build:rail
```

当前自动化测试包括平台 API 的资产工具、MIME 校验、密码散列、密码重置令牌、两角色模型与审计可见范围，以及 Web 平台状态、项目切换、真实资产登记、管理员角色同步和日志范围状态。

需要真实服务联调时，再验证：

- 注册、登录、刷新和退出登录。
- 使用企业邮箱申请密码重置、在 Mailpit 打开邮件、设置新密码，并确认链接不能重复使用。
- 普通用户无法访问平台管理路由或角色写接口。
- 管理员日志包含不同账号的姓名、用户名和角色快照；普通用户日志只包含自身账号编号。
- 创建项目后刷新页面数据仍存在。
- 上传图片后卡片和详情显示真实内容，下载可用。
- 更新个人资料后刷新仍保留；角色字段只读。
- 用户 1 创建的 AI 对话不出现在用户 2 的历史列表，用户 2 直接请求该对话返回 404。
- AI 消息刷新后仍存在；图片附件可预览，清空后消息、附件元数据和对象文件同时删除。

## 8. 生产部署注意事项

- Web 与 API 应部署在同一可信域名下，通过反向代理将 `/api/v1` 转发到平台 API。
- `S3_PUBLIC_ENDPOINT` 必须是用户浏览器能够访问的对象存储地址；`S3_ENDPOINT` 可以使用仅后端可访问的内部地址。
- PostgreSQL 和对象存储必须分别纳入备份、恢复演练和容量监控。
- 为 API 配置独立的高熵 `JWT_SECRET`，并通过部署系统注入所有密钥。
- 配置企业 SMTP 的 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、账号、密码、发件人和 TLS 校验；生产环境不部署 Mailpit。
- 配置内网 AI 服务的 `AI_ASSISTANT_API_URL`、模型名、超时和密钥；限制外部服务只能读取必要的短时附件 URL，并对聊天数据执行独立保留与删除策略。
- 生产环境建议关闭自助注册，使用管理员创建账号或接入后续企业身份源。

## 9. 文档索引

- [系统架构与 API 边界](./ARCHITECTURE.md)
- [二次开发详细记录](./DEVELOPMENT_LOG.md)
