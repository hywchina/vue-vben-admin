# 本地模板与报告样例

这些文件用于核对原生 Office 模板能力。Word 文件于 2026-11-22 更新：工程模板采用用户提供的工业设计方案 PDF 的横向版式、封面图与标识，示例报告使用该 PDF 的车辆及客室图片和设计文字；内容、章节与图注保持可编辑。AI Word 示例经独立 Presenton 与本机 Qwen3.5 9B 真实生成内容计划，再由主平台模板渲染。两份 Word 报告各 6 页，已在 Ubuntu LibreOffice 24.2.7.2 及较新渲染器中检查。

PPT 文件保留 2026-10-27 的验证版本：使用本地合成项目资料，AI 示例经独立 Presenton 与本机 Qwen3-VL 真实推理。模板示例均直接采用输入正文。历史 PPT 验证不替代本轮 Word 兼容性检查。

| 类型 | Word | PPT |
| --- | --- | --- |
| 工程起始模板 | [DOCX](starter-report.docx) | [PPTX](starter-report.pptx) |
| 合同编制参考 | [DOCX](starter-contract.docx) | [PPTX](starter-contract.pptx) |
| 专利交底起始模板 | [DOCX](starter-patent.docx) | [PPTX](starter-patent.pptx) |
| 投标响应编制参考 | [DOCX](starter-bid.docx) | [PPTX](starter-bid.pptx) |
| 模板生成结果 | [DOCX](example-template.docx) | [PPTX](example-template.pptx) |
| 真实 AI 生成结果 | [DOCX](example-ai.docx) | [PPTX](example-ai.pptx) |

起始模板含可替换占位符，供编辑格式后上传确认字段。合同/专利/投标文件的具体业务内容、适用范围及必须章节应依据真实资料和正式模板确认，不能将此通用格式样例当作完整条款或资格承诺。

每个最终文件均经渲染逐页检查。封面预览位于 previews/，文件摘要见 manifest.json；本轮详细记录见 [Word 兼容性验证](../../validation/WORD_TEMPLATE_COMPATIBILITY_20261122.json)。Word v3 使用 Noto Sans CJK SC；阅读端缺字体时仍可能发生替换。示例内容用于版式核对，不能替代项目评审。
