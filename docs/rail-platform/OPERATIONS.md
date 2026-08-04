# 运行、发布与故障处理手册

## 1. 服务状态

| 地址 | 含义 | 失败处理 |
| --- | --- | --- |
| `GET /api/v1/health/live` | API 进程可响应，不访问依赖 | 重启或替换 API 实例 |
| `GET /api/v1/health/ready` | PostgreSQL 和对象存储都可用 | 失败实例不接收流量，按 dependency 排查 |
| `GET /api/v1/health` | 与 ready 相同的兼容入口 | 供既有监控迁移 |

ready 会确保资产桶存在并检查权限；邮件和外部 AI 不作为核心流量就绪条件，应独立监控，避免邮件故障导致全站下线。

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

## 4. 备份与恢复

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
