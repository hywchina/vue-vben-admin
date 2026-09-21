# 平台单镜像验收记录

日期：2026-09-21。范围为 `vue-vben-admin` 子项目，一个 Web/API/Worker 业务镜像；不包含其他四个业务子项目的重新打包与整套系统迁移验收。

## 环境与版本

- Ubuntu 24.04.5、Linux amd64、Node 24.16.0、pnpm 11.16.0、Docker 29.7.2、Compose 5.4.0。
- 本机 GPU 为 RTX 3090 24GB；平台镜像使用 CPU，实际工作流调用现有 ComfyUI 容器，串行执行。目标 RTX 6000D/4090 的推理服务兼容性仍须在目标机独立验证。
- 新建隔离测试栈 `rail-platform-validation`，使用独立 PostgreSQL/MinIO 命名卷，34 个迁移和工作流种子。未复用或清空原平台业务数据。
- 源码服务入口 `127.0.0.1:5320`；容器发布入口 `127.0.0.1:18080`；测试对象存储入口 `127.0.0.1:19100`；ComfyUI 宿主入口 `127.0.0.1:18188`，平台通过共享网络访问容器内部 8188。
- 镜像 `rail-platform:single-image`，ID `sha256:1fbec1c83113c875cb0c33aa9ef77f45db534e17b8a8bb6b2cc8eabfa7bf86f3`，约 154 MiB。

## 验收结果

| 项目 | 结果与边界 |
| --- | --- |
| 类型检查 | `pnpm typecheck:rail` 通过；每个提交钩子的全工作区 `pnpm check:type` 通过 |
| 单元测试 | API 30 文件/108 项，Web 17 文件/65 项，共 173 项通过 |
| 核心集成 | 本地源码与容器发布端口各通过一次，覆盖认证、权限/项目隔离、设计会话、任务、资产、对象存储、AI 会话持久化、审计 |
| Worker 协议集成 | 本地及容器环境各通过；使用模拟 ComfyUI 协议和真实数据库/MinIO，不计入真实服务测试 |
| 真实外部工作流 | 源码及容器两轮均完成 18 项，单次只提交一项任务；平台创建任务、Worker 调用真实 ComfyUI、回流并下载结果 |
| 模板报告 | DOCX、PPTX、Markdown 在本地及容器两轮通过；前端修复重建并重启最终容器后再通过三项 |
| 浏览器 | 最终镜像 Chrome 登录、刷新、主布局、加载遮罩结束、1600×1000 与 390×844 截图通过；控制台错误 0，公网请求 0；截图人工复核 |
| 生产构建 | 镜像内完整 `pnpm build:rail` 通过，Web/API 单次构建；最终镜像 API 入口与 Worker 脚本 SHA-256 与完整工作流验收版本相同 |
| 进程与健康 | 非 root 运行，API/Worker/Web 全部 RUNNING；停止 Worker 后健康脚本退出 1，恢复后退出 0 |
| 配置失败 | 无配置、无网络启动镜像时明确报告生产配置缺失并退出 1，未开放 HTTP |
| 重启 | 停止平台容器后使用禁止构建/拉取的 up 成功恢复 healthy，管理员 ID/用户名保持不变，最终报告任务正常 |
| 镜像内容 | 检查未包含 `.env`、`config.env` 或 safetensors 权重；业务及基础设施分别导出，SHA-256 通过，业务归档重新 load 通过 |
| 规范检查 | 全量 ESLint、Oxlint、Stylelint 通过；本任务文件格式检查通过；`pnpm lint` 被另一项研究报告工作的 8 个既有文件格式问题阻断，保留其修改，未标记全仓门禁通过 |

真实服务烟测使用低分辨率及较少采样步数，结果验证不代表设计效果验收；ComfyUI 可能命中缓存，以下耗时不能作为 GPU 性能指标。核心集成有选择地覆盖关键契约，不声称 108 个路由的所有参数和异常组合均已穷举。

## 容器外逐项结果

