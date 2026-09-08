#!/usr/bin/env python3
"""Build the latest RAIL-CONTRACT-RP-001 report as a reproducible DOCX.

Design system:
- Base preset: narrative_proposal.
- First-page pattern: editorial_cover.
- Named localization override: Calibri for Latin; Noto Serif CJK SC for Chinese
  body text; Noto Sans CJK SC for Chinese headings and diagrams.
- Named brand override: rail red (#B91C32) is used only as a restrained figure
  accent; document headings retain the preset blue hierarchy.
"""

from __future__ import annotations

import re
import sys
from math import atan2, cos, pi, sin
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor, Twips


SKILL_SCRIPTS = Path(
    "/home/huyanwei/.codex/plugins/cache/openai-primary-runtime/"
    "documents/26.826.12353/skills/documents/scripts"
)
sys.path.insert(0, str(SKILL_SCRIPTS))
from table_geometry import apply_table_geometry, column_widths_from_weights  # noqa: E402


BASE_DIR = Path(__file__).resolve().parents[1]
SOURCE_PATH = BASE_DIR / "source" / "REPORT_V1.1.md"
ASSETS_DIR = BASE_DIR / "assets"
DELIVERABLES_DIR = BASE_DIR / "deliverables"
OUTPUT_PATH = (
    DELIVERABLES_DIR
    / "基于轨道交通客运装备的内装模块分区识别与快速设计系统构建研究报告_V1.1.docx"
)

DOC_TITLE = "基于轨道交通客运装备的内装模块分区识别与快速设计系统构建研究报告"
SYSTEM_NAME = "客运装备内装模块化分区快速设计平台"
DOC_ID = "RAIL-CONTRACT-RP-001"
DOC_VERSION = "V1.1"
CODE_BRANCH = "codex/client-feedback-white-shell-20260901"
CODE_COMMIT = "51c4095ec269cde31b543dd6c8886802a9a8f452"
CODE_SHORT = "51c4095e"
COMPILED_DATE = "2026年9月3日"
CONTRACT_VERSION = "技术开发合同（26版）"
CONTRACT_SHA256 = "1c0d1e8df8721f6d86f15787dbf881df9542493338af5445bfe3c6f21b540fa3"

FONT_LATIN = "Calibri"
FONT_CJK_BODY = "Noto Serif CJK SC"
FONT_CJK_HEADING = "Noto Sans CJK SC"
FONT_MONO = "Noto Sans Mono CJK SC"

BLUE = "2E74B5"
DARK_BLUE = "1F4D78"
INK_BLUE = "0B2545"
COVER_NAVY = "203748"
MUTED = "5E6975"
LIGHT_GRAY = "F4F6F9"
MID_GRAY = "DDE2E7"
RAIL_RED = "B91C32"
WHITE = "FFFFFF"

CONTENT_WIDTH_DXA = 9360
TABLE_INDENT_DXA = 120
CELL_MARGINS = {"top": 80, "bottom": 80, "start": 120, "end": 120}


def rgb(value: str) -> RGBColor:
    return RGBColor.from_string(value)


def set_run_font(
    run,
    *,
    size: float | None = None,
    color: str | None = None,
    bold: bool | None = None,
    italic: bool | None = None,
    heading: bool = False,
    mono: bool = False,
):
    latin = FONT_MONO if mono else FONT_LATIN
    east_asia = FONT_MONO if mono else (FONT_CJK_HEADING if heading else FONT_CJK_BODY)
    run.font.name = latin
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.rFonts
    if rfonts is None:
        rfonts = OxmlElement("w:rFonts")
        rpr.insert(0, rfonts)
    rfonts.set(qn("w:ascii"), latin)
    rfonts.set(qn("w:hAnsi"), latin)
    rfonts.set(qn("w:eastAsia"), east_asia)
    if size is not None:
        run.font.size = Pt(size)
    if color is not None:
        run.font.color.rgb = rgb(color)
    if bold is not None:
        run.bold = bold
    if italic is not None:
        run.italic = italic


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_row_cant_split(row):
    tr_pr = row._tr.get_or_add_trPr()
    cant_split = OxmlElement("w:cantSplit")
    cant_split.set(qn("w:val"), "true")
    tr_pr.append(cant_split)


def set_cell_fill(cell, fill: str):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_table_borders(table, color: str = "C9D1DA", size: str = "4"):
    tbl_pr = table._tbl.tblPr
    borders = tbl_pr.find(qn("w:tblBorders"))
    if borders is None:
        borders = OxmlElement("w:tblBorders")
        tbl_pr.append(borders)
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        tag = borders.find(qn(f"w:{edge}"))
        if tag is None:
            tag = OxmlElement(f"w:{edge}")
            borders.append(tag)
        tag.set(qn("w:val"), "single")
        tag.set(qn("w:sz"), size)
        tag.set(qn("w:color"), color)


