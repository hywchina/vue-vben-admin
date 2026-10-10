# V2.5 内部编制依据与版本记录

本文件用于内部维护，不进入正式研究报告。V2.5 依据 2026-09-29 会议意见定向修订 V2.4；必要但材料不足的图例以 M01—M05 就地红色标注。修订不等于专家认可、合同验收通过或全部意见关闭。

## 代码与文档基线

| 字段 | 记录 |
| --- | --- |
| 编制日期 | 2026-10-09，Asia/Shanghai |
| 项目路径 | /home/huyanwei/projects/rail-system/code/vue-vben-admin，真实路径 /data_ssd/projects/rail-system/code/vue-vben-admin |
| 代码分支 | dev-1001 |
| 完整提交 | 5463e2ae0a7555ce0def829e3029fe268f7f4e3e |
| 提交时间 | 2026-10-09T13:30:45+08:00 |
| 提交主题 | feat(project): refine design workflows and strengthen regression coverage |
| 基线复核时间 | 2026-10-09T17:43:15+08:00；交付前再次确认 HEAD 未变 |
| 前版 | V2.4，代码提交 6b047f2e7c29a8184a11678f3419cd5e4f193b32 |
| V2.4 成品 SHA-256 | 958752118f49a18056bb2e72df0d048b53db61050b2cbe5d250e2c2d2bc5407a |
| 改动范围 | 新版源稿、图形、案例派生副本、编制/核验工具、交付件、响应与材料清单、版本登记和开发记录 |
| 发布管理 | 保留全部旧版；仅 V2.5 为当前评审稿；没有 Git 提交或推送 |

开始时已存在下列用户变更，均保留；未将部署实施过程写成已经完成的验收事实：

- 已跟踪：apps/platform-api/api/v1/assistant/conversations/[id]/attachments/uploads.post.ts、apps/platform-api/utils/domain/workflows/repository.ts、docs/rail-platform/DEPLOYMENT.md、docs/rail-platform/DEVELOPMENT_LOG.md。
- 未跟踪：apps/platform-api/utils/domain/workflows/repository-version.test.ts。
- DEVELOPMENT_LOG.md 只增加本次文档记录，保留原部署及其他记录。本轮不修改业务代码、数据库、对象存储或 GPU 运行状态。

## 材料来源与核验边界

| 材料 | SHA-256 | 本版使用方式 |
| --- | --- | --- |
| 合同（26版） | 1c0d1e8df8721f6d86f15787dbf881df9542493338af5445bfe3c6f21b540fa3 | 继承 V2.4 已核验内容及 CONTRACT_REQUIREMENTS_V26.md；本轮未重新全文解析原件 |
| 前版可读技术响应第四版 | 06598659cb5a926840a5843fd137b6785a6d439f253d4c7c92353ad73a92be6c | 继承前版需求和架构依据；最终签认版本仍待确认，不静默替换 |
| 早期桌面技术响应登记 | f429fda7caee0ea4ab19260d383efb137b5033765c598fad857297130ba6a729 | 与前版可读文件不同，差异继续保留，不认定二者相同 |
| 260929会议_文档修改意见汇总.md | f148ddb2807ed6be3541bbbe5bd9e47ca4f1c3060f4a182bf3b9b0126e0df87d | 用户桌面手工清单，本轮全文阅读；对应 S01—S09 |
| 会议最后15分钟 MP4 | 0b9a60a01608e5a9d25290e5054fb26fec5c1e8361d02c818963d04b1b739650 | 前一轮核对录屏、音频及转录，本轮按既有核对结论执行 |
| meeting-review-20260929/transcript.txt | 0fb9c8fb8673359160383d27b2de0dd424887f2a5fad448bf41412be51798c1b | 转录用于理解意见；不代替用户指令或原音频 |

录屏位于 /home/huyanwei/Desktop/260929系统设计阶段性会议对接录屏_最后15分钟.mp4，900 秒；转录位于 /home/huyanwei/projects/work_tools/tmp/meeting-review-20260929/transcript.txt。前轮比较的 PCM 音频一致，校验值为 8f9a07ff98f7739fa0d0c02729b6a8667fc0fd127ab89ac80cf03f275a54a03a。一级标题另起一页是用户额外意见。涉及演示视频或商务的话题未扩展为本轮任务或正式报告内容。原始合同、标书和录屏不复制到仓库。

## 实现依据与案例证据

沿用前版内部证据索引并核对当前工作流及技术栈：前端 workspace/region-annotation.ts、工作流 catalog.ts、region-edit-v1.json、region-marker-edit-v1.json、image-understand-v1.json，后端 assistant/provider.ts、capabilities/comfyui/worker.ts、项目 package.json 与部署定义。路径均属于 apps/web-antd 或 apps/platform-api；详见 V2.4 证据索引，不复制到正式正文。

