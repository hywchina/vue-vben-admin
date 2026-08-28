# 跨平台部署手册

> 适用系统：Linux、macOS、Windows 10/11。
>
> 目标：另一台电脑只拿到代码和本文档，即可完成安装、启动、验证、重启、升级和备份。项目基线：Node.js 24.16.0、pnpm 11.16.0、PostgreSQL 17.6、MinIO、Nitro、Vue 3。

## 1. 先选择部署方式

本项目提供两种部署方式。不要混用两种方式的启动命令。

### 方式 A：源码开发/验收部署

适合开发人员在自己的电脑上修改代码、调试接口和验收页面。

| 模块 | 部署位置 | 启动方式 | 默认端口 |
| --- | --- | --- | --- |
| Vue Web 页面 | **本地电脑 Node.js 进程** | `pnpm dev:rail:web`，一键命令会自动启动 | 5666 |
| Nitro 平台 API | **本地电脑 Node.js 进程** | `pnpm --filter @rail/platform-api dev`，一键命令会自动启动 | 5320 |
| PostgreSQL | **Docker 容器** | `compose.yaml` | 5432 |
| MinIO 对象存储 | **Docker 容器** | `compose.yaml` | 9000、9001 |
| Mailpit 开发邮箱 | **Docker 容器** | `compose.yaml` | 1025、8025 |
| 用户、项目、资产、应用、任务、日志、AI 聊天 | **Web/API 内的业务模块** | 随本地 Web/API 运行，数据写入 Docker 数据库/对象存储 | 不单独占用端口 |
| 企业 SMTP | 不使用 | Mailpit 代替 | — |
| AI 推理、ComfyUI 工作流、LoRA 训练 | **平台外部进程** | 通过服务端 API 地址接入，可与平台运行在同一 Linux 主机 | 由外部服务决定 |

也就是说，源码方式下 Docker 只负责数据库、文件存储和测试邮箱；前端与平台 API 仍在本地 Node.js 中运行，修改代码后可以热更新。

为避免 Linux 开发机直接访问 Docker Hub 超时，开发 Compose 中 PostgreSQL 和 Mailpit 使用 DaoCloud 的 Docker Hub 前缀镜像；镜像版本、容器环境、端口和数据卷均保持不变。MinIO 继续使用 Quay 官方镜像。生产 Compose 的镜像来源不受此开发环境调整影响。

### 方式 B：Docker 单机内网部署

适合在一台长期运行的 Linux、macOS 或 Windows 主机上供内网用户访问。使用 `compose.production.yaml`。

| 模块 | 部署位置 | 是否对外开放 |
| --- | --- | --- |
| Web 静态页面与 Nginx 反向代理 | **Docker 容器 `web`** | 是，默认 8080 |
| Nitro 平台 API | **Docker 容器 `api`** | 否，只允许 `web` 容器访问 |
| 数据库迁移与初始化 | **一次性 Docker 容器 `migration`** | 否，执行成功后退出 |
| PostgreSQL | **Docker 容器 `postgres`** | 否，不映射宿主机端口 |
| MinIO 对象存储 API | **Docker 容器 `minio`** | 是，默认 9000，供浏览器直传/预览 |
| MinIO 管理控制台 | **Docker 容器 `minio`** | 仅本机 127.0.0.1:9001 |
| 用户、项目、资产、应用、任务、日志、AI 聊天 | **`web` + `api` 内的业务模块** | 通过 Web 入口使用，不是独立容器 |
| Mailpit | **正式 Compose 不部署** | — |
| 企业 SMTP | **公司现有邮件服务器** | 平台 API 通过 `SMTP_*` 连接 |
| AI 推理、ComfyUI 工作流、LoRA 训练 | **独立外部服务** | 平台 API 通过适配器调用 |

Docker 正式方式只要求目标机器安装 Docker，不要求宿主机安装 Node.js 或 pnpm；Node.js 和前端构建过程都在镜像内完成。