def add_page_field(paragraph):
    paragraph.add_run("第 ")
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instruction = OxmlElement("w:instrText")
    instruction.set(qn("xml:space"), "preserve")
    instruction.text = " PAGE "
    separate = OxmlElement("w:fldChar")
    separate.set(qn("w:fldCharType"), "separate")
    text = OxmlElement("w:t")
    text.text = "1"
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    for field_element in (begin, instruction, separate, text, end):
        field_run = paragraph.add_run()
        field_run._r.append(field_element)
    paragraph.add_run(" 页")
    for run in paragraph.runs:
        set_run_font(run, size=9, color=MUTED)


def add_numbering_definition(doc: Document, *, decimal: bool) -> int:
    numbering = doc.part.numbering_part.element
    existing_abs = [
        int(el.get(qn("w:abstractNumId")))
        for el in numbering.findall(qn("w:abstractNum"))
    ]
    abstract_id = max(existing_abs, default=-1) + 1
    existing_num = [
        int(el.get(qn("w:numId"))) for el in numbering.findall(qn("w:num"))
    ]
    num_id = max(existing_num, default=0) + 1

    abstract = OxmlElement("w:abstractNum")
    abstract.set(qn("w:abstractNumId"), str(abstract_id))
    multi = OxmlElement("w:multiLevelType")
    multi.set(qn("w:val"), "singleLevel")
    abstract.append(multi)
    level = OxmlElement("w:lvl")
    level.set(qn("w:ilvl"), "0")
    start = OxmlElement("w:start")
    start.set(qn("w:val"), "1")
    level.append(start)
    fmt = OxmlElement("w:numFmt")
    fmt.set(qn("w:val"), "decimal" if decimal else "bullet")
    level.append(fmt)
    lvl_text = OxmlElement("w:lvlText")
    lvl_text.set(qn("w:val"), "%1." if decimal else "•")
    level.append(lvl_text)
    suffix = OxmlElement("w:suff")
    suffix.set(qn("w:val"), "tab")
    level.append(suffix)

    ppr = OxmlElement("w:pPr")
    tabs = OxmlElement("w:tabs")
    tab = OxmlElement("w:tab")
    tab.set(qn("w:val"), "num")
    tab.set(qn("w:pos"), "540")
    tabs.append(tab)
    ppr.append(tabs)
    ind = OxmlElement("w:ind")
    ind.set(qn("w:left"), "540")
    ind.set(qn("w:hanging"), "280")
    ppr.append(ind)
    spacing = OxmlElement("w:spacing")
    spacing.set(qn("w:before"), "0")
    spacing.set(qn("w:after"), "80")
    spacing.set(qn("w:line"), "290")
    spacing.set(qn("w:lineRule"), "auto")
    ppr.append(spacing)
    level.append(ppr)

    rpr = OxmlElement("w:rPr")
    rfonts = OxmlElement("w:rFonts")
    rfonts.set(qn("w:ascii"), FONT_LATIN)
    rfonts.set(qn("w:hAnsi"), FONT_LATIN)
    rfonts.set(qn("w:eastAsia"), FONT_CJK_BODY)
    rpr.append(rfonts)
    level.append(rpr)
    abstract.append(level)
    numbering.append(abstract)

    num = OxmlElement("w:num")
    num.set(qn("w:numId"), str(num_id))
    abstract_ref = OxmlElement("w:abstractNumId")
    abstract_ref.set(qn("w:val"), str(abstract_id))
    num.append(abstract_ref)
    numbering.append(num)
    return num_id


def apply_num(paragraph, num_id: int):
    ppr = paragraph._p.get_or_add_pPr()
    num_pr = OxmlElement("w:numPr")
    ilvl = OxmlElement("w:ilvl")
    ilvl.set(qn("w:val"), "0")
    num = OxmlElement("w:numId")
    num.set(qn("w:val"), str(num_id))
    num_pr.append(ilvl)
    num_pr.append(num)
    ppr.append(num_pr)


def add_inline(paragraph, text: str, *, size: float | None = None, color: str | None = None):
    token_re = re.compile(r"(`[^`]+`|\*\*[^*]+\*\*)")
    pos = 0
    for match in token_re.finditer(text):
        if match.start() > pos:
            run = paragraph.add_run(text[pos : match.start()])
            set_run_font(run, size=size, color=color)
        token = match.group(0)
        if token.startswith("`"):
            run = paragraph.add_run(token[1:-1])
            set_run_font(run, size=(size or 11) - 0.5, color=DARK_BLUE, mono=True)
            shading = OxmlElement("w:shd")
            shading.set(qn("w:fill"), "EDF1F5")
            run._element.get_or_add_rPr().append(shading)
        else:
            run = paragraph.add_run(token[2:-2])
            set_run_font(run, size=size, color=color, bold=True)
        pos = match.end()
    if pos < len(text):
        run = paragraph.add_run(text[pos:])
        set_run_font(run, size=size, color=color)


