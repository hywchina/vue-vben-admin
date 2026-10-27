# 本地模板与报告样例

这些文件用于核对本轮版式和原生 Office 模板能力，使用本地合成项目数据。源图片来自项目内的生成客室背景，未使用客户合同数据。AI 示例通过独立 Presenton 镜像和本地 Qwen3-VL 真实推理；模板示例直接采用输入正文。

| 类型 | Word | PPT |
| --- | --- | --- |
| 工程起始模板 | [DOCX](starter-report.docx) | [PPTX](starter-report.pptx) |
| 合同编制参考 | [DOCX](starter-contract.docx) | [PPTX](starter-contract.pptx) |
| 专利交底起始模板 | [DOCX](starter-patent.docx) | [PPTX](starter-patent.pptx) |
| 投标响应编制参考 | [DOCX](starter-bid.docx) | [PPTX](starter-bid.pptx) |
| 模板生成结果 | [DOCX](example-template.docx) | [PPTX](example-template.pptx) |
| 真实 AI 生成结果 | [DOCX](example-ai.docx) | [PPTX](example-ai.pptx) |

起始模板含可替换占位符，供编辑格式后上传确认字段。合同/专利/投标文件的具体业务内容、适用范围及必须章节应依据真实资料和正式模板确认，不能将此通用格式样例当作完整条款或资格承诺。

每个最终文件均经渲染逐页检查。预览位于 previews/，文件摘要见 manifest.json。Office 阅读端仍需有相应合法可用字体；缺字体时可能发生替换。