这里要区分“业务模块”与“可部署进程”：资产中心、应用中心、任务中心等都是同一套 Web/API 中的逻辑模块，不需要分别启动容器。其结构化数据和关联写入 PostgreSQL，图片、视频、AI 附件等文件写入 MinIO。AI 聊天窗口、历史和附件属于本平台；只有模型推理和专业工作流是外部 API。

## 2. 文件用途

| 文件 | 作用 |
| --- | --- |
| `deploy/rail-platform/compose.yaml` | 源码开发模式的 PostgreSQL、MinIO、Mailpit |
| `deploy/rail-platform/compose.production.yaml` | 单机正式模式的 Web、API、迁移、PostgreSQL、MinIO |
| `deploy/rail-platform/Dockerfile.production` | 构建 API、Web 和迁移镜像 |
| `deploy/rail-platform/nginx.production.conf` | SPA 路由、API 反向代理和 Web 安全响应头 |
| `deploy/rail-platform/.env.production.example` | 正式环境变量模板 |
| `apps/platform-api/.env.example` | 源码开发模式的 API 配置示例 |

所有命令都在仓库根目录执行，即能看到根目录 `package.json` 的目录。

## 3. 通用准备

### 3.1 建议硬件

仅运行平台框架、不在本机运行模型时，建议至少：

- 4 核 CPU。
- 8 GB 内存；构建镜像时建议 12 GB 以上。
- 30 GB 可用磁盘，加上实际上传的图片、视频和模型容量。
- 固定内网 IP；正式提供给其他用户时不建议使用会变化的 DHCP 地址。

### 3.2 获取代码

推荐使用纯英文且不包含空格的目录，能减少 Windows 工具链和第三方脚本的路径兼容问题。

macOS/Linux：

```bash
git clone <项目仓库地址> rail-platform
cd rail-platform
```

Windows PowerShell：

```powershell
git clone <项目仓库地址> C:\projects\rail-platform
Set-Location C:\projects\rail-platform
git config --global core.longpaths true
```

如果通过压缩包交付，解压后直接进入包含 `package.json`、`apps`、`deploy` 的目录。

### 3.3 安装并检查 Docker

- macOS：安装并启动 Docker Desktop。
- Windows：安装 Docker Desktop，使用 WSL 2 后端，并确认 Docker Desktop 已启动。
- Linux：安装 Docker Engine 和 Docker Compose Plugin，确保当前账号有权执行 Docker。

三种系统都执行：

```text
docker version
docker compose version
```

两条命令必须都成功，且 `docker version` 必须同时显示 Client 和 Server。只有 Client 时表示 Docker 服务尚未启动。

## 4. 方式 A：源码开发/验收部署

### 4.1 安装 Node.js 和 pnpm

安装 Node.js 24.16.x。仓库也允许 Node.js 22.18 以上的 22.x，但建议优先使用 `.node-version` 指定的 24.16.0。

检查：

```text
node --version
npm --version
```

如果出现 `env: node: No such file or directory`，说明终端找不到 Node.js。重新安装 Node.js，关闭并重新打开终端，直到 `node --version` 成功后再继续。

安装项目锁定的 pnpm：

```text
corepack enable
corepack prepare pnpm@11.16.0 --activate
pnpm --version
```

如果系统没有 Corepack，可以使用：

```text
npm install --global pnpm@11.16.0
```

### 4.2 安装依赖

```text
pnpm install --frozen-lockfile
```

不要删除 `pnpm-lock.yaml`，也不要直接使用 npm 或 yarn 安装本仓库依赖。

### 4.3 可选配置

开发默认值可以直接运行。如需连接自己的 SMTP、修改账号或外部 AI 地址：

macOS/Linux：

```bash
cp apps/platform-api/.env.example apps/platform-api/.env
```

Windows PowerShell：

```powershell
Copy-Item apps/platform-api/.env.example apps/platform-api/.env
```

编辑 `.env` 后重新启动 API。`.env` 不应提交到 Git。

本机 Docker vLLM 使用宿主机 `18081` 端口时，源码开发模式配置如下：

