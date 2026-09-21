#!/usr/bin/env python3
"""V2.4 replacement figures; preserve all historical assets.

Print-directed black/white palette and enlarged Chinese labels deliberately
follow the existing report rather than the diagram skill's web-brand defaults.
"""
from pathlib import Path
import build_figures_v2_3 as drawing

OUT = Path(__file__).resolve().parents[1] / 'assets' / 'v2-4'


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    drawing.OUT = OUT
    f = drawing.Figure(2, '平台构建的五层逻辑架构', 680,
        '用户、应用、软件支撑、数据和基础五层衔接设计方法与平台建设；星号标明待建设能力，个人助手独立于设计任务。')
    rows = [
        ('用户层', '设计使用与专业确认｜项目协作｜平台管理', '专业复核属于业务职责，不增加账号角色'),
        ('应用层', '分区与快速设计｜资产与项目｜训练与报告', '候选区域确认*；个人图文助手独立运行'),
        ('软件支撑层', '身份与权限｜任务与版本｜适配器｜审计', '设计工作流独立执行，聊天不下发设计任务'),
        ('数据层', '原图与标记｜任务与成果｜关系数据与文件', '模块属性*｜工程规则*｜区域识别评测资料*'),
        ('基础层', '平台运行环境｜外部计算服务｜网络与存储', '容器部署｜受控访问｜备份与恢复'),
    ]
    for i, (name, main, note) in enumerate(rows):
        y = 40 + i * 108
        f.rect(40, y, 880, 88, fill='#f3f3f3' if i % 2 == 0 else 'white')
        f.text(60, y + 48, name, 24, True, 'start')
        f.text(272, y + 36, main, 24, False, 'start')
        f.text(272, y + 68, note, 20, False, 'start')
        if i < len(rows) - 1:
            f.line([(480, y + 88), (480, y + 108)])
    f.legend('箭头表示职责依赖，不是逐次执行；* 表示研究后建设，不代表已实现。')
    f.save()

    f = drawing.Figure(15, '标记参考图与文本指令的实际编辑链路', 568,
        '原图与笔画由EasyMark合成参考图，与编辑指令进入图像编辑模型；输出经人工比较后登记项目资产。')
    nodes = [
        (40, 64, '原图与用户标记', '原图、笔画分别保存'),
        (368, 64, 'EasyMark 合成', '合成带标记的参考图'),
        (696, 64, '图像预处理', '尺寸处理与条件组织'),
        (696, 312, 'FLUX.2 Klein 编辑', '参考图与文字指令'),
        (368, 312, '结果与原图比较', '目标、保持及标记残留'),
        (40, 312, '确认登记成果', '保存来源，供后续复用'),
    ]
    for x, y, title, subtitle in nodes:
        f.node(x, y, 224, 104, title, subtitle)
    for points in [
        [(264, 116), (368, 116)], [(592, 116), (696, 116)],
        [(808, 168), (808, 312)], [(696, 364), (592, 364)],
        [(368, 364), (264, 364)],
    ]:
        f.line(points)
    f.text(40, 244, '原图与标记快照用于追溯；模型使用工作流内部合成的参考图。', 20, False, 'start')
    f.text(40, 464, '颜色与编号是人工指代；本链路不输出自动语义分割结果。', 20, False, 'start')
    f.legend('流程依据当前工作流连接关系；不是已完成案例或效果试验的证明。')
    f.save()


    f=drawing.Figure(9,'主要功能入口与共用业务支撑',512,'六个现有业务入口分别承担设计、资料、协作与支撑任务，共用身份项目资产任务和审计能力。')
    f.panel(40,40,880,280,'现有业务入口')
    entries=[(56,104,'首页','概览与快捷入口'),(352,104,'设计生成','零部件 · CMF · 客室'),(648,104,'资产中心','资料与结果复用'),(56,216,'设计工作台','项目与管理入口'),(352,216,'模型训练','样本与模型产物'),(648,216,'报告生成','章节与文件输出')]
    for x,y,t,s in entries: f.node(x,y,256,88,t,s)
    f.node(40,352,880,80,'共用业务支撑','身份权限 · 项目范围 · 资产引用 · 任务记录 · 通知审计')
    for x in [184,480,776]: f.line([(x,320),(x,352)])
    f.legend('业务入口不等同于独立算法系统；工程规则与模块知识仍需专项建设。'); f.save()


if __name__ == '__main__':
    build()
