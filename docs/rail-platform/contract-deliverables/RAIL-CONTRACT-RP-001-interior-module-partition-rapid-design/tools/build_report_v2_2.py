#!/usr/bin/env python3
"""Build V2.2 with all tender-context wording removed from the formal report."""

from pathlib import Path

import build_report_v2_1 as base


BASE_DIR = Path(__file__).resolve().parents[1]


def add_front_matter(doc, toc_entries):
    h = doc.add_heading("文档控制", level=1)
    h.paragraph_format.space_before = base.Pt(0)
    base.add_table(
        doc,
        [
            ["控制项", "记录"],
            ["文档编号 / 版本", f"{base.DOC_ID} / {base.DOC_VERSION}"],
            ["文档状态", "建设指导评审稿"],
            ["编制日期", base.COMPILED_DATE],
            ["文档定位", "平台构建前的关键技术、总体架构、功能模块、技术路线和进度指导文件"],
            ["合同依据", "技术开发合同（26版）及附件技术规格书"],
            ["内容依据", "平台建设需求及甲方关于报告定位、图文表达和建设指导性的补充意见"],
        ],
        weights=[1.45, 5.05],
    )
    h2 = doc.add_heading("修订记录", level=2)
    h2.paragraph_format.space_before = base.Pt(12)
    base.add_table(
        doc,
        [
            ["版本", "日期", "状态", "修订说明"],
            ["V2.0", "2026-09-03", "历史指导稿", "重构为平台构建前建设指导文件"],
            ["V2.1", "2026-09-03", "历史评审稿", "重绘技术图、清理无关内容并控制篇幅"],
            [base.DOC_VERSION, "2026-09-03", "当前评审稿", "统一研究报告独立表述并完成全文语义复核"],
        ],
        weights=[0.7, 1.0, 1.2, 3.6],
    )
    base.add_callout(
        doc,
        "报告使用说明",
        "本报告用于统一平台建设目标、关键技术、总体架构、功能边界、实施路线和验证方法；具体参数及工程结论在详细设计、试验和审批阶段固化。",
    )
    doc.add_page_break()
    base.add_clickable_toc(doc, toc_entries)
    doc.add_page_break()


def generate_figures():
    base.ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    image, draw = base.figure_base.setup_figure("平台建设输入向研究任务的分解与闭环")
    for x, title, sub in [
        (0.04, "合同与技术规格", "目标 · 范围 · 成果 · 验收"),
        (0.37, "平台建设需求", "业务目标 · 技术范围 · 实施边界"),
        (0.70, "甲方补充意见", "报告定位 · 图文表达 · 落地指导"),
    ]:
        base.fmini(draw, x, 0.72, 0.26, 0.13, title, sub, fill="FFF0F2", edge=base.ACCENT)
        base.farrow(draw, (x + 0.13, 0.72), (x + 0.13, 0.64), color=base.ACCENT)
    base.fmini(
        draw,
        0.04,
        0.52,
        0.92,
        0.12,
        "建设边界与研究问题统一化",
        "对象标准、关键技术、业务流程、平台架构、数据条件、实施计划、验证证据",
        fill="E8EEF5",
        edge="1F4D78",
    )
    columns = [
        (0.04, "对象与数据研究", "区域体系\n四级模块\n数据与知识"),
        (0.275, "关键技术研究", "分区识别\n多模态应用\n快速设计"),
        (0.51, "平台方案设计", "功能架构\n服务边界\n接口与安全"),
        (0.745, "实施验证设计", "阶段任务\n质量指标\n评审与交付"),
    ]
    for x, title, sub in columns:
        base.fmini(draw, x, 0.28, 0.205, 0.18, title, sub, fill="F4F6F9")
        base.farrow(draw, (x + 0.1025, 0.52), (x + 0.1025, 0.46))
        base.farrow(draw, (x + 0.1025, 0.28), (x + 0.1025, 0.20), color=base.ACCENT)
    outputs = ["标准与数据清单", "技术原型与规则", "总体设计与接口", "计划、指标与证据"]
    for (x, _, _), title in zip(columns, outputs):
        base.fmini(
            draw,
            x,
            0.08,
            0.205,
            0.12,
            title,
            "可评审 · 可实施 · 可追踪",
            fill="FFF0F2",
            edge=base.ACCENT,
        )
    base.save_figure(image, "v2-2-figure-01-guidance-framework.png")


def main():
    base.SOURCE_PATH = BASE_DIR / "source" / "REPORT_V2.2.md"
    base.OUTPUT_PATH = (
        BASE_DIR
        / "deliverables"
        / "基于轨道交通客运装备的内装模块分区识别与快速设计系统构建研究报告_V2.2.docx"
    )
    base.DOC_VERSION = "V2.2"
    base.add_front_matter = add_front_matter
    base.generate_figures = generate_figures
    base.build()


if __name__ == "__main__":
    main()