```dotenv
AI_ASSISTANT_API_URL=http://127.0.0.1:18081/v1/chat/completions
AI_ASSISTANT_API_KEY=<与 vLLM --api-key 一致>
AI_ASSISTANT_MODEL=qwen3-vl-8b-instruct
AI_ASSISTANT_TIMEOUT_MS=60000
AI_ASSISTANT_MAX_IMAGES_PER_MESSAGE=4
AI_ASSISTANT_MAX_IMAGE_BYTES_PER_REQUEST=20971520
```

图片由平台 API 从私有对象存储读取并作为 Data URL 发送给 vLLM，因此 vLLM 容器不需要访问 `localhost:9000`。修改上述配置后必须重启平台 API。

报告页面默认可使用内置模板生成。启用独立 AI 报告服务时追加：

```dotenv
REPORT_AI_API_URL=http://127.0.0.1:5001/api/v1/generate-file
REPORT_AI_TIMEOUT_MS=600000
REPORT_AI_MAX_OUTPUT_BYTES=104857600
REPORT_AI_TEMPLATE=general
```

源码开发时可使用宿主机 `127.0.0.1`；生产 Compose 中必须把 URL 改为 API/Worker 容器可访问的服务名或宿主机地址。图片由 Worker 从私有对象存储读取后，以 multipart 文件上传给外部服务。配置变更后需同时重启 API 和 Worker。

本机 ComfyUI 使用 HTTPS 时可追加：

```dotenv
COMFYUI_API_URL=https://127.0.0.1:8188
COMFYUI_API_TOKEN=
NODE_EXTRA_CA_CERTS=/absolute/path/to/comfyui-local-ca.crt
COMFYUI_API_TIMEOUT_MS=60000
COMFYUI_POLL_INTERVAL_MS=2000
COMFYUI_WORKER_LEASE_SECONDS=90
COMFYUI_MAX_OUTPUT_BYTES=268435456
```

`NODE_EXTRA_CA_CERTS` 必须指向签发 ComfyUI 服务证书的 CA 文件，不能填写服务端私钥，也不要通过关闭 TLS 校验绕过证书问题。开发脚本会先加载 `.env`，再启动 API、数据库脚本和 Worker 子进程，确保 Node.js 在 HTTPS 初始化前读取该变量。

AI Toolkit LoRA 服务按外部工程中的 `config/flux2_klein_9b_interior_lora.yaml` 已验证配置接入时追加：

```dotenv
LORA_API_URL=http://127.0.0.1:8675
LORA_API_TOKEN=<与 AI_TOOLKIT_AUTH 一致；开发服务未启用鉴权时可留空>
LORA_GPU_IDS=0
LORA_DATASETS_ROOT=/opt/ai-toolkit/data/ai-toolkit-lora-datasets
LORA_MODEL_PATH=/data_hdd/data/models/Flux2Klein/unet/flux-2-klein-9b.safetensors
LORA_VAE_PATH=/data_hdd/data/models/flux2-klein-9B/split_files/vae/flux2-vae.safetensors
LORA_API_TIMEOUT_MS=120000
LORA_POLL_INTERVAL_MS=5000
LORA_WORKER_LEASE_SECONDS=180
LORA_MAX_DATASET_BYTES=2147483648
LORA_MAX_OUTPUT_BYTES=1073741824
```

平台 Worker 会优先读取 AI Toolkit `/api/settings` 返回的 `DATASETS_FOLDER`，确保上传目录和训练配置的 `folder_path` 一致；`LORA_DATASETS_ROOT` 是该请求不可用时的受控回退值。开发端口通常是 `3000`，`build_and_start`/生产端口通常是 `8675`，按实际启动方式填写。训练服务只能在可信内网被平台 API/Worker 访问，不应直接暴露给浏览器或公网。

### 4.4 一键启动

确保 Docker 已启动，然后执行：

```text
pnpm dev:rail
```

Linux 环境推荐使用根目录管理脚本完成环境检查和后台启动：

```bash
chmod +x ./rail-platform.sh
./rail-platform.sh check_env
./rail-platform.sh start
./rail-platform.sh status
```

