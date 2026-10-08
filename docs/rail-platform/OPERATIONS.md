# 运行、发布与故障处理手册

## 1. 服务状态

| 地址 | 含义 | 失败处理 |
| --- | --- | --- |
| `GET /api/v1/health/live` | API 进程可响应，不访问依赖 | 重启或替换 API 实例 |
| `GET /api/v1/health/ready` | PostgreSQL 和对象存储都可用 | 失败实例不接收流量，按 dependency 排查 |
| `GET /api/v1/health` | 与 ready 相同的兼容入口 | 供既有监控迁移 |

ready 会确保资产桶存在并检查权限；外部 AI 不作为核心流量就绪条件，应独立监控。2026-10-08 起移除忘记密码和邮件服务，不再需要 SMTP 或用户邮箱配置；旧邮箱与重置令牌数据保留，旧页面重定向登录、旧 API 返回 404。忘记密码时由管理员在“用户与权限”重置其他账号密码；登录后仍可自行修改密码。旧 Mailpit 容器和卷为兼容保留，不因代码更新自动删除。

## 2. 环境分级

- 开发：Compose 提供 PostgreSQL、MinIO、Mailpit，允许两个演示用户。
- 测试：独立数据库和桶，执行全部门禁，不复用生产数据。
- 生产：`BOOTSTRAP_DEMO_USERS=false`，建议关闭自助注册；Web/API 同域，密钥由部署平台注入。

生产至少显式配置 `DATABASE_URL`、`JWT_SECRET`、`APP_PUBLIC_URL`、`CORS_ALLOWED_ORIGINS`、`BOOTSTRAP_ADMIN_PASSWORD`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_PUBLIC_ENDPOINT`。缺失、使用开发默认值或 CORS 通配符时 API 拒绝启动。

## 3. 标准发布

1. 选择 CI 通过的提交，记录提交号和迁移清单。
2. 对数据库和对象存储做一致性备份并确认可读。
3. 在生产等价环境迁移并执行烟雾/集成验收。
4. `pnpm build:rail` 构建 Web 和 API，部署后先看 live，再等 ready。
5. 验证登录、项目、文本资产、对象上传和审计，观察错误率/耗时。
6. 记录版本、配置变化、结果、负责人和时间。

迁移采用前向策略。失败时先停止新写入并恢复旧应用；涉及不兼容变更时按演练结果恢复，不在未知状态手工改正式库。

核心模块重构发布需额外记录重构基线 `0c352a574` 和 `REFACTOR_COMMITLOG.md`。本轮没有数据库迁移或配置变化，应用回滚可重新部署基线代码；兼容导出层在本轮保留，调用方不需要同步切换导入路径。回滚后仍必须检查 ready、权限/项目隔离、对象上传和 AI 会话隔离，不能只以进程启动成功作为恢复完成。

## 4. 备份与恢复

### 统一业务编号升级（2026-10-08）

迁移 038 为 15 类业务记录统一分配 `前缀-至少8位流水号`，不加 RAIL；用户编号补足八位、项目编号改为 PRJ，原用户/项目编号保存在 `business_id_aliases`。先备份并在恢复副本预演，发布时暂停写入，先迁移再启动新 API/Worker/Web。UUID、对象键、生成文件名、现有 AST/TSK 与第三方 ID 不变。历史别名不是权限凭证，不可绕过原有成员和用户范围。

回退必须停写、恢复升级前数据库备份并部署对应旧版本应用；仅回退旧 API 可能无法邀请新版用户编号或生成符合约束的用户记录。备份含敏感账号信息，放入受限目录，不提交 Git。验收命令与全部前缀见 [统一业务编号](BUSINESS_IDS.md)。

### 生成资产名称升级与恢复（2026-10-08）

当前规则为 `DSC-00000125-YYYYMMDD-001.ext`，无设计会话的历史/专属实例使用 INS 编号。037 首次建立 UUID 名称与计数器；038 建立业务编号；039 只将真实任务输出自动名称的 UUID 前缀换为对应编号，保留日期、序号、扩展名及计数器。上传/复制件与手动名称不覆盖。升级前暂停旧 Worker 的输出登记并按下文备份数据库；先按顺序迁移，再启动新版 API/Worker。文件不搬迁或重传，不重建存储卷。

039 的升级前后资产名称及全部版本下载名快照保存在 `generated_asset_business_name_history`；037 的 `generated_asset_name_history` 原始快照另行保留，两者都不可在确认前清理。版本 metadata/上游原文件名是历史信息，不作为新名称的运行时来源。

可在已应用 038、尚未应用 039 的恢复副本预演（自动回滚，夹具也回滚；业务序列可留下正常空号）：

```bash
pnpm --filter @rail/platform-api exec node ../../scripts/run-with-env.mjs .env -- tsx scripts/generated-asset-naming-integration-test.ts --preview-migration
pnpm db:rail:migrate
pnpm --filter @rail/platform-api exec node ../../scripts/run-with-env.mjs .env -- tsx scripts/generated-asset-naming-integration-test.ts --verify-history
```

历史核对仅用于刚完成 039 升级的环境，检查每个版本是否符合升级快照（允许被保护的手动名称与下载名不同）。正常用户后续手动修改展示名或添加版本不应被迁移重新覆盖。若需恢复到 039 前的 UUID 名称，先暂停写入并备份当前名称，再由维护人员审查执行以下事务；会覆盖这些历史资产升级后的手动改名，只影响迁移备份中记录的资产/版本，不影响新版新增资产和文件内容。保留计数器，防止未来重用号码，不删除迁移记录或备份表。需要恢复到 037 前的上游原名称时，使用 037 原始快照并单独审查，不混用两次恢复。

```sql
BEGIN;
UPDATE assets a SET name = h.previous_name
FROM generated_asset_business_name_history h WHERE a.id = h.asset_id;
UPDATE asset_versions v SET original_filename = backup.item->>'filename'
FROM generated_asset_business_name_history h,
  LATERAL jsonb_array_elements(h.previous_filenames) AS backup(item)
