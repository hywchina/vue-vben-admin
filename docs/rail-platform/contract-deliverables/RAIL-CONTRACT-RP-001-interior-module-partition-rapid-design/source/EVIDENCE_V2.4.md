# V2.4 内部编制依据、代码基线与验证记录

本文件仅供项目内部维护，不并入正式研究报告。V2.4 为按 2026-09-17 批注文件修订的评审稿，不表示批注人已经认可或合同验收已经通过。

## 版本基线与工作区

| 字段 | 记录 |
| --- | --- |
| 编制日期 | 2026-09-18，Asia/Shanghai |
| 代码分支 | `codex/client-feedback-white-shell-20260901` |
| 完整提交 | `6b047f2e7c29a8184a11678f3419cd5e4f193b32` |
| 提交时间 | `2026-09-11T09:53:43+08:00` |
| 提交主题 | refactor(project): simplify conversation workspace layout |
| 复核时间 | `2026-09-18T14:23:13+08:00` |
| 上版文档代码基线 | `51c4095ec269cde31b543dd6c8886802a9a8f452` |
| 本轮修改范围 | V2.4 源稿、批注响应、归档原稿、图形、生成/核验脚本、交付件和文档登记；不修改业务代码、数据库或运行配置 |
| 发布管理 | 保留 V1.0—V2.3；只登记 V2.4 为当前；本轮未执行 Git 提交或推送 |
| 成品校验与检查 | 见同目录 `QA_V2.4.json` |

取证开始时工作区不干净。以下为本轮之前已经存在的修改，均保留，不将其当作本轮文档修订或已通过目标环境验收的依据：

- 已跟踪修改：`.gitignore`、`apps/platform-api/.env.example`、`apps/platform-api/scripts/comfyui-worker-integration-test.ts`、`apps/platform-api/utils/infrastructure/config.ts`。
- 未跟踪项：`apps/platform-api/scripts/deployment-smoke.ts`、`commitlog.md`、`deploy/single-image/`、`docs/rail-platform/SINGLE_IMAGE_PLAN.md`。

研究流程事实依据当前已提交的业务与工作流文件核对；未将上述未提交的单镜像部署工作描述为已经完成的生产方案。代码提交与未提交状态同时记录，避免仅用 HEAD 表示整个本机运行环境。

## 原始材料与归档

| 材料 | SHA-256 | 本版使用范围 |
| --- | --- | --- |
| 20260917 批注版 | `f28cc39fba9f015ba456f8c145da46b92e4494b04d103a712ea6c5a22e26791f` | 原文件按字节保留在 `source/review-inputs/20260917_annotated.docx`；9 条批注抽取至 `COMMENTS_20260917.json` |
| 合同（26版） | `1c0d1e8df8721f6d86f15787dbf881df9542493338af5445bfe3c6f21b540fa3` | 正文技术任务、研究方法、技术指标、成果节点及附件技术规格书；原件不复制进仓库 |
| 当前可读技术响应第四版 | `06598659cb5a926840a5843fd137b6785a6d439f253d4c7c92353ad73a92be6c` | 微信文件目录版本；需求、技术路线、分层架构及功能方案 |
| 早期桌面技术响应登记 | `f429fda7caee0ea4ab19260d383efb137b5033765c598fad857297130ba6a729` | 早期登记值；原路径不可读，不能认定与当前文件完全相同 |
| V2.3 DOCX | `85fa9a1af2a45584e814614a5b6ca689d165ec88ad4803abca6a7d1d51168215` | 保留不变，作为上一版本 |

批注版与 V2.3 核对：正文段落与表格内容相同，差异主要在封面日期、版本文字及空段；未发现正文修订插入/删除记录。批注共 9 条，原 ID 为 1、3、9、14、23、25、29、66、68，均由 Hui Li 提出。归档保留原批注及未解决状态。V2.4 使用 9 条新的“修订说明”原生 Word 批注，对应 R01—R09，说明调整位置和仍缺材料；它们不是冒用原批注人的回复或解决标记。