def configure_styles(doc: Document):
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.right_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)
    section.different_first_page_header_footer = False

    normal = doc.styles["Normal"]
    normal.font.name = FONT_LATIN
    normal.font.size = Pt(11)
    normal._element.rPr.rFonts.set(qn("w:ascii"), FONT_LATIN)
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), FONT_LATIN)
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK_BODY)
    normal.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(8)
    normal.paragraph_format.line_spacing = 1.333

    heading_tokens = {
        "Heading 1": (16, BLUE, 18, 10),
        "Heading 2": (13, BLUE, 12, 6),
        "Heading 3": (12, DARK_BLUE, 8, 4),
    }
    for name, (size, color, before, after) in heading_tokens.items():
        style = doc.styles[name]
        style.font.name = FONT_LATIN
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = rgb(color)
        style._element.rPr.rFonts.set(qn("w:ascii"), FONT_LATIN)
        style._element.rPr.rFonts.set(qn("w:hAnsi"), FONT_LATIN)
        style._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK_HEADING)
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.line_spacing = 1.0
        style.paragraph_format.keep_with_next = True
        style.paragraph_format.keep_together = True

    caption = doc.styles["Caption"]
    caption.font.name = FONT_LATIN
    caption.font.size = Pt(9)
    caption.font.color.rgb = rgb(MUTED)
    caption._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CJK_HEADING)
    caption.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.CENTER
    caption.paragraph_format.space_before = Pt(4)
    caption.paragraph_format.space_after = Pt(8)
    caption.paragraph_format.line_spacing = 1.0

    settings = doc.settings._element
    update_fields = OxmlElement("w:updateFields")
    update_fields.set(qn("w:val"), "true")
    settings.append(update_fields)


def configure_header_footer(section):
    section.header.is_linked_to_previous = False
    section.footer.is_linked_to_previous = False
    # Keep the body header empty. LibreOffice can switch to a headerless page
    # style when a page break follows a full page, and a populated Word header
    # then makes the following chapter opener jump into the top margin. The
    # document version remains on the cover/control page and the footer keeps a
    # stable page identifier across Word and LibreOffice renderers.
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(0)
    add_page_field(p)


def add_cover(doc: Document):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.add_run("\n\n\n\n")

    kicker = doc.add_paragraph()
    kicker.alignment = WD_ALIGN_PARAGRAPH.CENTER
    kicker.paragraph_format.space_after = Pt(18)
    run = kicker.add_run("合同研究报告 · 评审稿")
    set_run_font(run, size=11, color=RAIL_RED, bold=True, heading=True)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title.paragraph_format.space_after = Pt(12)
    title.paragraph_format.line_spacing = 1.08
    run = title.add_run(DOC_TITLE)
    set_run_font(run, size=27, color=COVER_NAVY, bold=True, heading=True)

    subtitle = doc.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle.paragraph_format.space_after = Pt(42)
    run = subtitle.add_run(SYSTEM_NAME)
    set_run_font(run, size=14, color=DARK_BLUE, heading=True)

    for line, size, color, bold in [
        (f"文档编号：{DOC_ID}    文档版本：{DOC_VERSION}", 10.5, MUTED, True),
        (f"代码基线：{CODE_BRANCH} / {CODE_SHORT}", 10, MUTED, False),
        ("合同编号：合同文件未填写    合同版本：26版", 10, MUTED, False),
        ("委托单位：中车工业研究院有限公司", 10, MUTED, False),
        ("承担单位：北京科技大学", 10, MUTED, False),
        (COMPILED_DATE, 11, COVER_NAVY, True),
    ]:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(6 if size < 11 else 0)
        run = p.add_run(line)
        set_run_font(run, size=size, color=color, bold=bold, heading=True)

    body_section = doc.add_section(WD_SECTION.NEW_PAGE)
    body_section.page_width = Inches(8.5)
    body_section.page_height = Inches(11)
    body_section.top_margin = Inches(1)
    body_section.right_margin = Inches(1)
    body_section.bottom_margin = Inches(1)
    body_section.left_margin = Inches(1)
    body_section.header_distance = Inches(0.492)
    body_section.footer_distance = Inches(0.492)
    body_section.different_first_page_header_footer = False
    configure_header_footer(body_section)


def add_table(doc: Document, rows: list[list[str]], weights: list[float] | None = None):
    if not rows:
        return
    cols = max(len(row) for row in rows)
    normalized = [row + [""] * (cols - len(row)) for row in rows]
    table = doc.add_table(rows=len(normalized), cols=cols)
    table.style = "Table Grid"
    table.allow_autofit = False
    if weights is None:
        lengths = [max(len(row[col]) for row in normalized) for col in range(cols)]
        weights = [max(1.0, min(float(length), 5.0)) for length in lengths]
    widths = column_widths_from_weights(weights, CONTENT_WIDTH_DXA)
    apply_table_geometry(
        table,
        widths,
        table_width_dxa=CONTENT_WIDTH_DXA,
        indent_dxa=TABLE_INDENT_DXA,
        cell_margins_dxa=CELL_MARGINS,
    )
    set_table_borders(table)
    for row_index, row in enumerate(normalized):
        set_row_cant_split(table.rows[row_index])
        for col_index, value in enumerate(row):
            cell = table.cell(row_index, col_index)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if row_index == 0:
                set_cell_fill(cell, LIGHT_GRAY)
            p = cell.paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.line_spacing = 1.0
            add_inline(p, value, size=8.8, color=INK_BLUE if row_index == 0 else None)
            if row_index == 0:
                for run in p.runs:
                    run.bold = True
                    set_run_font(run, size=8.8, color=INK_BLUE, bold=True, heading=True)
    set_repeat_table_header(table.rows[0])
    after = doc.add_paragraph()
    after.paragraph_format.space_before = Pt(0)
    after.paragraph_format.space_after = Pt(0)
    return table


