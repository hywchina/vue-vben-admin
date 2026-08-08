# 平台 API 共享层

本目录按职责分为四层：

- `domain/`：资产、项目访问、AI 助手、审计、通知和外部能力契约等平台业务规则。
- `identity/`：当前身份、平台角色、密码、令牌和刷新会话。
- `http/`：请求元数据、Cookie、参数校验、统一响应和错误映射。
- `infrastructure/`：配置、PostgreSQL、对象存储、邮件和健康检查。

根目录中的同名 TypeScript 文件是兼容导出层，用于保持现有 API 路由、脚本和 Nitro 自动导入稳定。新增实现应进入对应分层目录，不应继续在根目录新增平铺业务实现。

依赖方向为：

```text
api/v1 -> domain / identity / http -> infrastructure
                         domain -> identity / infrastructure
```

领域层不能依赖具体 API 路由，基础设施层不能依赖领域层。外部能力只能实现 `domain/capabilities/adapter.ts` 中的平台语义契约，不能向浏览器暴露厂商密钥或绕开项目、资产和任务边界。
