# 客运装备内装模块化分区快速设计平台

面向轨道交通客室方案设计的项目协作与智能能力集成平台。本仓库包含可独立部署的 Web、平台 API、数据库迁移、对象存储接入、部署配置、测试和中文交接文档，不是前端演示项目。

## 当前能力

- 用户名密码认证、注册、企业邮箱找回密码、刷新会话与账号管理
- 管理员/普通用户两级角色、项目范围隔离和后端权限校验
- 项目、资产、版本、任务台账、通知和审计日志
- 首页六项快捷入口、跨项目个人设计检索与项目内多轮设计会话
- 客室零部件、CMF、客室效果三类设计上下文及真实工作流复用
- 登录后全局 AI 助手、用户级会话隔离与附件对象存储
- PostgreSQL 持久化、MinIO/S3 私有对象、预签名上传与下载
- Linux、macOS、Windows 源码运行及单机 Docker 部署

大模型、ComfyUI、LoRA 和报告生成属于外部能力。未配置适配器时平台会返回明确错误，不会用静态数据伪造执行成功。

## 项目逻辑架构

```mermaid
flowchart TB
    USER["平台用户<br/>管理员 / 普通用户 / 项目成员"]

    subgraph EXPERIENCE["一、统一门户与交互层"]
        direction LR
        WORKBENCH["9. 工作台与统一门户<br/>六项快捷入口 · 跨项目统计<br/>最近会话 · 任务趋势 · 最近成果"]
        SHELL["统一平台外壳<br/>导航 · 当前项目 · 通知<br/>用户菜单 · 全局 AI 助手"]
    end

    subgraph ACCESS["二、身份与权限域"]
        IAM["1. 身份与访问管理<br/>登录注册 · 邮箱找回密码<br/>用户资料 · 头像 · 密码<br/>admin/user · RBAC<br/>owner/editor/viewer"]
    end

    subgraph CORE["三、核心业务域"]
        direction LR

        PROJECT["2. 项目与协作管理<br/>创建 · 编辑 · 搜索 · 排序<br/>置顶 · 切换 · 软删除<br/>成员邀请 · 移除 · 贡献统计<br/>项目级数据隔离"]

        ASSET["3. 项目资产管理<br/>8 类统一资产<br/>多级目录 · 收藏 · 版本<br/>上传 · 预览 · 下载<br/>移动 · 复制 · 软删除<br/>来源与任务血缘"]

        DESIGN["4. 设计会话与工作空间<br/>零部件 · CMF · 客室效果<br/>多轮会话 · 多应用组合<br/>提示模板 · 参数草稿<br/>遮罩 · 分区 · 扩图<br/>Markdown · 三维查看"]

        CAPABILITY["5. 智能能力与工作流管理<br/>应用目录 · 输入输出契约<br/>参数 Schema · 工作流注册<br/>版本发布 · 停用 · 能力绑定<br/>18 项 ComfyUI 能力"]

        JOB["6. 任务执行与结果管理<br/>任务创建 · 参数快照<br/>排队 · 运行 · 取消 · 重试<br/>状态与错误追踪<br/>输入输出血缘<br/>结果暂存 · 选择目录保存"]
    end

    STAGED["工作流暂存结果<br/>项目内可见但尚未进入资产中心"]
    SAVED["已登记项目资产<br/>可下载 · 可追踪 · 可跨应用复用"]

    subgraph ASSISTANCE["四、智能辅助与平台治理域"]
        direction LR

        ASSISTANT["7. AI 设计助手<br/>个人私有对话<br/>文本与多媒体附件<br/>外部模型转发<br/>历史记录 · 预览 · 下载<br/>失败状态持久化"]

        GOVERNANCE["8. 通知与审计治理<br/>站内通知 · 已读 · 清空<br/>页面访问 · API 请求<br/>关键业务动作审计<br/>角色与操作者快照<br/>敏感内容脱敏"]
    end

    subgraph SERVICE["五、平台服务与执行层"]
        direction LR

        WEB["Vue Web<br/>Vue 3 · Vben · Ant Design Vue<br/>Pinia · Vue Router"]

        API["平台 API<br/>Nitro / H3 · Zod<br/>身份校验 · RBAC<br/>项目范围校验 · 事务<br/>统一响应 · Request ID"]

        WORKER["ComfyUI Worker<br/>数据库租约 · 任务抢占<br/>提交 · 轮询 · 取消<br/>重试 · 幂等输出登记"]

        ADAPTER["外部能力适配层<br/>模型地址和密钥隔离<br/>协议转换 · 超时处理<br/>稳定错误码"]
    end

    subgraph DATA["六、数据与存储层"]
        direction LR

        PG[("PostgreSQL 17<br/>用户 · 权限 · 项目 · 资产元数据<br/>设计会话 · 任务 · 通知<br/>审计 · AI 对话 · 工作流版本")]

        S3[("MinIO / S3 私有桶<br/>图片 · 视频 · 音频 · 文档<br/>三维模型 · 模型文件<br/>压缩包 · AI 附件")]

        SMTP["企业 SMTP / Mailpit<br/>密码重置邮件"]
    end

    subgraph EXTERNAL["七、外部智能能力"]
        direction LR
        COMFYUI["ComfyUI 服务<br/>GPU · 模型 · 自定义节点"]
        LLM["大模型服务<br/>OpenAI / GeekAI 兼容协议"]
        FUTURE["可扩展能力<br/>LoRA 训练 · 报告生成<br/>其他算法服务"]
    end

    subgraph OPS["八、平台运维与基础设施"]
        OPERATIONS["10. 平台运维与基础设施<br/>数据库迁移 · 种子初始化<br/>live / ready 健康检查<br/>开发与生产 Docker Compose<br/>Nginx · CI 质量门禁<br/>配置校验 · 备份恢复 · 监控告警"]
    end

    USER --> SHELL
    SHELL --> WORKBENCH
    SHELL --> IAM
    IAM -->|"身份、平台角色和项目权限"| PROJECT

    WORKBENCH -->|"聚合展示"| PROJECT
    WORKBENCH -->|"聚合展示"| ASSET
    WORKBENCH -->|"聚合展示"| DESIGN
    WORKBENCH -->|"聚合展示"| JOB

    PROJECT -->|"建立协作及隔离边界"| ASSET
    PROJECT -->|"创建项目设计过程"| DESIGN
    ASSET -->|"选择输入素材"| DESIGN
    DESIGN -->|"选择应用和业务参数"| CAPABILITY
    CAPABILITY -->|"固定工作流版本和执行契约"| JOB
    DESIGN -->|"创建具体执行任务"| JOB
    ASSET -->|"提供受控输入资产"| JOB

    JOB -->|"Worker 生成输出"| STAGED
    STAGED -->|"用户明确确认"| SAVED
    SAVED -->|"登记到资产中心"| ASSET
    ASSET -->|"深化设计"| DESIGN

    SHELL --> ASSISTANT
    ASSISTANT -. "可关联项目，但对话属于个人" .-> PROJECT
    GOVERNANCE -. "记录请求和关键动作" .-> PROJECT
    GOVERNANCE -. "记录资产操作" .-> ASSET
    GOVERNANCE -. "记录会话和执行事件" .-> DESIGN
    GOVERNANCE -. "任务通知与审计" .-> JOB
    ASSISTANT -. "消息状态与失败留痕" .-> GOVERNANCE

    WEB --> API
    API --> IAM
    API --> PROJECT
    API --> ASSET
    API --> DESIGN
    API --> CAPABILITY
    API --> JOB
    API --> ASSISTANT
    API --> GOVERNANCE

    API --> PG
    API -->|"预签名上传、下载和对象校验"| S3
    API --> SMTP
    JOB --> WORKER
    WORKER --> PG
    WORKER --> S3
    WORKER --> ADAPTER

    ADAPTER --> COMFYUI
    ADAPTER --> LLM
    ADAPTER -. "统一适配器契约" .-> FUTURE
    ASSISTANT --> ADAPTER

    OPERATIONS -. "部署和保障" .-> WEB
    OPERATIONS -. "部署和保障" .-> API
    OPERATIONS -. "部署和保障" .-> WORKER
    OPERATIONS -. "备份与就绪检查" .-> PG
    OPERATIONS -. "备份与就绪检查" .-> S3

    classDef experience fill:#eff6ff,stroke:#2563eb,color:#172554,stroke-width:1.5px;
    classDef identity fill:#f5f3ff,stroke:#7c3aed,color:#2e1065,stroke-width:1.5px;
    classDef core fill:#fff7ed,stroke:#ea580c,color:#431407,stroke-width:1.5px;
    classDef governance fill:#f0fdf4,stroke:#16a34a,color:#052e16,stroke-width:1.5px;
    classDef service fill:#f8fafc,stroke:#475569,color:#0f172a,stroke-width:1.5px;
    classDef data fill:#fdf2f8,stroke:#db2777,color:#500724,stroke-width:1.5px;
    classDef external fill:#fefce8,stroke:#ca8a04,color:#422006,stroke-width:1.5px;
    classDef result fill:#ecfeff,stroke:#0891b2,color:#083344,stroke-width:1.5px;
    classDef ops fill:#f1f5f9,stroke:#334155,color:#0f172a,stroke-width:1.5px;

    class WORKBENCH,SHELL experience;
    class IAM identity;
    class PROJECT,ASSET,DESIGN,CAPABILITY,JOB core;
    class ASSISTANT,GOVERNANCE governance;
    class WEB,API,WORKER,ADAPTER service;
    class PG,S3,SMTP data;
    class COMFYUI,LLM,FUTURE external;
    class STAGED,SAVED result;
    class OPERATIONS ops;
```