脚本会自动读取 `.nvmrc` 并尝试切换到 Node.js `24.16.0`，随后校验 pnpm `11.16.0`、Docker daemon、Compose、系统工具、依赖和磁盘空间。后台进程 PID 与日志保存在 Git 忽略的 `.rail-platform-runtime/`。每次启动生成独立的 `dev-YYYYMMDD-HHMMSS.log`，日志文件头包含完整启动时间和时区；`dev.log` 是指向本次日志的快捷入口。

命令会按顺序完成：

1. 在 Docker 中启动 PostgreSQL、MinIO 和 Mailpit并等待健康。
2. 执行尚未执行的数据库迁移。
3. 初始化角色、权限、应用目录和开发账号。
4. 在本地同时启动 Nitro API 和 Vue Web。

终端需要保持打开。看到 Web 位于 5666、API 位于 5320 后访问：

- 系统：`http://localhost:5666`
- API 就绪：`http://localhost:5320/api/v1/health/ready`
- MinIO 控制台：`http://localhost:9001`
- Mailpit：`http://localhost:8025`

默认开发账号见 `docs/rail-platform/README.md`。这些账号只用于开发环境。

### 4.5 分步骤启动

一键命令发生问题时，在仓库根目录依次运行：

```text
pnpm infra:rail:up
pnpm db:rail:migrate
pnpm db:rail:seed
```

然后打开两个终端：

终端 1：

```text
pnpm --filter @rail/platform-api dev
```

终端 2：

```text
pnpm dev:rail:web
```

这样可以判断问题属于 Docker 基础设施、数据库迁移、API 还是 Web。

### 4.6 停止与重启

- 停止 Web/API：在运行 `pnpm dev:rail` 的终端按 `Ctrl+C`。
- 停止 Docker 但保留数据：`pnpm infra:rail:down`。
- 电脑重启后：启动 Docker，回到仓库，再执行 `pnpm dev:rail`。

使用管理脚本时：

```bash
./rail-platform.sh status
./rail-platform.sh logs 100
./rail-platform.sh stop
./rail-platform.sh restart
```

如只想停止 Web、API 和 Worker，并让 PostgreSQL、MinIO、Mailpit 继续运行：

```bash
./rail-platform.sh stop --keep-infra
```

不要执行 `docker compose down -v`。`-v` 会删除数据库和对象文件的命名卷。

## 5. 方式 B：Docker 单机内网部署

### 5.1 准备正式配置

macOS/Linux：

```bash
cp deploy/rail-platform/.env.production.example \
  deploy/rail-platform/.env.production
```

Windows PowerShell：

```powershell
Copy-Item deploy/rail-platform/.env.production.example `
  deploy/rail-platform/.env.production
```

编辑 `deploy/rail-platform/.env.production`，必须修改：

- `APP_PUBLIC_URL`：用户打开系统的地址，例如 `http://192.168.1.100:8080`。
- `CORS_ALLOWED_ORIGINS`：通常与 `APP_PUBLIC_URL` 完全相同，不能写 `*`。
- `S3_PUBLIC_ENDPOINT`：用户浏览器可访问的对象存储地址，例如 `http://192.168.1.100:9000`。
- `POSTGRES_PASSWORD`：数据库随机密码。
- `JWT_SECRET`：至少 32 字符的随机签名密钥。
- `S3_SECRET_KEY`：对象存储随机密码。
- `BOOTSTRAP_ADMIN_PASSWORD`：首个管理员密码，至少 12 字符。
- 管理员邮箱和企业 `SMTP_*` 参数。
- `AI_ASSISTANT_API_URL`、`AI_ASSISTANT_API_KEY` 和 `AI_ASSISTANT_MODEL`：生产 API 容器不能使用宿主机 `127.0.0.1:18081`；vLLM 加入同一 Compose 网络后应使用 `http://vllm:8000/v1/chat/completions`。
- `LORA_API_URL` 和 `LORA_API_TOKEN`：必须从 `api` 与 `platform-worker` 容器网络可达；AI Toolkit 使用宿主机服务时不能填写容器自身的 `127.0.0.1`。`LORA_MODEL_PATH`、`LORA_VAE_PATH` 和数据集根目录是训练服务器视角的路径。

