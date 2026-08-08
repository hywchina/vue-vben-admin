# Git 提交约定

提交标题使用英文 Conventional Commit：

```text
<type>(<scope>): <subject>
```

常用类型：`feat`、`fix`、`refactor`、`test`、`docs`、`chore`、`build`、`ci`。

常用范围：`platform`、`auth`、`assets`、`assistant`、`deploy`、`project`，或仓库内实际包名。标题使用祈使语气，不加句号，不超过提交钩子限制。

示例：

```text
fix(auth): reject disabled accounts
refactor(project): remove unused upstream workspaces
docs(project): explain repository structure
```

破坏性变化在正文或页脚使用 `BREAKING CHANGE:` 说明。不要使用提交正文保存密钥、账号、内部地址或生产数据。