现有颜色/编号属于人工指代；原图与笔画由 IO_EasyMark 合成参考图，之后尺寸处理并进入 FLUX.2 Klein 编辑。该链路不等于语义识别，也不保证硬遮罩保持。ControlNet 和提示分割作为候选研究路线，不能写成已接入事实。个人 AI 助手仅简述文本/图片问答，仍为 274 个汉字，不调用设计工作流。

案例读取相邻 ComfyUI 既有输出 196、198 的 PNG 元数据，恢复同源原图、指令、笔画及六节点执行关系。生成模型为 flux-2-klein-9b-fp8.safetensors，步数 4；六节点为模型加载、EasyMark、尺寸处理、参考条件组织、采样、保存。原始文件和各派生副本校验详见 CASE_EVIDENCE_V2.5.json。派生 PNG 删除元数据但保持像素，不美化或重画运行结果。

两次结果均有目标范围/保持失败：编号分别要求黄色布料与绿色皮料，却影响整张座椅或同时变绿，编号还残留。报告如实分析，不写成成功质量验证。实际标记参考图、当时原生界面及独立图文理解原始回答仍缺，标为 M05、M04。没有新执行推理、训练、业务测试或现场测评，也未取得耗时、准确率、重复试验或专家评分。

## 原理与图形

本轮复核 SAM、ControlNet 论文和 FLUX.2 官方编辑文档，增加 ComfyUI Nodes 官方文档：

- https://arxiv.org/abs/2304.02643
- https://arxiv.org/abs/2302.05543
- https://docs.bfl.ai/flux_2/flux2_image_editing
- https://docs.comfy.org/basic-concepts/nodes

访问日期为 2026-10-09。文献只支持原理和方法选择，不转写为本项目实测指标。新绘七幅黑白灰概念、原理、实践和五层架构图，使用正交连线；三幅图片来自同源既有案例，其中两幅新图替换原图。全篇顺序编号 23 图、13 表。架构实际技术是 Vue 3/TypeScript/Vite/Ant Design Vue/Vben、Node.js/Nitro/H3、PostgreSQL、MinIO/S3、ComfyUI，不将专家举例 Java/MySQL 当作实现事实。

第五至十二章按仅忽略图号的比较与 V2.4 完全一致；改动集中于前四章及参考资料、目录和分页。M01—M05 的用途、缺失条件和关闭规则见 MISSING_MATERIALS_V2.5.md；逐项意图、依据和状态见 REVIEW_RESPONSE_V2.5.md。

## 排版及可复现验证

采用 documents 技能的原生批注、渲染与逐页复核流程，diagram-design 技能的论文式矢量图布局和边界检查。成品 52 页，目录 14 项、28 个可点击内部链接、63 个标题书签，九条修订说明批注；页面参数、正文固定 24 磅、标题样式、图表编号和目录页码核验通过。七幅新图自检及文字越界检查通过；无障碍检查高/中/低风险均为零。

正文采用指定 A4 和页边距、字体字号及缩进；封面主标题保留 36 磅行距，嵌图段落使用单倍行距避免图片被裁切，非正文行距例外。本机以可用中文字体替代渲染，DOCX 保留宋体/黑体/楷体请求。目标 Word/WPS 字体和渲染环境可能改变分页，应再次检查实际页码。目录是内部链接目录，不是自动 TOC 域；修改后须重新渲染并更新 TOC_V2.5.json。

工具从本文件上两级目录运行，先生成图形/案例，再生成 DOCX；首次渲染后从 PDF 标题导航提取真实页码，更新目录映射并重新生成：

1. python tools/build_figures_v2_5.py；node tools/export_figures_v2_5.cjs。
2. python tools/extract_case_v2_5.py（依赖相邻 ComfyUI 既有输出）。
3. python tools/build_report_v2_5.py。
4. python <documents-skill>/render_docx.py <V2.5.docx> --output_dir <临时目录> --emit_pdf。
5. python tools/audit_report_v2_5.py --pdf <渲染PDF>。
6. python <documents-skill>/scripts/a11y_audit.py <V2.5.docx>；python <diagram-design-skill>/scripts/self_check.py <图形HTML>。

Node 依赖可由 NODE_PATH 指定，Chrome 由 REPORT_CHROME_PATH 指定。渲染中间文件只保存在临时目录，不作为正式交付件。最终源稿/成品校验值及具体统计见 QA_V2.5.json。