## 仓库结构

| 路径 | 用途 |
| --- | --- |
| `apps/web-antd/` | 实际产品 Web，Vue 3 + Ant Design Vue |
| `apps/platform-api/` | 平台 REST API、迁移、种子与集成验收 |
| `packages/` | Web 实际依赖的共享布局、表单、权限、状态、请求和基础 UI |
| `internal/` | TypeScript、Vite、Tailwind 与代码规范配置 |
| `deploy/rail-platform/` | 开发和生产 Docker、Nginx、环境模板 |
| `docs/rail-platform/` | 产品、架构、质量、部署、运维与重构记录 |
| `scripts/` | 仓库内部依赖和规范检查工具 |

完整说明见 [仓库结构说明](docs/rail-platform/REPOSITORY_STRUCTURE.md)。

## 本地启动

要求 Node.js `^22.18.0` 或 `^24.12.0`、pnpm `11.16.0`、Docker 与 Compose。

```bash
pnpm install --frozen-lockfile
pnpm dev
```

默认地址：

- Web：`http://localhost:5666`
- API：`http://localhost:5320/api/v1`
- MinIO 控制台：`http://localhost:9001`
- Mailpit：`http://localhost:8025`

初始化账号、环境变量和分步启动方式见 [平台开发入口](docs/rail-platform/README.md)。