| 能力                  | 下载文件数 | 耗时（秒） | 结果 |
| --------------------- | ---------: | ---------: | ---- |
| text-to-image         |          1 |        7.1 | 通过 |
| text-to-image-lora    |          1 |        7.1 | 通过 |
| single-image-edit     |          1 |        7.1 | 通过 |
| screen-capture-edit   |          1 |        7.1 | 通过 |
| multi-image-edit      |          1 |        7.1 | 通过 |
| inpaint-single        |          1 |        7.1 | 通过 |
| inpaint-reference     |          1 |        8.1 | 通过 |
| outpaint              |          1 |        7.1 | 通过 |
| region-edit           |          1 |        7.1 | 通过 |
| region-marker-edit    |          1 |        7.1 | 通过 |
| multiview-to-3d       |          1 |       13.2 | 通过 |
| image-understanding   |          1 |        7.1 | 通过 |
| text-chat             |          1 |        5.1 | 通过 |
| image-upscale         |          1 |        7.1 | 通过 |
| camera-control-single |          1 |       35.4 | 通过 |
| camera-control-multi  |          5 |       79.9 | 通过 |
| image-edit-base       |          1 |       14.1 | 通过 |
| image-edit-kv         |          1 |        9.1 | 通过 |
| report-docx           |          1 |        1.0 | 通过 |
| report-pptx           |          1 |        1.1 | 通过 |
| report-md             |          1 |        1.1 | 通过 |

总计 21 个任务、25 个非空下载文件。另检查图片 PNG 文件头、GLB 文件头和长度、文本 UTF-8，以及 DOCX/PPTX ZIP 完整性和 `[Content_Types].xml`。测试账号、项目、资产和对象仅清理本轮所建内容。

## 本轮发现并修复

1. Worker 协议测试依赖已有业务项目，空库验收失败；改为创建和清理专用项目，并将初始化检查纳入清理保护。
2. 新烟测脚本误将 `/free` 空响应解析为 JSON，以及重复占用多图输入资产；修正空响应和独立资产上传。
3. 生产页面注入历史百度统计脚本；移除后浏览器不再发起公网请求。
4. Web 与共享布局的不同 peer context 产生两份 vue-router，生产登录后布局空白；通过 Vite 去重 Vue/Router/Pinia 修复，并新增生产浏览器回归工具。

## 离线文件与复现

交付位置为 `rail-system/images/`：

| 文件 | 内容/校验 |
| --- | --- |
| `platform.tar` | 一个业务镜像，SHA-256 `5f54c9672ca2dfa99ccab55345c58f8a5c8f1318e815b03b8d107f6e9a4d4329` |
| `platform-infrastructure.tar` | PostgreSQL、MinIO、Mailpit，SHA-256 `505d42d44a62c4a068c20494c422b1b647de35478b7d87584b5073828fa451b8` |
| `platform.sha256` | 两个归档校验清单 |
| `platform-images.txt` | 镜像名称、ID、系统与 CPU 架构 |

部署命令、配置字段、模型边界、HTTPS 与数据备份要求见 [单镜像部署说明](../../deploy/single-image/README.md)。本轮没有将现有生产数据库和对象存储复制到测试栈；镜像导出不是完整数据迁移。

本机原始日志/请求/产物在仓库忽略目录 `.rail-platform-runtime/single-image/`：`integration-resume.log`、`container-integration.log`、`local-smoke*/results.json`、`container-smoke/results.json`、`final-reports/results.json`、`browser-final/results.json`、`browser-final/{desktop,mobile}.png`、`build-final.log`、`lint-final.log`。这些本机证据不进入 Git，本文保留可交付摘要；独立环境配置同样不进入 Git。

复测浏览器示例（需先安装 Playwright 支持的浏览器，或指定已安装的 Chrome）：

```bash
RAIL_WEB_URL=http://127.0.0.1:18080 \
RAIL_BROWSER_EXECUTABLE=/usr/bin/google-chrome \
node scripts/run-with-env.mjs deploy/single-image/config.env -- \
  pnpm exec tsx scripts/platform-container-browser-smoke.ts
```

## 未覆盖的外部能力

- 本轮没有启用 vLLM 推理、Presenton AI 报告或真实 AI Toolkit LoRA 训练；隔离配置中这三个 API URL 保持空值，其未配置状态明确显示，不伪造成功。已有外部容器和数据没有被改造。
- 测试通过的文本对话和图像理解是 ComfyUI 工作流；不能据此声称全局 AI 助手的 vLLM 链路已验证。
- 测试通过的 text-to-image-lora 是加载 LoRA 的推理；不是训练验收。模板报告通过也不代表 Presenton AI 报告通过，报告 AI 服务项目仍为 Presenton。
- 整套系统后续需要按外部服务各自镜像/模型配置启动，再联调上述三条链路，并在目标多卡机器验证显存分配和性能。

工作区中的研究报告 V2.4 文档及素材属于另一项既有工作，未包含在本轮提交；全仓格式失败仅余这些文件，详情保留在 `lint-final.log`。
