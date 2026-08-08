# 仓库结构说明

## 1. 说明目的

本文用于回答“仓库中的目录和文件为什么存在”。判断范围以 Git 跟踪文件为准，不把 `node_modules`、`dist`、`.output`、缓存、日志和本机环境文件视为项目源码。

推荐审计命令：

```bash
tree -a --dirsfirst -I '.git|node_modules|dist|dist.zip|.output|.nitro|.turbo|coverage|.DS_Store|.eslintcache|.stylelintcache'
git ls-files
```

所有保留内容必须归入以下类别之一：产品运行代码、共享运行框架、工程质量工具、部署设施、自动化测试、项目文档或开源许可。

## 2. 根目录与隐藏目录

| 路径 | 作用 |
| --- | --- |
| `.github/actions/setup-node/action.yml` | CI 统一安装 Node、pnpm、缓存和冻结依赖 |
| `.github/workflows/rail-platform-ci.yml` | `dev`、`main` 和 PR 的平台静态、测试、构建与真实集成门禁 |
| `.github/ISSUE_TEMPLATE/` | 平台缺陷和需求建议模板 |
| `.github/contributing.md` | 本项目开发与数据安全协作规则 |
| `.github/commit-convention.md` | 本项目英文 Conventional Commit 约定 |
| `.github/pull_request_template.md` | 平台权限、数据边界、验证和文档检查清单 |
| `.github/dependabot.yml` | npm 与 GitHub Actions 依赖更新 |
| `.vscode/extensions.json` | Vue、TypeScript、Lint、格式化、Tailwind 和 i18n 推荐插件 |
| `.vscode/global.code-snippets` | TypeScript/Vue 通用编码片段 |
| `.vscode/launch.json` | 连接 `http://localhost:5666` 的平台 Web 调试入口 |
| `.vscode/settings.json` | 与仓库 Lint、格式化、Tailwind 和语言包路径一致的编辑器设置 |
| `.browserslistrc` | Web 浏览器兼容目标 |
| `.commitlintrc.js` | 提交标题规范入口 |
| `.dockerignore` | 生产镜像构建排除规则 |
| `.editorconfig` | 跨编辑器基础格式 |
| `.gitattributes`、`.gitconfig`、`.gitignore` | Git 文本、仓库和忽略规则 |
| `.node-version`、`.npmrc` | Node 与 pnpm 安装行为 |
| `.stylelintignore`、`stylelint.config.mjs` | 样式检查 |
| `eslint.config.mjs`、`oxlint.config.ts` | TypeScript/Vue/JSON/YAML 代码检查 |
| `oxfmt.config.ts` | 全仓格式化 |
| `lefthook.yml` | 提交前和提交标题门禁 |
| `vitest.config.ts` | 单元测试工作区配置 |
| `turbo.json` | 工作区构建和类型检查任务图 |
| `package.json` | 项目身份、平台命令和根开发依赖 |
| `pnpm-workspace.yaml`、`pnpm-lock.yaml` | 40 个有效工作区与冻结依赖图 |
| `README.md`、`README.zh-CN.md` | 项目总入口与中文兼容入口 |
| `AGENTS.md` | 开发人员与 AI Agent 的业务、安全、测试和 Git 约束 |
| `LICENSE` | 继承的 MIT 开源许可和上游版权 |
| `cspell.json` | 代码与文档术语拼写规则 |

## 3. 产品应用

### 3.1 `apps/platform-api/`

| 路径 | 作用 |
| --- | --- |
| `api/v1/` | 文件式 REST API；按 applications、assets、assistant、audit-events、auth、health、jobs、notifications、projects、roles、user/users 划分 |
| `middleware/` | 请求审计等 Nitro 中间件 |
| `migrations/` | PostgreSQL 顺序迁移，是数据模型事实来源 |
| `scripts/` | 迁移、种子、账号维护和真实集成验收 |
| `utils/domain/` | 项目、资产、AI、审计、通知和能力适配器领域实现 |
| `utils/identity/` | 密码、令牌、会话和身份规则 |
| `utils/http/` | API 响应、验证和请求辅助 |
| `utils/infrastructure/` | PostgreSQL、对象存储、邮件和运行配置 |
| `utils/*.ts` | 为现有路由和 Nitro 自动导入保留的兼容导出层 |
| `*.test.ts` | API 纯函数、权限、解析和边界测试 |
| `nitro.config.ts`、`tsconfig.json`、`package.json` | API 构建、类型与包入口 |
| `.env.example` | 仅含占位值的开发配置模板 |

### 3.2 `apps/web-antd/`

| 路径 | 作用 |
| --- | --- |
| `public/` | 平台 favicon 和本地 `rail-logo.svg` |
| `src/api/core/` | 认证、用户和后端菜单请求 |
| `src/api/platform/` | 项目、资产、任务、权限、审计、通知和 AI 会话 API |
| `src/components/assistant/` | 登录后全局 AI 助手 |
| `src/components/platform/` | 页面标题、状态标签等平台组件 |
| `src/layouts/` | 认证外壳与登录后固定平台外壳 |
| `src/locales/` | 本应用认证和页面语言扩展 |
| `src/modules/platform/` | 资产类型、状态语义和平台领域类型 |
| `src/router/` | 核心认证路由、平台路由、守卫和后端菜单映射 |
| `src/store/platform/` | 平台状态协调、项目上下文和 API 数据缓存 |
| `src/views/_core/` | 真实登录/注册/找回、403/404 和个人中心 |
| `src/views/platform/` | 概览、项目、资产、应用、工作区、任务、审计、用户权限 |
| `src/adapter/` | Ant Design Vue 与共享表单/组件的项目适配 |
| `src/styles/` | 平台外观和布局样式 |
| `app.vue`、`main.ts`、`bootstrap.ts` | Web 启动、偏好和全局设施注册 |
| `index.html`、`vite.config.ts`、`tsconfig*.json`、`package.json` | HTML、构建、类型和活动包 `@rail/web` 配置 |
| `.env*` | Web 开发/生产公开变量模板，不保存服务密钥 |

