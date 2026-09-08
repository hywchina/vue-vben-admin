#!/usr/bin/env python3
"""Academic report figures. HTML is authoritative; rasterize with the export helper.

User-directed print style overrides the diagram skill's branded web defaults.
Coordinates and type sizes use a 4 px grid; no automatic graph layout is used.
"""
from html import escape
from pathlib import Path
from math import ceil

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / 'assets' / 'v2-3'
TOKENS = dict(paper='#ffffff', ink='#202020', muted='#505050', rule='#b8b8b8',
              tint='#f3f3f3', accent='#202020', link='#505050')
FONT = 'Noto Sans CJK SC, Microsoft YaHei, sans-serif'


class Figure:
    def __init__(self, number, title, height, desc):
        self.number, self.title, self.height, self.desc = number, title, height, desc
        self.bg, self.edges, self.nodes, self.labels = [], [], [], []

    def text(self, x, y, value, size=24, bold=False, align='middle', target=None):
        target = self.nodes if target is None else target
        for i, line in enumerate(value.split('\n')):
            target.append(f'<text x="{x}" y="{y+i*(size+8)}" font-size="{size}" '
                          f'font-weight="{500 if bold else 400}" text-anchor="{align}" '
                          f'fill="{TOKENS["ink"]}">{escape(line)}</text>')

    def rect(self, x, y, w, h, fill='white', dash=False, target=None, stroke='#505050', radius=0):
        target = self.nodes if target is None else target
        target.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" '
                      f'fill="{fill}" stroke="{stroke}" stroke-width="1.2" '
                      + ('stroke-dasharray="8 4" ' if dash else '') + '/>')

    def node(self, x, y, w, h, title, sub='', dash=False, fill='white'):
        self.rect(x,y,w,h,fill,dash)
        n = len(title.split('\n'))
        m = len(sub.split('\n')) if sub else 0
        total = n*32 + (m*28+4 if m else 0)
        top = 4*round((y + (h-total)/2 + 24)/4)
        self.text(x+w/2,top,title,24,False)
        if sub: self.text(x+w/2,top+n*32+4,sub,20)

    def panel(self, x,y,w,h,title,dash=False):
        self.rect(x,y,w,h,TOKENS['tint'],dash,self.bg,stroke='#b8b8b8')
        self.text(x+16,y+32,title,20,True,'start',self.bg)

    def line(self, pts, dash=False, arrow=True, color='#505050'):
        # Round every right-angle bend; explicitly reject diagonal segments.
        for a,b in zip(pts,pts[1:]):
            assert a[0] == b[0] or a[1] == b[1], (a,b)
        d=f'M {pts[0][0]} {pts[0][1]}'
        for i in range(1,len(pts)-1):
            a,b,c=pts[i-1:i+2]
            l1=abs(b[0]-a[0])+abs(b[1]-a[1]); l2=abs(c[0]-b[0])+abs(c[1]-b[1])
            r=min(8,l1/2,l2/2)
            u=((b[0]-a[0])/l1,(b[1]-a[1])/l1)
            v=((c[0]-b[0])/l2,(c[1]-b[1])/l2)
            d+=f' L {b[0]-u[0]*r} {b[1]-u[1]*r} Q {b[0]} {b[1]} {b[0]+v[0]*r} {b[1]+v[1]*r}'
        d+=f' L {pts[-1][0]} {pts[-1][1]}'
        self.edges.append(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.6" '
                          + ('stroke-dasharray="8 4" ' if dash else '')
                          + ('marker-end="url(#arrow)" ' if arrow else '') + '/>')

    def label(self,x,y,value):
        # Baseline must be 16 px above the connector (mask bottom leaves 8 px).
        width=8*ceil(max(40,len(value)*20+16)/8)
        self.rect(x-width/2,y-24,width,32,'white',False,self.labels,stroke='none',radius=0)
        self.text(x,y,value,20,False,target=self.labels)

    def legend(self,value):
        y=self.height-56
        self.bg.append(f'<path d="M40 {y} H920" stroke="#b8b8b8" stroke-width="1"/>')
        self.text(40,y+32,value,20,False,'start',self.labels)

    def save(self):
        slug=f'figure-{self.number:02}'
        defs=''.join(f'<marker id="{name}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="{color}"/></marker>'
                     for name,color in [('arrow',TOKENS['muted']),('arrow-accent',TOKENS['accent']),('arrow-link',TOKENS['link'])])
        svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 {self.height}" width="960" height="{self.height}" '
             f'role="img" aria-labelledby="{slug}-title {slug}-desc" font-family="{FONT}">'
             f'<title id="{slug}-title">{escape(self.title)}</title><desc id="{slug}-desc">{escape(self.desc)}</desc>'
             f'<defs>{defs}</defs><rect width="960" height="{self.height}" fill="white"/>'
             +''.join(self.bg+self.edges+self.nodes+self.labels)+'</svg>')
        # Minimal-light template structure, customized for the user's academic print direction.
        html=f'<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{escape(self.title)}</title><style>*{{box-sizing:border-box}}body{{margin:0;background:white;color:#202020;font-family:{FONT}}}svg{{display:block}}.frame{{width:960px}}h1{{font-family:"Noto Serif CJK SC",serif;font-size:24px;font-weight:500;margin:24px 40px}}@media print{{h1{{display:none}}}}</style></head><body><main class="frame"><h1>{escape(self.title)}</h1>{svg}</main></body></html>'
        (OUT/f'{slug}.html').write_text(html,encoding='utf-8')