不能保留任何 `CHANGE_ME`。API 生产配置校验会主动拒绝开发默认密码、占位值、短密钥、演示用户和通配 CORS。

跨平台生成 64 位十六进制随机值：

```text
docker run --rm node:24-alpine node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

分别生成数据库密码、JWT、MinIO 密码和管理员密码。数据库密码建议只包含字母、数字、横线和下划线，避免 URL 编码问题。

### 5.2 确认内网地址和端口

- Linux：`hostname -I`
- macOS：`ipconfig getifaddr en0`，有线网卡可能不是 `en0`
- Windows：`ipconfig`

默认需要开放：

| 端口 | 用途 | 防火墙范围 |
| --- | --- | --- |
| 8080/TCP | 系统 Web | 允许目标内网用户 |
| 9000/TCP | 图片/视频等对象直传和预览 | 允许目标内网用户 |
| 9001/TCP | MinIO 管理台 | Compose 仅绑定本机，不应对普通用户开放 |
| 5432/TCP | PostgreSQL | 正式 Compose 不映射，禁止对外开放 |
| 5320/TCP | 平台 API | 正式 Compose 不映射，只由 Nginx 访问 |

如果 8080 或 9000 已占用，在 `.env.production` 修改 `WEB_PORT` 或 `S3_PORT`，同时同步修改公开 URL。

### 5.3 解析配置

以下命令不会启动服务，用于提前发现漏填变量和 YAML 错误：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml config
```

输出中不应出现 `CHANGE_ME`。不要把完整输出发到公开群或工单，因为其中包含密钥。

### 5.4 构建镜像

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml build
```

第一次构建会下载 Node、Nginx、PostgreSQL 和 MinIO 镜像，并安装 monorepo 依赖，耗时取决于网络。后续构建会利用 Docker 缓存。

### 5.5 启动

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml up -d
```

启动顺序由 Compose 控制：PostgreSQL 健康 → migration 执行迁移和初始化 → MinIO 健康 → API ready → Web 启动。

查看状态：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml ps -a
```

正常状态：

- `postgres`、`minio`、`api`、`web` 为 running/healthy。
- `migration` 为 exited (0)。它是一次性任务，成功退出不是故障。

### 5.6 验证

macOS/Linux：

```bash
curl -fsS http://localhost:8080/container-health
curl -fsS http://localhost:8080/api/v1/health/live
curl -fsS http://localhost:8080/api/v1/health/ready
```

Windows PowerShell：

```powershell
Invoke-RestMethod http://localhost:8080/container-health
Invoke-RestMethod http://localhost:8080/api/v1/health/live
Invoke-RestMethod http://localhost:8080/api/v1/health/ready
```

ready 结果必须同时包含：

```json
{
  "database": "up",
  "storage": "up"
}
```

然后从部署机和另一台内网电脑分别访问 `APP_PUBLIC_URL`，使用配置的管理员账号登录，创建测试项目并上传一张图片。图片能够显示，才能证明 9000 端口、S3 地址和 CORS 都正确。

### 5.7 查看日志

全部服务：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml logs --tail=200
```

单个服务：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml logs -f api
```

可将 `api` 换成 `web`、`migration`、`postgres` 或 `minio`。

### 5.8 停止、启动和删除

停止但保留数据：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml stop
```

重新启动：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml start
```

删除容器但保留命名卷：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml down
```

严禁对正式数据执行 `down -v` 或手工删除 `rail-production-postgres`、`rail-production-minio` 卷。

## 6. 更新版本

1. 按第 7 节备份数据库和对象存储。
2. 获取新代码：`git pull --ff-only`，或用新的完整代码包替换旧代码包。
3. 保留原来的 `deploy/rail-platform/.env.production`。
4. 重新执行 `config` 和 `build`。
5. 执行 `up -d`。migration 会先应用尚未执行的迁移。
6. 检查 `ps -a`、ready、登录、项目和图片上传。