## 4. 共享运行框架

`packages/` 来自 Vben Admin 5.7.0 的可复用基础框架，但以下包均被 `@rail/web` 或其传递依赖实际使用，不是备用演示应用。

| 包目录 | 本项目用途 |
| --- | --- |
| `@core/base/design` | CSS 变量、主题和设计令牌 |
| `@core/base/icons`、`packages/icons` | Iconify 图标组件 |
| `@core/base/shared` | 跨包纯工具与常量 |
| `@core/base/typings`、`packages/types` | 路由、菜单、用户和全局配置类型 |
| `@core/composables` | Vue 通用组合式状态 |
| `@core/preferences`、`packages/preferences` | 布局、主题和平台偏好管理 |
| `@core/ui-kit/form-ui` | 登录、资料和平台表单引擎 |
| `@core/ui-kit/layout-ui` | 页面与平台框架布局 |
| `@core/ui-kit/menu-ui` | 权限菜单渲染 |
| `@core/ui-kit/popup-ui` | Modal、Drawer 等弹层基础 |
| `@core/ui-kit/shadcn-ui` | Button、Input 等底层 UI |
| `@core/ui-kit/tabs-ui` | 登录后标签页 |
| `effects/access` | 前后端访问模式下的路由和权限生成 |
| `effects/common-ui` | 本项目使用的认证、个人中心、403/404 与通用表单组件 |
| `effects/hooks` | 应用配置、水印、设计令牌等组合式能力 |
| `effects/layouts` | 登录后主布局、通知、偏好和用户菜单 |
| `effects/plugins` | 平台启动与页面过渡使用的 Vue Motion 插件入口 |
| `effects/request` | Axios 请求客户端、刷新和错误处理 |
| `constants` | 路由和访问常量 |
| `locales` | 框架公共中英文文案 |
| `stores` | 身份、权限、标签页等 Pinia 基础 Store |
| `styles` | 全局样式和 Ant Design Vue 样式入口 |
| `utils` | 路由、树、文件和浏览器工具 |

每个共享包中的 `package.json` 定义工作区依赖，`src/index.ts` 是公开导出，`*.test.ts` 与 `__tests__/` 验证共享行为。保留 `@vben/*` 名称是为了维持稳定导入契约；产品名称、运行入口和仓库地址不使用上游身份。

## 5. 内部工程工具

| 路径 | 作用 |
| --- | --- |
| `internal/lint-configs/` | Commitlint、ESLint、Oxlint、Oxfmt、Stylelint 共享规则 |
| `internal/node-utils/` | 工程脚本使用的文件、Git、进程和工作区工具；`@changesets/git` 仅用于读取暂存文件，不保留 Changesets 发布流程 |
| `internal/tailwind-config/` | 产品 Web 与共享 UI 的 Tailwind 主题和扫描入口 |
| `internal/tsconfig/` | Node、Vue Web 和库的 TypeScript 基础配置 |
| `internal/vite-config/` | Web/库构建、环境变量、PWA、压缩和应用配置注入 |
| `scripts/vsh/` | Lint、依赖检查和循环引用检查命令 |
| `scripts/turbo-run/` | Turbo 工作区任务调度辅助 |
| `scripts/clean.mjs` | 清理构建缓存与产物，不处理业务数据 |

## 6. 部署与文档

| 路径 | 作用 |
| --- | --- |
| `deploy/rail-platform/compose.yaml` | 开发 PostgreSQL、MinIO、Mailpit |
| `deploy/rail-platform/compose.production.yaml` | 单机生产编排 |
| `deploy/rail-platform/Dockerfile` | Web/API 生产镜像 |
| `deploy/rail-platform/nginx.conf` | 静态 Web 与 API 反向代理 |
| `deploy/rail-platform/.env.production.example` | 生产占位配置模板 |
| `docs/rail-platform/README.md` | 开发与文档导航 |
| `PRODUCT_REQUIREMENTS.md` | 产品角色、范围和验收基线 |
| `ARCHITECTURE.md` | 数据模型、模块、数据流和外部边界 |
| `QUALITY_GATES.md` | 完成定义与阻断条件 |
| `DEPLOYMENT.md`、`OPERATIONS.md` | 部署、备份、恢复和故障处理 |
| `PRODUCT_ROADMAP.md` | 已知缺口和后续优先级 |
| `DEVELOPMENT_LOG.md` | 二次开发时间线与验证证据 |
| `REFACTOR_*.md` | 本轮重构计划、盘点和逐提交记录 |
| `COMFYUI_WORKFLOW_API_INTEGRATION_PLAN.md` | 后续外部工作流适配器设计，不是运行时依赖 |

## 7. 已明确退出的内容

- 旧 Nitro Mock 服务和静态假接口
- Ant Design Vue Next、Element Plus、Naive UI、TDesign 的独立 Web
- Playground、Dashboard/Demos 页面和共享展示组件
- VitePress 上游文档站、Changesets 发布流和上游 GitHub 自动化
- 验证码、二维码、钉钉和第三方登录
- 上游 About、商业推广、在线预览、赞助与社交图标
- 本机绝对路径、上游演示账号和 Vben 产品元数据

若后续 `tree` 出现无法归入本文类别的新目录，应先确认调用、数据和部署边界，再决定纳入项目或删除。
