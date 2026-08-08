# 轨道客室智能设计平台贡献指南

## 开始前

- 日常开发基于 `dev` 分支，先阅读根目录 `AGENTS.md` 和 `docs/rail-platform/` 中与任务相关的文档。
- 业务数据必须来自平台 API 和持久化存储，不得用静态数组或本地缓存伪造成功。
- 外部能力必须经后端适配器接入，未配置时返回明确错误。
- 不得提交真实密码、密钥、Cookie、令牌、数据库数据、对象存储文件或本机环境文件。

## 开发流程

1. 明确角色、项目范围、API 契约、失败路径、审计事件和验收用例。
2. 从 `dev` 创建主题分支，提交保持小而可追溯。
3. 同步修改代码、测试、迁移和中文文档。
4. 提交前运行与改动相关的检查，合并前完成项目质量门禁。
5. Pull Request 合并目标为 `dev`；`main` 仅用于稳定基线或发布。

## 提交格式

使用英文 Conventional Commit，例如：

```text
feat(platform): add asset lineage endpoint
fix(auth): enforce last-admin guard
refactor(project): remove unused template views
docs(project): update deployment guide
```

## 完整门禁

```bash
pnpm lint
pnpm typecheck:rail
pnpm test:rail
pnpm test:rail:integration
pnpm build:rail
```
