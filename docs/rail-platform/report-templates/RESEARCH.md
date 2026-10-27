# 受控 Word / PPT 生成调研

调研日期：2026-10-27。结论：将“内容生成”与“格式执行”分开；上传的原生 Office 文件作为格式真值，先确认替换位置，再让 AI 输出有结构的内容计划，由程序填入并渲染复核。单纯增加提示词或传一个模板名称，不能证明输出遵循原模板。

## 技术来源与落地

| 来源 | 调研依据 | 本轮采用方式 |
| --- | --- | --- |
| [Microsoft：创建 PowerPoint 模板](https://support.microsoft.com/en-us/powerpoint/create-and-save-a-powerpoint-template) | 模板依赖母版、版式、主题及占位符 | 保留原母版/主题，克隆原生内容版式，不重绘整份 PPT |
| [Microsoft：Word 样式](https://support.microsoft.com/en-us/word/customize-or-create-new-styles) | 字体、段落与标题应通过样式定义 | 保留 styles、页节和页眉页脚，替换指定段落内容 |
| [docxtpl 文档](https://docxtpl.readthedocs.io/en/latest/) | 原生文档填充、循环和图片有明确的结构约束 | 采用显式字段映射与循环块；主平台仍使用 Node 原生 OOXML，不增加 Python 模板服务 |
| [python-pptx：处理既有演示文稿](https://python-pptx.readthedocs.io/en/latest/user/presentations.html) | 可以在已有演示文稿上工作，保留未处理部分 | 保留源包与未修改的母版等部件，不将整页转为不可编辑图片 |
| [pptx-automizer](https://github.com/singerla/pptx-automizer) / [能力边界](https://singerla.github.io/pptx-automizer/limitations) | 原生 PPT 克隆有复杂对象及关系限制 | 记录支持边界与失败检查，不承诺任意模板无损自动改写 |
| [Presenton 自定义模板介绍](https://presenton.ai/custom-template) | 自定义模板与一般自由生成是不同入口 | 本地现有 offline 接口仅兼容 template 参数，故新增独立内容计划接口，不把该参数误当作已遵循原文件 |

没有引入执行用户 Jinja/JavaScript/HTML 的旁路，也没有让 AI 输出任意 Office XML。最终图文页数由输入数量与已确认版式容量共同决定，而不是仅按章节数固定成 6 页或 12 页。

## 可获取的模板来源

| 用途 | 正式来源与入口 | 使用说明 |
| --- | --- | --- |
| 合同 | [国家市场监管总局合同示范文本库](https://htsfwb.samr.gov.cn/) | 按业务类型选择示范文本，保留出处和适用条件，不把通用示例自动当作本项目合同 |
| 技术合同 | [苏州工学院技术合同下载](https://kjc.szut.edu.cn/info/1026/2360.htm)、[西南大学技术合同模板](https://kfy.swu.edu.cn/info/1165/10275.htm) | 页面列出委托开发/转让等 DOCX；应删除真实示例主体和账号信息后再作为平台模板 |
| 专利交底书 | [安徽医学高等专科学校知识产权材料模板](https://www.ahyz.edu.cn/kyb/info/1050/1832.htm) | 页面附件含技术交底书 DOCX；其学校审批、权利人要求有特定适用范围，不能直接照搬 |
| 招投标 | [深圳建设工程招标示范文本通知](https://zjj.sz.gov.cn/xxgk/ztzl/jsjd/fbwb/content/post_12563459.html)、[西城区财政局采购文本入口](https://www.bjxch.gov.cn/xxgk/xxxq/pnidpv996210.html) | 招标文件与投标响应文件不是同一文件；应取其中响应格式并按具体采购项目确认 |
| PPT / Word | [Microsoft 官方预制模板](https://support.microsoft.com/en-au/office/foundations-experiences/download-free-pre-built-templates)、[PowerPoint 模板库](https://powerpoint.cloud.microsoft/create/en/templates/) | 选择项目汇报、方案、图册等结构；POTX 先另存 PPTX，再上传确认位置 |

本轮保留正式来源索引，不将未经许可的第三方文件打入产品镜像。部分学校下载入口实际返回 HTML 下载确认页，未取得真实 Office 文件，不能把该响应记作“已下载 DOCX”；部分政府页面本轮有超时/403。项目自有起始模板可直接在前端下载，来源代码和格式规则随本次版本交付。第三方模板导入后仍需按实际文件确认字段和格式，不能根据网页截图推定已兼容。

## 质量验收方法

1. 用真实资料检查章节与每个图片位置均保留；模板模式正文保持原文，AI 模式保留数字、限定条件与待确认状态。
2. 对比源 Word 的样式、页眉页脚、页节，及 PPT 的母版、主题、文字尺寸和图片区域；不得靠缩小字号掩盖溢出。
3. 渲染实际 DOCX/PPTX，逐页检查换行、留白、段落、图文比例与图片说明。压缩包结构正确或能下载不等于版面合格。
4. 检查权限、并发配置、模板归档、上传 URL 重放和不可变任务快照；检查错误时不会伪造成功或遗漏章节。
5. 所有 AI 语义结论仍需依据原始资料审阅。自动数字/结构检查不能证明没有其他事实错误。