def add_callout(doc: Document, title: str, text: str):
    table = doc.add_table(rows=1, cols=1)
    table.style = None
    apply_table_geometry(
        table,
        [CONTENT_WIDTH_DXA],
        table_width_dxa=CONTENT_WIDTH_DXA,
        indent_dxa=180,
        cell_margins_dxa={"top": 140, "bottom": 140, "start": 180, "end": 180},
    )
    set_repeat_table_header(table.rows[0])
    set_table_borders(table, color=MID_GRAY, size="6")
    cell = table.cell(0, 0)
    set_cell_fill(cell, LIGHT_GRAY)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(title)
    set_run_font(run, size=10.5, color=DARK_BLUE, bold=True, heading=True)
    p2 = cell.add_paragraph()
    p2.paragraph_format.space_after = Pt(0)
    p2.paragraph_format.line_spacing = 1.2
    add_inline(p2, text, size=9.5)
    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(2)


def add_front_matter(doc: Document):
    h = doc.add_heading("文档控制", level=1)
    h.paragraph_format.space_before = Pt(0)
    add_table(
        doc,
        [
            ["控制项", "记录"],
            ["文档编号 / 版本", f"{DOC_ID} / {DOC_VERSION}"],
            ["文档状态", "评审稿"],
            ["编制日期", COMPILED_DATE],
            ["系统名称", SYSTEM_NAME],
            ["合同依据", CONTRACT_VERSION],
            ["第一阶段交付时间", "2026-09-30"],
            ["代码分支", CODE_BRANCH],
            ["完整提交哈希", CODE_COMMIT],
            ["提交时间", "2026-09-01T21:19:51+08:00"],
            ["代码取证时间", "2026-09-03T14:40:10+08:00"],
            ["取证时工作区", "仅合同文档、索引与开发日志有未提交变更；应用代码、迁移和部署配置未修改"],
        ],
        weights=[1.65, 4.85],
    )
    doc.add_heading("修订记录", level=2)
    add_table(
        doc,
        [
            ["版本", "日期", "代码基线", "状态", "修订说明"],
            ["V1.0", "2026-09-02", CODE_SHORT, "历史评审稿", "基于当前系统形成合同研究报告初版"],
            [DOC_VERSION, "2026-09-03", CODE_SHORT, "当前评审稿", "依据技术开发合同（26版）扩充研究内容、方法、实验、指标、里程碑和追踪矩阵"],
        ],
        weights=[0.7, 1.05, 0.9, 0.9, 2.95],
    )
    add_callout(
        doc,
        "重要真实性说明",
        "本报告对应合同第一阶段研究与总体架构成果。当前系统已实现人工在环分区标注、原图与标记图血缘及生成工作流闭环；专用自动识别、四级模块库、工程规则与约束、跨区域优化、向量检索、多目标评价和既有产品平台专用接口仍为后续建设项。本轮单元测试 128/128，不替代合同最终三级测试、第三方检测和甲方验收。",
    )

    doc.add_heading("目录", level=1)
    toc_items = [
        "摘要",
        "1 编制说明与研究依据",
        "2 研究背景与问题分析",
        "3 研究目标、研究内容与研究方法",
        "4 系统总体方案",
        "5 领域模型与数据底座",
        "6 内装模块分区识别研究与实现",
        "7 快速设计系统构建",
        "8 外部能力与任务编排",
        "9 平台业务功能",
        "10 安全、隔离与可追溯设计",
        "11 部署与运行方案",
        "12 测试、验证与质量评价",
        "13 研究成果与创新点",
        "14 当前完成度、限制与风险",
        "15 后续研究与建设计划",
        "16 结论",
        "附录 A 18 项工作流能力清单",
        "附录 B 核心 API 分组",
        "附录 C 文档维护与版本同步",
        "附录 D 合同要求追踪矩阵",
        "附录 E 第一阶段交付与评审检查表",
    ]
    for item in toc_items:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.18 if item[0].isdigit() else 0)
        p.paragraph_format.space_after = Pt(4)
        add_inline(p, item, size=10.5, color=DARK_BLUE if item[0].isdigit() else INK_BLUE)
    doc.add_page_break()


def add_picture_with_alt(doc: Document, image_path: Path, alt: str):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run()
    inline = run.add_picture(str(image_path), width=Inches(6.18))
    doc_pr = inline._inline.docPr
    doc_pr.set("descr", alt)
    caption = doc.add_paragraph(style="Caption")
    caption.add_run(alt)
    for cap_run in caption.runs:
        set_run_font(cap_run, size=9, color=MUTED, heading=True)