def make_figures():
    OUT.mkdir(parents=True,exist_ok=True)
    f=Figure(1,'研究问题与平台构建的对应关系',568,'区域表达、局部设计及过程控制分别对应研究方法和平台建设任务。')
    for x,t in [(160,'研究问题'),(480,'采用的方法'),(800,'建设输出')]: f.text(x,56,t,24,True)
    rows=[('区域如何定义','功能拆解\n典型对象走查','区域术语\n模块样例'),('局部如何修改','标记与遮罩\n受控对照试验','分区输入规范\n效果评价记录'),('过程如何连续','场景验证\n失败路径检查','任务与资产关系\n建设完善清单')]
    for i,(a,b,c) in enumerate(rows):
        y=96+i*136
        f.node(40,y,240,104,a); f.node(360,y,240,104,b); f.node(680,y,240,104,c)
        f.line([(280,y+52),(360,y+52)]); f.line([(600,y+52),(680,y+52)])
    f.legend('研究输出需关联实际样例；本图不表示试验已经完成。'); f.save()

    f=Figure(2,'平台总体架构与独立能力边界',768,'主设计链路包含应用、平台服务和独立任务执行；个人图文聊天链路独立，二者共享受控数据基础。')
    for y,h,title in [(40,136,'应用交互'),(208,136,'平台业务服务'),(376,144,'任务执行与能力适配')]:
        f.panel(40,y,608,h,title)
    f.panel(680,40,240,480,'独立的个人聊天链路')
    for x,t in [(56,'设计生成\n三种视觉模式'),(252,'资产与项目\n资料及协作'),(448,'训练与报告\n支撑业务')]: f.node(x,88,184,72,t)
    for x,t in [(56,'身份与范围\n用户 · 项目'),(252,'会话与任务\n输入 · 参数'),(448,'资料与治理\n目录 · 审计')]: f.node(x,256,184,72,t)
    for x,t in [(56,'设计工作流\nComfyUI'),(252,'模型训练\nAI Toolkit'),(448,'报告生成\n模板 / AI')]: f.node(x,424,184,80,t)
    f.node(696,96,208,80,'聊天窗口','文本与图片')
    f.node(696,248,208,88,'会话与消息','个人范围校验')
    f.node(696,424,208,80,'图文模型服务','返回文字答复')
    f.line([(344,176),(344,208)]); f.line([(344,344),(344,376)])
    f.line([(800,176),(800,248)]); f.line([(800,336),(800,424)])
    f.panel(40,560,880,128,'共享数据与运行基础')
    f.node(56,600,408,80,'关系数据库','业务关系 · 任务 · 私人会话')
    f.node(496,600,408,80,'私有对象存储','项目文件 · 结果 · 个人附件')
    f.line([(344,520),(344,560)])
    f.line([(696,292),(664,292),(664,540),(800,540),(800,560)])
    f.legend('聊天不下发工作流任务；共享存储不改变项目及个人的数据边界。'); f.save()

    f=Figure(3,'平台部署组成与受控访问路径',496,'浏览器经平台授权访问私有文件；平台业务与独立任务执行依托关系数据并接入外部能力。')
    f.node(40,104,224,88,'Web 访问入口','浏览器交互')
    f.node(376,104,224,88,'平台服务','身份 · 范围 · 业务')
    f.node(720,104,200,88,'私有对象存储','文件与结果')
    f.node(40,320,224,88,'关系数据库','业务记录 · 队列')
    f.node(376,320,224,88,'独立执行进程','领取 · 执行 · 回收')
    f.node(720,320,200,88,'外部能力服务','模型 · 工作流')
    f.line([(264,148),(376,148)]); f.line([(600,148),(720,148)])
    f.line([(152,104),(152,48),(820,48),(820,104)]); f.label(488,32,'经授权的短时文件传输')
    f.line([(440,192),(440,248),(152,248),(152,320)])
    f.line([(376,364),(264,364)]); f.label(320,348,'领取回写')
    f.line([(600,364),(720,364)])
    f.line([(600,336),(656,336),(656,232),(820,232),(820,192)])
    f.label(748,216,'读写文件')
    f.legend('任务队列采用关系数据与租约；模型配置和服务凭据仅保存在后端。'); f.save()

    f=Figure(4,'四级模块拆解的代表性研究示例',624,'以客室内装、侧墙子系统、墙板组件及具体零件说明四级模块拆解，其他分支仅作研究示例。')
    for y,t in [(80,'系统级'),(216,'子系统级'),(352,'组件级'),(488,'零件级')]: f.text(40,y,t,20,True,'start')
    f.node(384,40,240,72,'客室内装系统')
    f.node(192,176,240,72,'侧墙子系统'); f.node(640,176,240,72,'顶部等子系统')
    f.node(192,312,240,72,'墙板组件'); f.node(640,312,240,72,'窗带等组件')
    f.node(192,448,240,72,'面板零件'); f.node(640,448,240,72,'连接等零件')
    f.line([(448,112),(448,144),(312,144),(312,176)])
    f.line([(560,112),(560,144),(760,144),(760,176)])
    f.line([(264,248),(264,312)])
    f.line([(392,248),(392,280),(760,280),(760,312)])
    f.line([(264,384),(264,448)])
    f.line([(392,384),(392,416),(760,416),(760,448)])
    f.legend('代表性拆解示例；具体层级、部件名称及接口由车型资料确认。'); f.save()

    f=Figure(5,'颜色与编号分区设计的实际交互流程',528,'设计人员标记原图并提交编辑要求，平台保留原图与标记快照，结果经人工比较后保存。')
    f.text(40,52,'（a）指定修改对象并保留输入依据',20,True,'start')
    for x,t,s in [(40,'选择原图','当前项目资产'),(368,'颜色或编号标记','笔画 + 编辑要求'),(696,'提交设计任务','原图与标记分别保留')]: f.node(x,88,224,104,t,s)
    f.line([(264,140),(368,140)]); f.line([(592,140),(696,140)])
    f.line([(808,192),(808,328)])
    f.text(40,296,'（b）比较与确认设计结果',20,True,'start')
    for x,t,s in [(696,'工作流返回结果','任务内暂存'),(368,'原图与结果比较','设计人员判断'),(40,'确认加入资产','供后续深化使用')]: f.node(x,328,224,104,t,s)
    f.line([(696,380),(592,380)]); f.line([(368,380),(264,380)])
    f.legend('标记表达用户意图，不是自动语义识别；比较基准为标记前原图。'); f.save()

    f=Figure(6,'区域识别研究与现有设计入口的衔接',360,'候选定位、类别范围判断和人工核验属于拟开展研究，核验后衔接现有标记及设计入口。')
    f.panel(40,40,640,224,'拟开展的区域识别研究',True)
    for x,t in [(56,'候选定位\n方法对比'),(272,'类别与范围\n结果记录'),(488,'人工核验\n修订与确认')]: f.node(x,128,176,88,t,dash=True)
    f.node(744,128,176,88,'标记与设计\n现有入口')
    for x1,x2 in [(232,272),(448,488),(664,744)]: f.line([(x1,172),(x2,172)],dash=True)
    f.legend('虚线：研究与拟建衔接；实框：现有业务入口。'); f.save()

    f=Figure(7,'项目设计会话中的快速设计与成果复用',480,'设计任务在项目会话内按轮次保存，经用户确认的输出登记为资产后才可继续深化。')
    nodes=[(40,72,'输入资产','文字与有序素材'),(368,72,'本轮设计条件','模式 · 标记 · 参数'),(696,72,'任务执行','固定能力版本'),(696,280,'结果比较','保留完整输出'),(368,280,'确认登记资产','用户选择保存'),(40,280,'下一轮深化','新任务引用成果')]
    for x,y,t,s in nodes: f.node(x,y,224,104,t,s)
    f.line([(264,124),(368,124)]); f.line([(592,124),(696,124)])
    f.line([(808,176),(808,280)])
    f.line([(696,332),(592,332)]); f.line([(368,332),(264,332)])
    f.legend('同一会话单任务运行；历史轮次不覆盖，暂存结果不能直接跨能力复用。'); f.save()

    f=Figure(8,'局部修改后的跨区域检查方法',544,'以侧墙修改为例，分别检查顶部、座椅及门区的影响后，由设计人员决定是否补充调整。')
    f.node(40,224,224,104,'侧墙局部修改','明确变化与保留条件')
    for y,t,s in [(64,'顶部衔接','边界与视觉过渡'),(224,'座椅背景','形态与色彩关系'),(384,'门区过渡','开口与整体协调')]: f.node(376,y,224,88,t,s)
    f.node(704,224,216,104,'合并检查意见','人工判断是否调整')
    for a,b,mid in [(248,108,304),(304,428,336)]: f.line([(264,a),(mid,a),(mid,b),(376,b)])
    f.line([(264,268),(376,268)])
    for a,b,mid in [(108,248,656),(428,304,656)]: f.line([(600,a),(mid,a),(mid,b),(704,b)])
    f.line([(600,268),(704,268)])
    f.legend('本图为拟采用的专业检查方法，不表示平台已自动建立区域依赖。'); f.save()

    f=Figure(9,'主要功能入口与共用业务支撑',512,'六个现有业务入口分别承担设计、资料、协作与支撑任务，共用身份项目资产任务和审计能力。')
    f.panel(40,40,880,280,'现有业务入口')
    entries=[(56,104,'首页','概览与最近工作'),(352,104,'设计生成','零部件 · CMF · 客室'),(648,104,'资产中心','资料与结果复用'),(56,216,'设计工作台','项目与管理入口'),(352,216,'模型训练','样本与模型产物'),(648,216,'报告生成','章节与文件输出')]
    for x,y,t,s in entries: f.node(x,y,256,88,t,s)
    f.node(40,352,880,80,'共用业务支撑','身份权限 · 项目范围 · 资产引用 · 任务记录 · 通知审计')
    for x in [184,480,776]: f.line([(x,320),(x,352)])
    f.legend('业务入口不等同于独立算法系统；工程规则与模块知识仍需专项建设。'); f.save()

    f=Figure(10,'AI 聊天助手的文本与图片处理边界',496,'用户的文本与图片经平台个人会话校验后发给模型，文字答复保存到个人会话，不创建工作流任务。')
    for x,t in [(160,'用户'),(480,'平台后端'),(800,'图文模型')]:
        f.node(x-112,40,224,64,t)
        f.bg.append(f'<path d="M{x} 104 V424" stroke="#aaaaaa" stroke-width="1" stroke-dasharray="4 4"/>')
    for a,b,y,t,dash in [(160,480,172,'文本与图片',False),(480,800,244,'受限会话上下文',False),(800,480,316,'文字答复',True),(480,160,388,'保存并显示答复',True)]:
        f.line([(a,y),(b,y)],dash=dash); f.label((a+b)/2,y-16,t)
    f.legend('个人数据隔离；不调用设计工作流，不自动形成项目公共成果。'); f.save()

    f=Figure(11,'设计输入与成果复用的来源关系',512,'原图、参数和标记快照关联同一任务，输出经用户确认登记为项目资产，再供后续任务引用。')
    for x,t,s in [(40,'原始输入资产','实际执行底图'),(368,'本轮参数','文字 · 标记 · 配置'),(696,'标记快照','历史显示依据')]: f.node(x,40,224,96,t,s)
    f.node(40,192,880,72,'同一设计任务','关联项目、会话、能力版本、输入和参数')
    for x in [152,480,808]: f.line([(x,136),(x,192)])
    f.line([(152,264),(152,344)])
    for x,t,s in [(40,'任务结果','暂存输出'),(368,'项目资产','用户确认后登记'),(696,'后续任务','引用已登记资产')]: f.node(x,344,224,96,t,s)
    f.line([(264,392),(368,392)]); f.line([(592,392),(696,392)])
    f.legend('标记快照不能替代原图；保存状态不能替代专业评审结论。'); f.save()

    f=Figure(12,'既有产品平台对接的拟建边界',432,'现有项目资产任务服务经待建设的接口适配与既有产品平台交换资料，协议和目标环境需确认。')
    f.panel(40,40,256,240,'现有平台基础')
    f.panel(360,40,240,240,'拟建接口适配',True)
    f.panel(664,40,256,240,'既有产品平台',True)
    f.node(56,136,224,112,'项目 · 资产 · 任务','提供本地业务依据')
    f.node(376,136,208,112,'映射与交换','协议及实现待确认',dash=True)
    f.node(680,136,224,112,'产品及设计资料','真实联调待开展',dash=True)
    f.line([(280,192),(376,192)],True); f.line([(584,192),(680,192)],True)
    f.text(480,336,'前置确认：对象标识、身份权限、文件校验、状态及接收方式',20)
    f.legend('虚线为拟建与待确认范围；内部业务接口不等于已完成外部对接。'); f.save()

    f=Figure(13,'平台研究与建设的三阶段计划',560,'合同节点为2026年9月30日、12月31日及2027年3月31日，图示阶段内条带为建议工作安排。')
    f.text(40,56,'建议工作安排',24,True,'start')
    for i,label in enumerate(['9月','10月','11月','12月','1月','2月','3月']):
        f.text(288+i*96,96,label,20)
    f.text(432,56,'2026 年',20,True); f.text(768,56,'2027 年',20,True)
    tasks=[('研究与总体设计',0,1),('分区与快速设计完善',1,4),('分层验证与系统检测',1,4),('接口及最终功能验证',4,7),('成果整理与交付',4,7)]
    for i,(name,start,end) in enumerate(tasks):
        y=128+i*64
        f.text(40,y+28,name,20,False,'start')
        f.bg.append(f'<path d="M240 {y+52} H912" stroke="#dddddd" stroke-width="1"/>')
        f.rect(240+start*96+8,y+8,(end-start)*96-16,32,'#ededed',False,stroke='#505050')
    for x in [336,624,912]: f.bg.append(f'<path d="M{x} 112 V448" stroke="#505050" stroke-width="1.4" stroke-dasharray="8 4"/>')
    for x,label in [(336,'09-30'),(624,'12-31'),(872,'03-31')]: f.text(x,480,label,20,True)
    f.legend('条带：建议阶段安排；虚线：合同截止节点，不表示实际完成进度。'); f.save()

    f=Figure(14,'研究对照试验与评价证据组织',520,'固定输入基线后分别开展交互、识别、设计过程和跨区域试验，按适用指标形成证据记录。')
    f.node(40,40,880,80,'固定试验基线','资料来源 · 样本分组 · 设计任务 · 能力配置 · 评价口径')
    for x,t,s in [(40,'A 交互方法','文字与标记\n遮罩的比较'),(272,'B 区域识别','类别与边界\n独立样本验证'),(504,'C 设计过程','准备与等待\n修改及返工'),(736,'D 跨区检查','关联问题\n专业意见')]:
        f.node(x,196,184,112,t,s)
        f.line([(x+92,120),(x+92,196)])
        f.line([(x+92,308),(x+92,368)])
    f.node(40,368,880,80,'形成可复核证据','保留全部结果、失败样例、分项指标及适用条件')
    f.legend('本图为试验设计；不填入未经实施的样本量、准确率或效率提升值。'); f.save()


if __name__ == '__main__':
    make_figures()
    print(OUT)
