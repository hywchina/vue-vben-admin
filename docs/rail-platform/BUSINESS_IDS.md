# 统一业务编号（方案 A）

2026-10-08 起，平台对外业务编号采用 `类型前缀-至少8位流水号`，不添加 `RAIL-`，不带年份。例如 `USR-00000001`、`PRJ-00000001`。编号由 PostgreSQL 持久化序列分配，按类型独立递增；事务回滚或删除会留下空号，不能回收或重排。超过八位继续增长，不能截断。不同独立数据库之间不保证编号全局唯一。

| 业务记录                   | 前缀 | 数据表                       |
| -------------------------- | ---- | ---------------------------- |
| 用户                       | USR  | users                        |
| 项目                       | PRJ  | projects                     |
| 设计会话                   | DSC  | design_conversations         |
| AI 助手会话                | AIC  | ai_conversations             |
| 任务（含生图、训练、报告） | TSK  | jobs                         |
| 资产                       | AST  | assets                       |
| 资产版本                   | ASV  | asset_versions               |
| 资产目录                   | FLD  | asset_folders                |
| 工作流定义                 | WFL  | workflow_definitions         |
| 工作流版本                 | WFV  | workflow_versions            |
| 历史应用会话实例           | INS  | workflow_workspace_instances |
| AI 消息                    | MSG  | ai_messages                  |
| AI 附件                    | ATT  | ai_attachments               |
| 站内通知                   | NTF  | notifications                |
| 审计记录                   | AUD  | audit_events                 |

## 两层标识，不替换主键

- 数据库 `id` 与所有外键继续使用 UUID。API 的 `id`、`userId`、`projectId`、`conversationId`、`assetId`、路由参数与权限校验也继续使用 UUID。
- 业务编号统一保存为数据库 `public_id`，API 的资源记录使用 `publicId`；关联展示字段使用 `userPublicId`、`ownerPublicId`、`sourceJobPublicId` 等。成功/删除等仅返回 UUID 的确认响应不要求重复附带编号。
- 项目既有 `code` / `projectCode` 作为兼容字段保留，但其值与规范项目编号相同。工作流 `code` 是语义代码，不改成 WFL 编号；工作流同时拥有 `publicId`。
- 页面保留 UUID 定位资源；项目展示/复制采用规范编号，会话历史显示 DSC/AIC 编号并支持搜索。其余记录在资源查询中提供业务编号，不要求在每张通知或消息气泡上显示编号。Web 可选 `publicId` 只用于兼容旧缓存/旧响应，不由前端临时生成编号。

## 历史升级与兼容

追加迁移 `038_unified_business_ids.sql`，不改写旧迁移。用户旧编号数字后缀保留，补到八位；项目通过现有项目序列分配 PRJ 编号；其余原本没有业务编号的表按创建时间、UUID 顺序分配。已有 AST/TSK 不重新编号，避免破坏 AI Toolkit 的 `job_ref`、Worker 恢复和历史引用。

旧用户编号和项目编号原样保存到 `business_id_aliases(entity_type, legacy_id, entity_id)`，不推算不存在的别名。旧用户编号仍可邀请、调整角色、移除和移交负责人；项目列表提供其可见项目的 `legacyCodes`，工作台项目搜索兼容旧编号。资产搜索兼容旧用户编号。别名解析不是授权：原有管理员权限、项目成员范围和用户会话隔离仍须通过；不得提供不受限的全局别名/资源枚举接口。

数据库唯一索引、格式约束和不可修改触发器保护编号。旧客户端插入项目 `code` 时保存原值为别名，实际项目 `code` 仍使用规范编号；业务记录创建接口不开放用户自定义 `publicId`。

## 不统一为业务流水号的标识

- 认证/刷新会话、JWT、请求追踪 ID、Worker 实例/租约、执行回执、幂等键、临时 UI ID：继续保持现有内部标识。
- 关联表和草稿表：沿用 UUID 外键或组合键，不另加无业务用途的编号。
- 应用 key、能力 code、角色 code、权限 code、参数 key、提示词选项 key：保持稳定语义代码。
- ComfyUI 的 `prompt_id`、AI Toolkit 的任务 UUID、Presenton 的任务/演示 UUID、vLLM 的响应 ID：保留第三方协议原值，不改动这些子项目的 ID 格式。
- 对象键、模型目录和上游原文件名保持不变。迁移 038 本身不改文件名；后续迁移 039 将平台生成资产自动名称改为 `DSC-00000125-YYYYMMDD-序号.扩展名`，没有设计会话时使用真实 INS 编号。UUID 继续用于关系与计数器，日期及原序号不变；上传、复制件和手动名称保留。
- 历史审计详情中的旧编号快照：保留原始记录，不批量重写；审计记录本身新增 AUD 编号。

## 部署与验收

先按运维说明备份并恢复到验证副本，再运行迁移。发布时暂停写入、先执行 `pnpm db:rail:migrate`，再启动新版 API/Worker/Web；不要让旧服务继续生成旧格式用户编号。容器更新需重新构建业务镜像，并走现有迁移流程，数据库/MinIO 镜像与卷不用重建。

专项验收：

```bash
pnpm --filter @rail/platform-api exec node ../../scripts/run-with-env.mjs .env -- tsx scripts/business-id-integration-test.ts
```

该脚本验证 15 类历史记录、新建记录、唯一性、序列超过八位、用户别名与编号不可修改；本轮新增测试记录在事务中回滚，序列空号保留。完整集成测试还验证真实 API、对象存储和权限隔离。回退需停写并使用备份恢复数据库与对应旧版本应用；不得仅回退 Web/API 留下格式不匹配的数据库，也不得通过重新编号恢复。