def parse_markdown(doc: Document, source: str, bullet_num_id: int, decimal_num_id: int):
    lines = source.splitlines()
    if lines and lines[0].strip() == "---":
        end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
        lines = lines[end + 1 :]

    i = 0
    active_decimal_num_id = None
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()
        if not stripped:
            i += 1
            continue

        if stripped.startswith("| "):
            active_decimal_num_id = None
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            parsed = []
            for idx, table_line in enumerate(table_lines):
                cells = [cell.strip() for cell in table_line.strip("|").split("|")]
                if idx == 1 and all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
                    continue
                parsed.append(cells)
            contract_table_weights = {
                ("合同字段", "本报告采用的信息"): [1.6, 4.9],
                ("合同要求", "本报告响应", "当前状态"): [1.7, 3.0, 1.8],
                ("目标对象", "核心字段", "与现有平台关系"): [1.2, 3.2, 2.1],
                ("层级", "定义", "客室内装示例", "关键属性"): [0.8, 1.9, 2.0, 1.8],
                ("接口组", "交换内容", "关键控制"): [1.1, 3.0, 2.4],
                ("合同指标", "当前证据", "阶段判断", "最终验收所需补充"): [1.5, 2.0, 1.2, 1.8],
                ("阶段", "合同工作与成果", "截止时间", "完成标志", "建议固化证据"): [0.7, 2.0, 0.9, 1.1, 1.8],
                ("编号", "合同/规格要求", "报告章节", "当前实现与证据", "状态及后续动作"): [0.55, 1.75, 0.85, 1.75, 1.6],
            }
            weights = contract_table_weights.get(tuple(parsed[0])) if parsed else None
            add_table(doc, parsed, weights=weights)
            continue

        image_match = re.fullmatch(r"!\[(.+?)\]\((.+?)\)", stripped)
        if image_match:
            active_decimal_num_id = None
            alt, rel_path = image_match.groups()
            add_picture_with_alt(doc, (SOURCE_PATH.parent / rel_path).resolve(), alt)
            i += 1
            continue

        heading_match = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if heading_match:
            active_decimal_num_id = None
            level = len(heading_match.group(1))
            text = heading_match.group(2)
            p = doc.add_heading(level=level)
            p.add_run(text)
            for run in p.runs:
                set_run_font(
                    run,
                    size={1: 16, 2: 13, 3: 12}[level],
                    color={1: BLUE, 2: BLUE, 3: DARK_BLUE}[level],
                    bold=True,
                    heading=True,
                )
            i += 1
            continue

        if re.match(r"^-\s+", stripped):
            active_decimal_num_id = None
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.line_spacing = 1.208
            apply_num(p, bullet_num_id)
            add_inline(p, re.sub(r"^-\s+", "", stripped))
            i += 1
            continue

        numbered = re.match(r"^\d+\.\s+(.+)$", stripped)
        if numbered:
            if active_decimal_num_id is None:
                active_decimal_num_id = add_numbering_definition(doc, decimal=True)
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(4)
            p.paragraph_format.line_spacing = 1.208
            apply_num(p, active_decimal_num_id)
            add_inline(p, numbered.group(1))
            i += 1
            continue

        if stripped.startswith("> "):
            active_decimal_num_id = None
            add_callout(doc, "说明", stripped[2:])
            i += 1
            continue

        active_decimal_num_id = None
        paragraph_lines = [stripped]
        i += 1
        while i < len(lines):
            candidate = lines[i].strip()
            if (
                not candidate
                or candidate.startswith("#")
                or candidate.startswith("|")
                or candidate.startswith("- ")
                or re.match(r"^\d+\.\s+", candidate)
                or candidate.startswith("![")
                or candidate.startswith("> ")
            ):
                break
            paragraph_lines.append(candidate)
            i += 1
        p = doc.add_paragraph()
        p.paragraph_format.widow_control = True
        add_inline(p, " ".join(paragraph_lines))


FIG_WIDTH = 2200
FIG_HEIGHT = 1140
FONT_PATH = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


def figure_font(size: int, *, bold: bool = False):
    # Noto's TTC renders Chinese reliably in the bundled Pillow runtime. The
    # regular face is intentionally used for all weights for portability.
    return ImageFont.truetype(FONT_PATH, size=size)


def _box_pixels(xy, width, height):
    x, y = xy
    return (
        int(x * FIG_WIDTH),
        int((1 - y - height) * FIG_HEIGHT),
        int((x + width) * FIG_WIDTH),
        int((1 - y) * FIG_HEIGHT),
    )


def _point_pixels(point):
    return (int(point[0] * FIG_WIDTH), int((1 - point[1]) * FIG_HEIGHT))


def draw_box(draw, xy, width, height, title, subtitle="", *, fill="F4F6F9", edge="2E74B5"):
    box = _box_pixels(xy, width, height)
    draw.rounded_rectangle(box, radius=24, fill=f"#{fill}", outline=f"#{edge}", width=4)
    x, y = xy
    title_center = _point_pixels((x + width / 2, y + height * 0.64))
    draw.multiline_text(
        title_center,
        title,
        font=figure_font(31, bold=True),
        fill=f"#{INK_BLUE}",
        anchor="mm",
        align="center",
        spacing=5,
    )
    if subtitle:
        subtitle_center = _point_pixels((x + width / 2, y + height * 0.29))
        draw.multiline_text(
            subtitle_center,
            subtitle,
            font=figure_font(23),
            fill=f"#{MUTED}",
            anchor="mm",
            align="center",
            spacing=7,
        )