用户同意先依据现有材料形成清单并修订。最终签认技术响应版本仍需项目组确认；若另有版本，应重新核对受影响章节，不能静默替换文件。合同仅作为本项目技术任务和验收边界使用，不在此作法律解释。

## 当前实现证据与重要校正

下列路径相对于项目根目录；代码信息只出现在本内部记录。

| 主题 | 证据位置 | 本版采用的结论 |
| --- | --- | --- |
| 分区工具 | `apps/web-antd/src/views/platform/workspace/region-annotation.ts`；工作流目录 `apps/platform-api/utils/domain/workflows/catalog.ts:697`、`:754` | 颜色与编号由用户赋予，用于表达对象位置与编辑意图，不是自动六类语义识别 |
| 颜色/编号工作流 | `apps/platform-api/workflows/comfyui/region-edit-v1.json`、`region-marker-edit-v1.json` | 原图加 brush_data 进入 IO_EasyMark；其合成图输出索引 1 经尺寸处理，进入 FLUX.2 Klein 条件编辑链路 |
| 标记与遮罩区别 | 上述 JSON 的节点连接，以及本地 EasyMark 节点实现 | EasyMark 可以输出总掩膜和分色掩膜，但这两个工作流没有把它们作为独立掩膜约束接入生成；报告不声称颜色标记具有硬遮罩保持保证 |
| 原图与快照 | `apps/platform-api/api/v1/jobs/index.post.ts:197` 起的输入及标记关联校验 | 历史标记快照不替换平台提交的原图；工作流内部重新合成带标记的模型参考图。“提交原图”不等于模型使用完全未标记图 |
| 执行与资产 | `apps/platform-api/utils/domain/capabilities/comfyui/worker.ts`、资产领域逻辑 | 任务经数据库队列/租约领取，设计结果暂存后由用户确认登记；不将外部成功直接视为工程质量确认 |
| 助手 | `apps/platform-api/utils/domain/assistant/provider.ts` | 个人近期会话的文本与 image_url 输入；非图片附件正文不传入模型；不触发 ComfyUI、训练或报告任务 |
| 业务模式 | 工作区页面、上下文与草稿逻辑，工作流目录 | 三个视觉模式共享可见工作流；模板、参数、结果组织及会话/工作流/模式草稿区分，不写成三个独立算法系统 |
| 首页 | `apps/web-antd/src/views/platform/overview/index.vue` 及其页面组件 | 已移除旧最近任务/资产区；本版功能图更新为概览与快捷入口 |
| 训练、报告与资料 | 现有 LoRA/报告执行器、报告渲染器和资产类型逻辑 | 保留已有支撑能力与文件类型表述，不将其等同于区域识别模型或专业评审 |
| 部署与计划 | 已提交生产部署方案、合同阶段任务；未提交单镜像文件单列 | 按网络/服务/执行/数据/外部能力描述逻辑部署，不宣称本轮完成现场部署或压力测试 |

EasyMark 的本机只读取证依赖为相邻 ComfyUI 仓库：
`/home/huyanwei/projects/rail-system/code/ComfyUI`，HEAD `24257262af2873521da57804ca01b944723daca9`，提交时间 `2026-09-17T14:57:39+08:00`。节点文件 `custom_nodes/ComfyUI-Apt_Preset/NodeBasic/C_viewIO.py` 的 SHA-256 为 `5465d18d8f85fcace05ad2c854287050faf14b1b3ecc764cde79cac2703b10b3`；检查了 IO_EasyMark 输入、合成和返回逻辑。该仓库的 5 个 Manager 缓存 JSON 存在既有修改，本轮未改动；节点文件校验值用于独立固定实际阅读对象，不把主仓库 HEAD 当作所有外部插件版本。

上版“标记快照不替代原图”的资产管理表述继续成立，本版补清下游模型实际使用合成参考图的事实。技术响应中的四层思路在本版显式增加用户职责层形成五层逻辑图；这属于本报告的架构展开，不声称原技术响应直接写了五层。

## 原理依据与方法选择

正式报告增加 7 项技术参考资料，均核对原始论文/出版页面或模型官方文档：

