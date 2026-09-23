# 平台单镜像部署

一个 `rail-platform` 业务镜像内运行 Nginx/Web、Nitro API、能力任务 Worker，使用 Node 24.16，均以非 root 用户运行。PostgreSQL、MinIO、Mailpit 使用独立基础设施镜像。ComfyUI、AI Toolkit、vLLM、Presenton 是外部能力服务，本 Compose 不启动或重新打包这些项目。

当前整套系统的权威入口是 `rail-system` 根目录 Compose，镜像标签为 `rail-platform:1.0.0`，容器名为 `rail-platform-1`。本目录 Compose 保留用于平台子项目隔离验收，项目名为 `rail-platform-validation`，不要与整套部署同时作为同一份业务数据的入口。

平台不直接加载模型，不挂载 GPU，也不包含 Python 环境或模型权重。4090、3090、RTX 6000D 对本镜像没有差异。显卡分配、CUDA/PyTorch/vLLM 兼容性应在各推理/训练项目配置；平台只配置服务 URL。当前构建目标为 Linux amd64，其他 CPU 架构需要重建及重新验收。

## 本机首次部署

在仓库根目录执行：

```bash
bash deploy/single-image/platform.sh init
# 编辑 deploy/single-image/config.env
bash deploy/single-image/platform.sh build
bash deploy/single-image/platform.sh up
bash deploy/single-image/platform.sh status
```

`init` 依赖 Bash、OpenSSL、GNU sed，只创建不存在的配置，权限 600；随机生成管理员初始密码、JWT 和基础设施凭据。现有部署不能通过重新生成配置更换数据库密码。登录账号见配置中的 `BOOTSTRAP_ADMIN_USERNAME`，密码在私有配置文件中查看，禁止提交 Git。

默认入口 `http://127.0.0.1:18080`，API `/api/v1`，对象存储 `http://127.0.0.1:19100`。首次启动自动执行迁移和种子初始化；启动失败不会开放 HTTP 服务。重启保留数据库卷和对象卷；种子不重置现有密码，但会同步配置中的管理员姓名及工作流目录。升级前应按运维文档备份数据，不能用 `down -v` 代替重启。

正式内网访问应在入口网关配置 HTTPS，并将 `APP_PUBLIC_URL`、CORS 及对象存储公开 URL 统一到相应 HTTPS 地址。生产刷新 Cookie 带 Secure，本机回环 HTTP 验收不代表远程普通 HTTP 的会话刷新可用。

标准 Compose 等价命令：

```bash
docker compose --env-file deploy/single-image/config.env \
  -f deploy/single-image/compose.yaml up -d --no-build --pull never --wait
```

自定义配置文件使用绝对路径：`PLATFORM_CONFIG_FILE=/absolute/path/config.env bash deploy/single-image/platform.sh up`。不需要为了切换地址或硬件资源重建镜像。

## 更换机器时修改的配置

| 配置 | 含义 |
| --- | --- |
| `PLATFORM_BIND_IP`、`PLATFORM_PORT` | 内网访问通常设置 `0.0.0.0` 和业务端口；默认只允许本机访问 |
| `APP_PUBLIC_URL`、`CORS_ALLOWED_ORIGINS` | 浏览器实际访问的协议、域名/IP、端口，CORS 多项用逗号分隔 |
| `S3_PUBLIC_ENDPOINT`、`S3_PORT` | 浏览器和平台容器都能访问的对象存储公开地址；远程部署不能写浏览器自身的 localhost |
| `PLATFORM_CPUS`、`PLATFORM_MEMORY`、`PLATFORM_NODE_OPTIONS` | 平台 CPU、总内存上限和每个 Node 进程堆上限；默认 4 核/6GiB，每个 Node 堆 2GiB |
| `COMFYUI_API_URL` | 平台容器可达的 ComfyUI 根地址，例如共享 Docker 网络中的 `http://comfyui:8188` |
| `AI_ASSISTANT_API_URL`、`AI_ASSISTANT_API_KEY`、`AI_ASSISTANT_MODEL` | vLLM 完整 chat completions 地址、密钥、已部署模型名称 |
| `LORA_API_URL`、`LORA_API_TOKEN`、`LORA_MODEL_PATH`、`LORA_VAE_PATH` | 训练 API 及训练服务视角的模型路径，可按 API 环境模板补充 `LORA_GPU_IDS` 等设置 |
| `REPORT_AI_API_URL` | Presenton 完整生成地址，例如 `http://presenton:80/api/v1/generate-file`；不是 private-office-AI |
| `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASSWORD` | 正式部署填写企业 SMTP；默认 Mailpit 仅为本地验收邮件沙箱 |
| `NODE_IMAGE`、`NPM_REGISTRY`、`BUILD_NODE_OPTIONS` | 仅用于联网构建机器，运行时无需 Node、pnpm 或互联网 |