def arrow(draw, start, end, *, color=BLUE, rad=0.0):
    start_px = _point_pixels(start)
    end_px = _point_pixels(end)
    if rad:
        middle = (
            int((start_px[0] + end_px[0]) / 2),
            int((start_px[1] + end_px[1]) / 2 + rad * 250),
        )
        points = [start_px, middle, end_px]
    else:
        points = [start_px, end_px]
    draw.line(points, fill=f"#{color}", width=5, joint="curve")
    tail = points[-2]
    angle = atan2(end_px[1] - tail[1], end_px[0] - tail[0])
    head = 22
    spread = pi / 7
    triangle = [
        end_px,
        (
            int(end_px[0] - head * cos(angle - spread)),
            int(end_px[1] - head * sin(angle - spread)),
        ),
        (
            int(end_px[0] - head * cos(angle + spread)),
            int(end_px[1] - head * sin(angle + spread)),
        ),
    ]
    draw.polygon(triangle, fill=f"#{color}")


def setup_figure(title: str):
    image = Image.new("RGB", (FIG_WIDTH, FIG_HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    draw.text(
        (42, 32),
        title,
        font=figure_font(39, bold=True),
        fill=f"#{COVER_NAVY}",
        anchor="la",
    )
    draw.line((42, 92, FIG_WIDTH - 42, 92), fill=f"#{MID_GRAY}", width=3)
    return image, draw


def save_figure(image, name: str):
    image.save(ASSETS_DIR / name, format="PNG", optimize=True)


def generate_figures():
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    image, draw = setup_figure("稳定平台框架 + 可替换外部能力适配器")
    draw_box(draw, (0.035, 0.38), 0.13, 0.26, "用户与浏览器", "Vue 3 / 固定外壳\n分区与遮罩画布", fill="FFF0F2", edge=RAIL_RED)
    draw_box(draw, (0.22, 0.38), 0.14, 0.26, "平台 API", "Nitro / H3 / Zod\n认证 · 权限 · 项目", fill="E8EEF5")
    draw_box(draw, (0.415, 0.62), 0.16, 0.19, "PostgreSQL", "41 个主要业务表\n关系与任务真值", fill="F4F6F9")
    draw_box(draw, (0.415, 0.25), 0.16, 0.19, "MinIO / S3", "八类私有资产\n预签名 PUT / GET", fill="F4F6F9")
    draw_box(draw, (0.63, 0.38), 0.14, 0.26, "独立 Worker", "租约 · 重试 · 取消\n输出回执与补偿", fill="E8EEF5")
    draw_box(draw, (0.82, 0.55), 0.145, 0.18, "ComfyUI", "18 项工作流", fill="FFF0F2", edge=RAIL_RED)
    draw_box(draw, (0.82, 0.31), 0.145, 0.18, "AI Toolkit", "LoRA 训练", fill="FFF0F2", edge=RAIL_RED)
    draw_box(draw, (0.82, 0.07), 0.145, 0.18, "AI / 报告服务", "助手与报告适配器", fill="FFF0F2", edge=RAIL_RED)
    arrow(draw, (0.165, 0.51), (0.22, 0.51), color=RAIL_RED)
    arrow(draw, (0.36, 0.55), (0.415, 0.68))
    arrow(draw, (0.36, 0.46), (0.415, 0.34))
    arrow(draw, (0.575, 0.68), (0.63, 0.57))
    arrow(draw, (0.575, 0.34), (0.63, 0.45))
    arrow(draw, (0.77, 0.55), (0.82, 0.64), color=RAIL_RED)
    arrow(draw, (0.77, 0.49), (0.82, 0.40), color=RAIL_RED)
    arrow(draw, (0.76, 0.42), (0.82, 0.17), color=RAIL_RED)
    draw.text(_point_pixels((0.50, 0.08)), "浏览器不持有外部密钥、对象私有键或工作流节点编号", font=figure_font(25), fill=f"#{MUTED}", anchor="mm")
    save_figure(image, "figure-01-system-architecture.png")

    image, draw = setup_figure("项目上下文中的设计数据闭环")
    positions = [
        (0.03, "项目", "授权与协作边界"),
        (0.20, "输入资产", "原图 / 参考图 / 文本"),
        (0.38, "设计会话", "多应用连续轮次"),
        (0.56, "持久任务", "参数 / 输入 / 状态"),
        (0.74, "暂存结果", "图片 / 文本 / 3D"),
    ]
    for x, title, sub in positions:
        draw_box(draw, (x, 0.50), 0.14, 0.22, title, sub, fill="F4F6F9", edge=BLUE)
    for x in [0.17, 0.35, 0.53, 0.71]:
        arrow(draw, (x, 0.61), (x + 0.03, 0.61))
    draw_box(draw, (0.79, 0.16), 0.16, 0.19, "项目资产版本", "用户确认入库\n可跨能力复用", fill="FFF0F2", edge=RAIL_RED)
    arrow(draw, (0.84, 0.50), (0.87, 0.35), color=RAIL_RED)
    arrow(draw, (0.79, 0.25), (0.49, 0.50), color=RAIL_RED, rad=-0.30)
    draw_box(draw, (0.19, 0.16), 0.18, 0.19, "审计与通知", "记录元数据与结果\n不记录敏感正文", fill="E8EEF5", edge=DARK_BLUE)
    arrow(draw, (0.28, 0.35), (0.28, 0.50), color=DARK_BLUE)
    draw_box(draw, (0.45, 0.16), 0.18, 0.19, "应用 / 工作流版本", "输入输出契约\n不可变快照与校验和", fill="E8EEF5", edge=DARK_BLUE)
    arrow(draw, (0.54, 0.35), (0.63, 0.50), color=DARK_BLUE)
    save_figure(image, "figure-02-domain-flow.png")

    image, draw = setup_figure("人工在环的分区识别、任务执行与结果深化")
    flow = [
        (0.03, "选择原图", "当前项目可用图片"),
        (0.19, "交互识别", "画笔 / 框选 / 色块\n颜色 + 1—6 编号"),
        (0.36, "生成标记快照", "PNG + derivedFromAssetId"),
        (0.53, "API 双重校验", "项目 · 类型 · 派生源\n输入位置一致"),
        (0.70, "Worker 物化执行", "版本化 JSON\n外部 ComfyUI"),
        (0.86, "结果处理", "对比 · 暂存\n入库 · 深化"),
    ]
    for x, title, sub in flow:
        draw_box(draw, (x, 0.47), 0.115, 0.25, title, sub, fill="F4F6F9", edge=BLUE if x < 0.7 else RAIL_RED)
    for x in [0.145, 0.305, 0.475, 0.645, 0.815]:
        arrow(draw, (x, 0.595), (x + 0.045, 0.595), color=RAIL_RED if x >= 0.645 else BLUE)
    draw_box(draw, (0.18, 0.12), 0.22, 0.18, "原始输入保持不变", "job_inputs.asset_id = 原图\n用于真实执行与结果对比", fill="E8EEF5", edge=DARK_BLUE)
    draw_box(draw, (0.47, 0.12), 0.22, 0.18, "标记输入单独留痕", "annotation_asset_id = 标记图\n用于复现用户识别意图", fill="E8EEF5", edge=DARK_BLUE)
    arrow(draw, (0.24, 0.47), (0.29, 0.30), color=DARK_BLUE)
    arrow(draw, (0.42, 0.47), (0.58, 0.30), color=DARK_BLUE)
    draw.multiline_text(_point_pixels((0.84, 0.18)), "全自动语义分割\n尚未作为独立模型交付", font=figure_font(26, bold=True), fill=f"#{RAIL_RED}", anchor="mm", align="center", spacing=7)
    save_figure(image, "figure-03-partition-workflow.png")

    image, draw = setup_figure("生产单机部署与外部依赖边界")
    draw_box(draw, (0.04, 0.40), 0.13, 0.23, "浏览器", "同域访问 Web/API\n预签名访问对象", fill="FFF0F2", edge=RAIL_RED)
    draw_box(draw, (0.22, 0.58), 0.14, 0.20, "Web / Nginx", "静态资源与反向代理", fill="E8EEF5")
    draw_box(draw, (0.22, 0.27), 0.14, 0.20, "Platform API", "Nitro 业务接口", fill="E8EEF5")
    draw_box(draw, (0.43, 0.58), 0.14, 0.20, "PostgreSQL 17", "数据卷 + 迁移", fill="F4F6F9")
    draw_box(draw, (0.43, 0.27), 0.14, 0.20, "MinIO", "私有桶 + 数据卷", fill="F4F6F9")
    draw_box(draw, (0.63, 0.40), 0.14, 0.23, "Worker", "ComfyUI / LoRA / 报告\n租约执行", fill="E8EEF5")
    draw_box(draw, (0.82, 0.64), 0.14, 0.16, "ComfyUI", "外部推理服务", fill="FFF0F2", edge=RAIL_RED)
    draw_box(draw, (0.82, 0.43), 0.14, 0.16, "AI Toolkit", "外部训练服务", fill="FFF0F2", edge=RAIL_RED)
    draw_box(draw, (0.82, 0.22), 0.14, 0.16, "SMTP / AI", "邮件、助手、报告", fill="FFF0F2", edge=RAIL_RED)
    arrow(draw, (0.17, 0.55), (0.22, 0.68), color=RAIL_RED)
    arrow(draw, (0.17, 0.47), (0.22, 0.37), color=RAIL_RED)
    arrow(draw, (0.36, 0.37), (0.43, 0.68))
    arrow(draw, (0.36, 0.34), (0.43, 0.37))
    arrow(draw, (0.57, 0.68), (0.63, 0.55))
    arrow(draw, (0.57, 0.37), (0.63, 0.47))
    arrow(draw, (0.77, 0.56), (0.82, 0.72), color=RAIL_RED)
    arrow(draw, (0.77, 0.52), (0.82, 0.51), color=RAIL_RED)
    arrow(draw, (0.77, 0.46), (0.82, 0.30), color=RAIL_RED)
    draw.text(_point_pixels((0.50, 0.10)), "平台容器管理 Web、API、Worker、迁移、PostgreSQL 与 MinIO；算法与企业服务保持外置可替换", font=figure_font(24), fill=f"#{MUTED}", anchor="mm")
    save_figure(image, "figure-04-deployment.png")

    image, draw = setup_figure("合同技术路线与三阶段成果")
    roadmap = [
        (0.02, "需求与数据", "车型 · 区域\n模块 · 指标"),
        (0.155, "关键技术", "识别 · 生成\n规则 · 优化"),
        (0.29, "模块体系", "四级对象\n参数与接口"),
        (0.425, "系统开发", "分区 · 任务\n资产与方案"),
        (0.56, "平台集成", "外部能力\n产品平台"),
        (0.695, "验证迭代", "单元 · 集成\n系统 · 第三方"),
        (0.83, "版本固化", "代码 · 数据\n模型 · 文档"),
    ]
    for x, title, sub in roadmap:
        draw_box(draw, (x, 0.51), 0.12, 0.24, title, sub, fill="F4F6F9", edge=BLUE)
    for x in [0.14, 0.275, 0.41, 0.545, 0.68, 0.815]:
        arrow(draw, (x, 0.63), (x + 0.015, 0.63))
    milestones = [
        (0.10, "第一阶段 · 2026-09-30", "研究报告 1 份\n功能分区研究 + 总体架构"),
        (0.39, "第二阶段 · 2026-12-31", "快速设计系统 1 套\n第三方检测 + 甲方验收"),
        (0.68, "第三阶段 · 2027-03-31", "源码 + 手册 + 3 项软著\n产品平台接口与系统测试"),
    ]
    for x, title, sub in milestones:
        draw_box(draw, (x, 0.13), 0.23, 0.22, title, sub, fill="FFF0F2", edge=RAIL_RED)
    save_figure(image, "figure-05-contract-roadmap.png")

    image, draw = setup_figure("模块化快速设计与跨区域优化闭环")
    module_levels = [
        (0.05, "系统级", "客室内装系统\n目标市场与车型"),
        (0.28, "子系统级", "侧墙 · 顶部 · 地板\n端墙 · 座椅 · 门区"),
        (0.51, "组件级", "可配置与装配单元\n尺寸 · 材质 · 接口"),
        (0.74, "零件级", "表面 · 工艺 · 公差\n供应与维护信息"),
    ]
    for x, title, sub in module_levels:
        draw_box(draw, (x, 0.60), 0.18, 0.20, title, sub, fill="E8EEF5", edge=BLUE)
    for x in [0.23, 0.46, 0.69]:
        arrow(draw, (x, 0.70), (x + 0.05, 0.70))
    loop = [
        (0.03, "多模态识别", "图像 · 文本\n几何 · 参数"),
        (0.19, "参数化生成", "模块选择\n形态 · CMF"),
        (0.35, "硬约束过滤", "边界 · 接口\n法规 · 干涉"),
        (0.51, "跨区域优化", "功能 · 视觉\n制造 · 运维"),
        (0.67, "检索与评价", "相似召回\n多目标排序"),
        (0.83, "评审与入库", "人工确认\n资产版本"),
    ]
    for x, title, sub in loop:
        draw_box(draw, (x, 0.23), 0.13, 0.22, title, sub, fill="F4F6F9", edge=RAIL_RED if x >= 0.67 else DARK_BLUE)
    for x in [0.16, 0.32, 0.48, 0.64, 0.80]:
        arrow(draw, (x, 0.34), (x + 0.03, 0.34), color=RAIL_RED if x >= 0.64 else DARK_BLUE)
    arrow(draw, (0.895, 0.23), (0.095, 0.23), color=RAIL_RED, rad=0.34)
    save_figure(image, "figure-06-rapid-design-loop.png")


def build():
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    DELIVERABLES_DIR.mkdir(parents=True, exist_ok=True)
    generate_figures()

    doc = Document()
    configure_styles(doc)
    bullet_num_id = add_numbering_definition(doc, decimal=False)
    decimal_num_id = add_numbering_definition(doc, decimal=True)

    props = doc.core_properties
    props.title = DOC_TITLE
    props.subject = "轨道交通客运装备内装模块分区识别与快速设计系统构建"
    props.author = "轨道客室智能设计平台项目组"
    props.keywords = "轨道交通, 客室内装, 模块分区, 快速设计, ComfyUI, 项目资产"
    props.comments = (
        f"文档编号 {DOC_ID}；代码基线 {CODE_COMMIT}；"
        f"合同依据 {CONTRACT_VERSION}；合同文件 SHA-256 {CONTRACT_SHA256}"
    )

    add_cover(doc)
    add_front_matter(doc)
    parse_markdown(doc, SOURCE_PATH.read_text(encoding="utf-8"), bullet_num_id, decimal_num_id)
    doc.save(OUTPUT_PATH)
    print(OUTPUT_PATH)


if __name__ == "__main__":
    build()