建议在 `.env.production` 设置版本，例如 `RAIL_PLATFORM_VERSION=2026.08.04`，便于识别镜像和回滚。回滚前必须确认数据库迁移是否向后兼容；不能只替换旧镜像而忽略数据结构。

核心模块重构分支没有新增数据库迁移、环境变量或端口。升级时仍按原顺序备份、构建和启动；如需回退本轮纯代码重构，可重新构建 `0c352a574` 基线提交对应镜像。回退不会要求恢复数据库或对象存储，但仍应保留升级前一致性备份，并在回退后复核登录、项目切换、资产上传、任务失败码、AI 会话和审计范围。

## 7. 备份与恢复

平台完整备份必须同时包含 PostgreSQL 和 MinIO。只备份数据库会丢失图片/视频，只备份 MinIO 会丢失用户、项目和资产关系。

### 7.1 创建备份目录

macOS/Linux：

```bash
mkdir -p backups
```

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force backups
```

### 7.2 备份 PostgreSQL

下面的方法先在容器内生成二进制备份，再复制出来，避免 Windows PowerShell 重定向损坏文件：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T postgres pg_dump -U rail_platform -d rail_platform -Fc -f /tmp/rail-platform.dump
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml cp postgres:/tmp/rail-platform.dump backups/rail-platform.dump
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T postgres rm -f /tmp/rail-platform.dump
```

### 7.3 备份 MinIO

MinIO 镜像内包含 `mc` 客户端。以下命令把私有桶镜像到临时目录并复制到宿主机：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T minio sh -c 'rm -rf /tmp/rail-objects && mkdir -p /tmp/rail-objects && mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc mirror local/rail-platform-assets /tmp/rail-objects'
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml cp minio:/tmp/rail-objects backups/rail-objects
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T minio rm -rf /tmp/rail-objects
```

备份完成后至少检查数据库备份文件非空、对象目录有内容，并把备份复制到另一块磁盘或备份服务器。

### 7.4 恢复数据

> **危险操作：**以下步骤会删除目标环境的现有数据并用备份替换。先确认当前目录、Compose 项目、备份日期和目标主机，并在隔离测试环境演练。

确认 `backups/rail-platform.dump` 和 `backups/rail-objects` 均存在后，先停止写入：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml stop web api
```

恢复 PostgreSQL：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml cp backups/rail-platform.dump postgres:/tmp/rail-platform.dump
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T postgres dropdb -U rail_platform --if-exists rail_platform
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T postgres createdb -U rail_platform -O rail_platform rail_platform
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T postgres pg_restore -U rail_platform -d rail_platform --exit-on-error /tmp/rail-platform.dump
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T postgres rm -f /tmp/rail-platform.dump
```

精确恢复 MinIO 桶；`--remove` 会删除备份中不存在的目标对象：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T minio rm -rf /tmp/rail-objects-restore
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml cp backups/rail-objects minio:/tmp/rail-objects-restore
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T minio sh -c 'mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mc mb --ignore-existing local/rail-platform-assets && mc mirror --overwrite --remove /tmp/rail-objects-restore local/rail-platform-assets'
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml exec -T minio rm -rf /tmp/rail-objects-restore
```