## 质量门禁

```bash
pnpm lint
pnpm typecheck:rail
pnpm test:rail
pnpm test:rail:integration
pnpm build
```

## 文档入口

- [产品需求](docs/rail-platform/PRODUCT_REQUIREMENTS.md)
- [系统架构](docs/rail-platform/ARCHITECTURE.md)
- [质量门禁](docs/rail-platform/QUALITY_GATES.md)
- [部署说明](docs/rail-platform/DEPLOYMENT.md)
- [运维手册](docs/rail-platform/OPERATIONS.md)
- [产品路线图](docs/rail-platform/PRODUCT_ROADMAP.md)
- [开发记录](docs/rail-platform/DEVELOPMENT_LOG.md)
- [重构计划](docs/rail-platform/REFACTOR_CORE_MODULE_PLAN.md)
- [重构提交日志](docs/rail-platform/REFACTOR_COMMITLOG.md)

## 技术来源与许可

前端基础框架源自 [Vben Admin](https://github.com/vbenjs/vue-vben-admin) 5.7.0，并在本仓库中保留 `@vben/*` 与 `@vben-core/*` 技术包名以避免无业务价值的全量重命名。产品身份、运行入口、业务代码、API、部署和交接文档均以本平台为准。

本项目沿用 MIT 许可证，详见 [LICENSE](LICENSE)。