`config.env` 会作为容器环境配置加载，支持 API `.env.example` 中的其他运行变量。Compose 固定容器内部数据库、对象存储、监听地址；宿主映射端口不影响容器服务寻址。数据库密码在连接 URL 中使用，建议保持初始化生成的十六进制字符串。

容器内的 `127.0.0.1` 指该容器自身。外部能力服务应加入同一 Docker 网络，再填写服务 DNS 名；单纯将宿主回环地址填入容器配置不可用。本次独立验收通过将现有 ComfyUI 容器连接到 `rail-platform-validation_default` 实现互访，使用其容器名和内部 8188 端口。整套系统 Compose 应使用服务名。

GPU 工作流在本次测试中串行执行。正式运行时各外部服务的并发、显存占用和 GPU 分配必须另外配置，本镜像不提供跨服务 GPU 调度。

## 离线交付

联网构建机执行（导出清单解析需 Python 3；目标机启动不需要 Python）：

```bash
bash deploy/single-image/platform.sh export /home/huyanwei/projects/rail-system/images
```

输出 `platform.tar`（一个业务镜像）、`platform-infrastructure.tar`（三个基础设施镜像）、`platform.sha256`、`platform-images.txt`。镜像不包含运行密钥、模型和业务卷数据。迁移已有业务还须另行备份/恢复 PostgreSQL 和 MinIO，镜像导出不能代替数据备份。

目标机事先离线安装 Docker Engine、Compose；复制本目录、私有配置和镜像文件后执行：

```bash
cd /path/to/images
sha256sum -c platform.sha256
docker load -i platform.tar
docker load -i platform-infrastructure.tar
# 编辑目标机 config.env；无需在目标机执行 build。
bash /path/to/deploy/single-image/platform.sh up
```

`up` 禁止拉取和构建，缺少镜像会明确失败。启动不依赖公网；数据库/对象存储地址仍须在内网可达。配置及镜像版本应随交付版本一起保存。

## 运行检查

```bash
curl --fail http://127.0.0.1:18080/api/v1/health/ready
bash deploy/single-image/platform.sh logs
```

镜像健康检查同时检查 Web、API、Worker 进程和数据库/对象存储就绪状态。Supervisor 自动重启异常退出进程；Docker 的 unhealthy 状态本身不会触发容器自动重启，需要监控告警或运维处理。停止使用 `platform.sh stop`，数据卷保留。

真实工作流测试工具为 `apps/platform-api/scripts/deployment-smoke.ts`，通过公网端口请求平台、上传及下载对象，并串行执行 18 个工作流和 3 种模板报告。工具须在可访问验收数据库的开发环境执行，创建并清理本轮专属测试账号/项目，不能直接在生产库做发布探针。模拟 Worker 协议集成测试运行期间必须停止常驻 Worker，避免抢占任务。验证结果见 `docs/rail-platform/SINGLE_IMAGE_VALIDATION.md`。