运行新版数据库迁移，然后恢复服务：

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml run --rm migration
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml start api web
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml ps -a
```

最后按 5.6 节检查 ready，并核对用户、项目、资产数量和随机抽取的文件。没有成功恢复过的备份不能视为有效备份。

## 8. 离线或受限网络部署

推荐在一台能联网且 CPU 架构相同的机器上先构建镜像：

下面命令使用默认镜像标签 `local`。如果 `.env.production` 设置了 `RAIL_PLATFORM_VERSION`，需将三处 `:local` 替换为对应版本标签。

```text
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml build
docker pull postgres:17.6-alpine
docker pull quay.io/minio/minio:RELEASE.2025-06-13T11-33-47Z
docker save -o rail-platform-images.tar rail-platform-api:local rail-platform-web:local rail-platform-migration:local postgres:17.6-alpine quay.io/minio/minio:RELEASE.2025-06-13T11-33-47Z
```

把代码、`.env.production` 和 `rail-platform-images.tar` 复制到目标机：

```text
docker load -i rail-platform-images.tar
docker compose --env-file deploy/rail-platform/.env.production -f deploy/rail-platform/compose.production.yaml up -d --no-build
```

Intel/AMD (`amd64`) 构建的镜像不能直接用于 ARM (`arm64`) 机器。Apple Silicon Mac 与常见 x86 Linux/Windows 之间转移前必须确认架构，或使用 Docker Buildx 构建对应平台镜像。

## 9. 常见问题

### `env: node: No such file or directory`

只影响源码部署，表示 Node 没进入当前终端 PATH。重新安装 Node，重开终端，先让 `node --version` 成功。

### Docker 服务无法连接

启动 Docker Desktop；Linux 检查 Docker daemon 和当前用户权限。不要在 Docker 尚未启动时反复执行 `pnpm dev:rail`。

### 端口被占用

- macOS/Linux：`lsof -i :8080` 或 `ss -lntp | grep 8080`。
- Windows：`Get-NetTCPConnection -LocalPort 8080`。

源码模式端口固定为 5666、5320、5432、9000、9001、1025、8025。正式模式可在 `.env.production` 调整 8080、9000、9001。

### migration exited (1)

执行 `logs migration`。常见原因是 PostgreSQL 未就绪、生产变量仍有 `CHANGE_ME`、JWT 太短、使用了开发默认密码或数据库密码含有未编码的 URL 特殊字符。

### ready 返回 storage down

检查 MinIO 是否 healthy、`S3_ACCESS_KEY/S3_SECRET_KEY` 是否一致、桶权限和容器时间。恢复后 API 无需重启会自动重试。

### 页面能打开但图片上传失败

从用户电脑直接打开 `S3_PUBLIC_ENDPOINT/minio/health/live`。若无法访问，检查 9000 防火墙、公开 IP、端口映射和 CORS；`S3_PUBLIC_ENDPOINT` 不能填写 Docker 内部主机名 `minio`。

### 忘记密码邮件发送失败

检查企业 SMTP 地址、端口、TLS、用户和密码。源码开发模式可在 `http://localhost:8025` 查看 Mailpit；正式 Compose 不包含 Mailpit。

## 10. 部署验收清单

- [ ] 代码提交号和部署时间已记录。
- [ ] `docker compose config` 成功且没有 `CHANGE_ME`。
- [ ] migration exited (0)，其余四个容器 healthy。
- [ ] live、ready 成功，database/storage 都是 up。
- [ ] 管理员登录成功，开发默认密码不能使用。
- [ ] 创建项目、文本资产和图片上传/预览成功。
- [ ] 普通用户不能访问管理员用户管理功能。
- [ ] 企业邮箱找回密码成功。
- [ ] 另一台内网电脑能访问 Web 和对象存储。
- [ ] PostgreSQL 与 MinIO 备份已生成并复制到其他介质。
- [ ] 已记录防火墙、域名/IP、SMTP、外部 AI 地址和负责人。

通过以上检查后，系统框架才算在该机器部署完成。外部 AI、ComfyUI、LoRA 等服务仍是独立模块，需要按照各自部署文档运行，再把服务地址和密钥配置到平台适配器中。

## ComfyUI Worker 部署（2026-08-08）

生产 Compose 新增独立 `platform-worker` 服务，与 Platform API 使用同一数据库、对象存储和 ComfyUI 服务端配置。至少配置 `COMFYUI_API_URL`；如网关要求鉴权，再配置 `COMFYUI_API_TOKEN`。请求超时、轮询间隔、租约时长和输出上限使用 `.env.production.example` 中的 `COMFYUI_*` 变量。

ComfyUI 可以部署在另一台 GPU 主机，但地址必须从 API/Worker 容器网络可达，不能填写只对浏览器或宿主机有效的 `localhost`。升级时先运行迁移，再启动 API 与 Worker；不要启动依赖新表的 Worker 后再补迁移。
