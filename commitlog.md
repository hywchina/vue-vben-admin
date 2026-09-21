# 平台单镜像提交记录

每项以唯一英文提交标题关联 Git 提交，中文记录动机、范围、注意事项和测试证据。镜像、模型、环境密钥、运行日志及业务数据不提交 Git。

## fix(@rail/platform-api): make training model defaults portable

- 动机：接续模型集中存储改造，移除开发机 `/data_hdd` 私有目录默认值，避免迁移后训练请求仍引用旧机器路径。
- 范围：API 默认配置、开发与生产环境模板、原生产 Compose 和部署文档统一使用 `models/unet`、`models/vae`。
- 注意：路径由 AI Toolkit 解释，必须相对于训练服务工作目录有效，也可配置为训练容器内的绝对挂载路径；平台自身不加载权重。此提交不搬移模型或修改现有私有环境配置。
- 验证：`pnpm typecheck:rail`、`pnpm test:rail` 通过；未以本项验证声称训练任务已完成。