WHERE v.id = (backup.item->>'id')::uuid;
COMMIT;
```

备份必须同时覆盖 PostgreSQL 和 S3/MinIO；只备份一边会产生无文件元数据或孤立文件。建议暂停写入或使用一致快照，并记录数据库时间、桶快照、应用提交和迁移版本。

开发数据库导出示例：

```bash
docker compose -f deploy/rail-platform/compose.yaml exec -T postgres \
  pg_dump -U rail_platform -d rail_platform -Fc \
  > rail-platform-$(date +%Y%m%d-%H%M%S).dump
```

对象存储使用部署单位认可的快照、复制或 S3 备份工具。恢复必须在隔离环境执行并校验：用户/项目/资产数量、随机文件大小与可下载性、AI 附件、迁移版本和审计时间范围。首次生产数据进入、存储变化和至少每季度演练；未成功恢复的备份不能视为可用。

## 5. 故障处理

- **live 失败**：查进程退出、端口、Node 版本和生产配置，用 Request ID 关联代理/API 日志。
- **database down**：查网络、凭据、证书、连接数和迁移；不得临时放宽数据库权限。
- **storage down**：查 S3 地址、桶、密钥、时间同步和桶权限；依赖恢复后探针会重试。
- **元数据有但对象丢失**：阻止资产作为任务输入，按 `object_key` 核对，从一致备份恢复；不得直接改成成功。
- **疑似越权**：记录时间、用户、项目、Request ID 和路径，冻结相关刷新会话，保留并导出审计现场。

错误响应不得返回堆栈或数据库信息。日志可记 Request ID、路径、状态、耗时、账号快照和对象编号，但不得记录密码、令牌、服务密钥、聊天正文或文件内容。

## ComfyUI Worker 运维（2026-08-08）

- 管理员在“工作流管理”查看最近 Worker 心跳；超过一分钟没有心跳视为异常。
- `ADAPTER_NOT_CONFIGURED`：检查 API 与 Worker 的 `COMFYUI_API_URL` 是否一致且容器网络可达。
- `COMFYUI_SUBMIT_UNKNOWN`：提交确认窗口发生进程或网络中断；系统为避免重复生成不会自动重投，用户确认后重新创建任务。
- `COMFYUI_STATUS_FAILED`：连续状态轮询失败超过重试上限，检查 ComfyUI 进程、反向代理和超时设置。
- `COMFYUI_OUTPUT_MISSING`：检查绑定版本的输出节点/字段是否仍与 ComfyUI API JSON 一致。
- `OUTPUT_REGISTRATION_FAILED`：检查对象存储可用性、输出大小、MIME/扩展名和项目资产约束。
- 停止 Worker 不会删除任务；恢复服务后过期租约会重新被领取。不得通过直接修改任务为成功来处理故障。