1. Ulrich, 1995，产品架构与功能—物理结构关系：https://doi.org/10.1016/0048-7333(94)00775-3
2. CLIP，ICML 2021，图文监督表征：https://proceedings.mlr.press/v139/radford21a.html
3. U-Net，2015，编码—解码与像素预测：https://arxiv.org/abs/1505.04597
4. Mask R-CNN，2017，检测与实例掩膜：https://arxiv.org/abs/1703.06870
5. Segment Anything，2023，提示式分割：https://arxiv.org/abs/2304.02643
6. ControlNet，2023，空间条件生成：https://arxiv.org/abs/2302.05543
7. Black Forest Labs，FLUX.2 Image Editing，访问于 2026-09-18：https://docs.bfl.ai/flux_2/flux2_image_editing

文献用于比较输出、数据条件及适用性，不将文献指标转写为本项目测得精度。当前采用人工标记驱动编辑；“下一阶段优先验证提示分割加人工语义确认”是阶段性研究选型，不是部署事实或未经试验的最优性能结论。

## 修订范围与未关闭事项

- 将摘要改为概述，删除关键词和原第一章；先方法、再设计流程、再平台架构；结论重写，正式稿删除两个附录。
- 扩充传统模块化、AI 识别方法比较、方法选择、实际标记参考图链路及平台分层解释；图文助手仍为 274 个汉字的短节，不增设大篇幅助手章节。
- 新绘分层架构及实际编辑链路，校正功能图首页描述；其余图沿用 V2.3 已核验素材，按正文顺序重新编号为图 1—15，表 1—13。
- R03 企业现状实证、R07 同源真实客室案例仍待补；R05 车型 BOM/接口确认、R06 对照试验不因方法论补写自动完成。详见 `REVIEW_RESPONSE_V2.4.md`。
- 仓库历史遮罩截图为普通室内房间，不作为客室案例。没有真实原图—标记图—指令—结果—评价的同源资料，不拼接或生成伪实证配图。
- 本轮未运行业务单元/集成测试、生产构建、浏览器业务验收、GPU 推理或模型训练；没有访问业务数据库或对象存储以取得案例。文档结构验证不能替代这些验证。

## 文件生成与版式复核

采用 documents 的原生 Word 批注及渲染检查流程、diagram-design 的论文式图形与边界检查。所有源稿、图形脚本和版本记录均可维护；本机中间 PDF 与页面 PNG 只用于 QA，不作为额外交付件入库。

指定 A4、页边距、正文宋体小四、各级标题字体字号、固定 24 磅行距及首行缩进沿用。图片段落单倍行距避免裁切，封面标题使用独立样式。目录为 14 项章级内部链接（标题与页码共 28 个链接），正文 59 个标题书签；不是原生自动更新 TOC 域。目标 Word/WPS 字体与本机回退字体的度量不同可能重排页码，修改后需重新渲染并同步 `TOC_V2.4.json`。链接跳转目标仍是标题书签。

最终检查统计与 DOCX 校验值保存于 `QA_V2.4.json`。源稿正文、标题、图题及表格共 20,730 个汉字（不含内部头、图片路径与图内文字），图内文字另计；不把这个数当作 Word 的英文/字符混合字数。

复现命令（从本报告目录执行，运行时路径由本机环境提供）：

```bash
PYTHONDONTWRITEBYTECODE=1 python tools/build_figures_v2_4.py
node tools/export_figures_v2_4.cjs
PYTHONDONTWRITEBYTECODE=1 python tools/build_report_v2_4.py
python <documents-skill>/render_docx.py <V2.4.docx> --output_dir <临时目录> --emit_pdf
python tools/audit_report_v2_4.py --pdf <渲染PDF>
python <documents-skill>/scripts/a11y_audit.py <V2.4.docx>
python <diagram-design-skill>/scripts/self_check.py assets/v2-4/*.html
```

浏览器可用 `REPORT_CHROME_PATH` 指定，包解析可用 `NODE_PATH` 指定。首次渲染或内容变化后先从 PDF 标题导航提取真实页码，更新 `TOC_V2.4.json` 再生成、渲染并核验；不可只改目录数字而不核对跳转目标。
