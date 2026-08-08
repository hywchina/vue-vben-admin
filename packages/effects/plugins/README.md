# @vben/plugins

该包保留平台启动动画所需的 Vue Motion 插件入口。

## 注意

插件必须通过 `subpath` 引入，避免无关依赖进入产品包：

```ts
import { MotionPlugin } from '@vben/plugins/motion';
```

新增第三方插件前必须有明确的平台使用场景，不能恢复模板展示模块。
