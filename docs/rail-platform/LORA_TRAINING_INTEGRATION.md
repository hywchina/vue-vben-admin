# AI Toolkit LoRA 训练接入

## 1. 接入结论

平台通过后端业务 API 和独立 Worker 接入当前本地 AI Toolkit UI `v0.10.20`，浏览器不直连训练服务器。训练基线来自外部 AI Toolkit 工程中已经本地跑通的 `config/flux2_klein_9b_interior_lora.yaml`：Flux2 Klein 9B、qfloat8、bf16、adamw8bit、flowmatch、LoRA 16/16、磁盘 latent/text embedding 缓存和 safetensors 保存均保持一致。

平台按任务动态替换任务名、基础模型键、项目数据集目录、触发词、步数、Repeat、rank、学习率、分辨率与预览提示词。基础模型是后端白名单参数：`GET /lora/status` 返回不含权重路径的模型目录，创建任务时只接受目录中的稳定键；当前只开放已经实训验证的 `flux2-klein-9b`。用户不能提交模型权重路径、VAE 路径、训练输出路径、GPU 路径或完整 AI Toolkit 配置。

训练页参考 AI Toolkit `jobs/new` 和甲方截图组织为“左侧参数、右侧项目训练集”：基础区提供底模下拉、任务名、Repeat/Epoch 滑杆、总步数、触发词和预览提示词；“专业设置”按训练、样图、优化器、网络、打标和高级设置分类。只读项明确来自已验证模板，不用无后端映射的控件冒充可配置参数。

## 2. 业务流程

1. 用户进入 `/model-training`，选择当前项目已登记的图片，或先上传为项目图片资产。
2. 用户为每张图片填写 caption；Worker 会在缺少触发词时自动在 caption 前追加触发词。
3. 平台 API 校验项目写权限、图片状态、对象版本、重复图片、总容量与 `图片数 × Repeat × Epoch`（20～10000）。
4. 平台写入 `jobs`、`job_inputs` 和 `lora_training_executions`，页面关闭后任务仍继续。
5. Worker 通过 AI Toolkit 创建受控数据集，上传同名图片/`.txt`，按平台任务业务 ID 设置 `job_ref`，创建任务并分别启动任务队列与 GPU 队列。
6. Worker 每 5 秒同步 `queued/running/completed/error/stopped`、step、total_steps 和速度；页面通过平台 API 读取日志和 loss。
7. 完成后 Worker 查询 `.safetensors`，最多登记最后 4 个 checkpoint；文件写入私有 MinIO，登记为 `model` 资产并写入 `job_outputs`、`lora`、`ai-toolkit` 和 `flux2-klein-9b` 标签。

## 3. 平台 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/v1/lora/status` | 检查配置与训练服务可达性并返回安全基础模型目录，不返回地址、Token 或权重路径 |
| `POST` | `/api/v1/lora/trainings` | 创建受控训练任务 |
| `GET` | `/api/v1/lora/trainings/:id` | 查询训练执行摘要 |
| `GET` | `/api/v1/lora/trainings/:id/logs?offset=0` | 增量读取训练日志 |
| `GET` | `/api/v1/lora/trainings/:id/metrics` | 读取 loss 点 |
| `POST` | `/api/v1/lora/trainings/:id/checkpoint` | 请求后续训练步骤保存 checkpoint |
| `POST` | `/api/v1/jobs/:id/cancel` | 通过统一任务接口安全停止训练 |

所有接口先验证平台登录、权限和项目范围。AI Toolkit Token 只保存在平台 API/Worker 环境中；AI Toolkit 返回的绝对文件路径仅保存为内部幂等回执，不返回浏览器。

## 4. 配置与启动

AI Toolkit 生产启动：

```bash
cd /data_ssd/projects/ai-toolkit/ui
AI_TOOLKIT_AUTH='<高强度随机 Token>' npm run build_and_start
```

平台开发环境在 `apps/platform-api/.env` 配置：

```dotenv
LORA_API_URL=http://127.0.0.1:8675
LORA_API_TOKEN=<与 AI_TOOLKIT_AUTH 一致>
LORA_GPU_IDS=0
LORA_DATASETS_ROOT=/opt/ai-toolkit/data/ai-toolkit-lora-datasets
LORA_MODEL_PATH=/data_hdd/data/models/Flux2Klein/unet/flux-2-klein-9b.safetensors
LORA_VAE_PATH=/data_hdd/data/models/flux2-klein-9B/split_files/vae/flux2-vae.safetensors
```

源码开发模式的 AI Toolkit 若运行在 `3000` 端口，应将 `LORA_API_URL` 改为 `http://127.0.0.1:3000`；配置文件变化后必须重启平台 API 和 Worker，页面中的“重新检查”只重新请求状态，不会让旧进程自动加载环境变量。

然后执行迁移并重启平台 API/Worker：

```bash
pnpm db:rail:migrate
pnpm dev:rail
```

`LORA_DATASETS_ROOT` 必须是训练服务器视角的路径，并与 AI Toolkit `DATASETS_FOLDER` 一致。Worker 会优先通过 `/api/settings` 读取实际值；环境变量用于接口不可用时回退。本机已验证 YAML 中的真实用户目录只应写入 Git 忽略的 `apps/platform-api/.env`，不能固化到跨机器模板。

## 5. 稳定错误与限制

| 错误码 | 含义 |
| --- | --- |
| `ADAPTER_NOT_CONFIGURED` | 未配置 `LORA_API_URL` |
| `LORA_DATASET_ASSET_INVALID` | 图片未入库、不可用、跨项目或不是图片 |
| `LORA_DATASET_TOO_LARGE` | 项目训练集超过服务端限制 |
| `LORA_SUBMISSION_FAILED` | 创建数据集、上传、创建任务或启动队列失败 |
| `LORA_STATUS_FAILED` | 连续读取外部状态失败 |
| `LORA_TRAINING_FAILED` / `LORA_TRAINING_STOPPED` | 外部训练失败或意外停止 |
| `LORA_ARTIFACT_MISSING` | 外部完成但没有 safetensors |
| `LORA_ARTIFACT_REGISTRATION_FAILED` | 模型下载、对象存储或资产登记失败 |

AI Toolkit 当前仍是单机内网 Worker：使用全局 Token，部分写操作是 GET，`job_ref` 非唯一，文件下载路由不鉴权，删除任务会递归删除输出目录。平台不开放外部删除接口，也不把文件 URL 交给浏览器。算法效果、GPU 容量、模型许可证和训练服务器备份仍需上线前单独验收。
