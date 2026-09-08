"""Generate the repository-local architecture diagrams (Python standard library)."""
from pathlib import Path
from html import escape
P=Path(__file__).resolve().parent
PAPER='#f4f6f8'; INK='#20252c'; MUTED='#5e6975'; RED='#b91c32'
def start(name,title,desc,h):
 return [f'<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="{h}" viewBox="0 0 1600 {h}" role="img" aria-labelledby="{name}-title {name}-desc"><title id="{name}-title">{title}</title><desc id="{name}-desc">{desc}</desc>',f'<defs>'+''.join(f'<marker id="{i}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="{c}"/></marker>' for i,c in [('arrow',MUTED),('arrow-accent',RED),('arrow-link',MUTED)])+'</defs>',f'<rect width="1600" height="{h}" fill="{PAPER}"/>', '<style>text{font-family:Geist,"Noto Sans CJK SC",sans-serif;fill:#20252c}.sub{fill:#5e6975;font-size:20px}.title{font-family:"Instrument Serif","Noto Serif CJK SC",serif;font-size:36px}.name{font-size:24px;font-weight:600}.small{font-size:16px;fill:#5e6975}</style>']
def txt(s,x,y,t,cls='sub'): s.append(f'<text x="{x}" y="{y}" class="{cls}">{escape(t)}</text>')
def box(s,x,y,w,h,title,lines,focal=False):
 s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="'+('#fff0f2' if focal else '#ffffff')+f'" stroke="{RED if focal else MUTED}" stroke-width="1.2"/>')
 txt(s,x+24,y+40,title,'name')
 for i,line in enumerate(lines):txt(s,x+24,y+76+i*28,line)
def arrow(s,d,dashed=False):s.append(f'<path d="{d}" fill="none" stroke="{MUTED}" stroke-width="1.2"'+(' stroke-dasharray="8,4"' if dashed else '')+' marker-end="url(#arrow)"/>')
s=start('overview','轨道客室智能设计平台 · 整体架构','开发机上的平台、独立能力服务、共享模型与持久化边界；连接表示实现或配置关系，不代表当前在线。',1080)
txt(s,48,56,'轨道客室智能设计平台 · 整体架构','title');txt(s,48,96,'开发机单机多项目 / 2026-09-08 核对 / 实线为调用与读写；虚线为离线配置中的模型依赖')
# Connectors precede nodes. Each edge has a separate attachment point.
for d in ['M368 240H464','M944 240H1040','M944 512H1000Q1008 512 1008 504V428Q1008 420 1016 420H1040','M944 600H1040','M944 760H1040','M464 540H368','M464 736H368']:arrow(s,d)
arrow(s,'M1392 752H1464Q1472 752 1472 744V248Q1472 240 1464 240H1392',True)
box(s,48,160,320,176,'平台 Web', ['Vue 3 / Ant Design Vue', '身份、项目、设计、资产', '训练、报告、全局助手'])
box(s,48,464,320,160,'PostgreSQL', ['平台业务与权限真值', '任务队列、租约、审计', '会话、资产元数据'])
box(s,48,668,320,160,'MinIO / S3', ['私有对象存储', '输入素材、暂存结果', '模型、报告、助手附件'])
box(s,464,160,480,640,'vue-vben-admin · 平台后端', ['apps/platform-api · Nitro / H3', '认证 / RBAC / 项目范围 / 审计'],True)
s.append('<path d="M488 308H920M488 480H920" stroke="#dde2e7"/>')
txt(s,488,352,'API：同步请求与持久化任务','name');txt(s,488,392,'AI 助手 → 受控多模态转发');txt(s,488,432,'业务任务 → PostgreSQL 执行记录')
txt(s,488,528,'独立 Worker 进程','name');txt(s,488,568,'ComfyUI / LoRA / Report 三个循环');txt(s,488,608,'领取任务、轮询、取消、失败恢复');txt(s,488,648,'读取输入 → 调用能力 → 接收产物');txt(s,488,704,'报告 template：内置文件渲染');txt(s,488,744,'报告 ai：调用 Presenton')
box(s,1040,160,352,160,'rail-vllm · Qwen3-VL', ['Docker / 8B-Instruct', 'OpenAI-compatible API', '共享多模态推理能力'])
box(s,1040,360,352,136,'ComfyUI', ['工作流 JSON / 自定义节点', 'GPU 推理 / 图片与三维等'])
box(s,1040,540,352,136,'AI Toolkit', ['LoRA 数据集 / GPU 队列', '训练、Loss、checkpoint'])
box(s,1040,716,352,144,'Presenton', ['FastAPI + Next.js 渲染', '文字 + 图片 → 结构化计划', 'DOCX / PPTX / Markdown'])
txt(s,48,376,'浏览器通过 API 获取预签名 URL','small');txt(s,48,404,'再直传或读取 MinIO（连线省略）','small')
txt(s,48,888,'数据归属：平台保存业务真值；各执行服务保留自己的模型、工作目录及内部状态。')
s.append('<path d="M48 920H1552" stroke="#dde2e7"/>')
txt(s,48,956,'资产回流：ComfyUI 结果先暂存，用户确认入库；LoRA 与报告成功后自动登记为项目资产。')
txt(s,48,992,'运行快照：PostgreSQL / MinIO / Mailpit 在线；rail-vllm 已停止；业务入口端口未监听。','small')
txt(s,48,1024,'辅助服务：Mailpit 为开发邮件服务，生产使用企业 SMTP。图中未展开页面、数据表和每个工作流节点。','small')
s.append('</svg>');overview=''.join(s);(P/'overview.svg').write_text(overview)
s=start('report','报告生成 · 两条执行路径','平台模板渲染与外部 Presenton AI 渲染共用任务和资产入库。',800)
txt(s,48,56,'报告生成 · 两条执行路径','title');txt(s,48,96,'已确认外部服务归属 presenton；助手与 AI 报告共享 rail-vllm 的部署配置')
for d in ['M384 264H496','M816 248H928','M656 328V448','M1248 264H1312','M928 296H880Q872 296 872 304V524Q872 532 864 532H816','M496 532H384'] :arrow(s,d)
box(s,48,192,336,144,'平台报告 API',['校验项目与图片资产','持久化 jobs + report 执行记录'])
box(s,496,192,320,136,'Report Worker',['领取租约 / 读取图片','按 generation_mode 分流'],True)
box(s,928,192,320,144,'Presenton · AI',['POST /api/v1/generate-file','接收 multipart 文字与图片'])
box(s,1312,192,240,144,'rail-vllm',['Qwen3-VL','生成结构化内容'])
box(s,496,448,320,176,'生成文件与校验',['template：平台内置渲染','ai：接收上游文件字节','DOCX / PPTX / MD'])
box(s,48,448,336,176,'平台资产入库',['写入 MinIO 私有桶','事务登记资产与 job_outputs','成功 / 失败 / 取消留痕'])
txt(s,952,404,'Presenton 内部导出：','name');txt(s,952,444,'Word / MD：本地渲染');txt(s,952,480,'PPT：本地模板 + Next.js 导出');txt(s,952,556,'上游同步请求不提供取消端点','small')
s.append('<path d="M48 676H1552" stroke="#dde2e7"/>');txt(s,48,716,'契约差异：平台最多 24 张图片；Presenton 最多 8 张。AI 报告需对齐上限或设计拆分策略。');txt(s,48,756,'取消语义：平台可阻止结果入库，但当前不能保证立即中断 Presenton 内部推理。','small')
s.append('</svg>');report=''.join(s);(P/'report.svg').write_text(report)
html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>轨道客室智能设计平台架构</title><style>body{margin:0;background:#f4f6f8;color:#20252c;font-family:"Noto Sans CJK SC",sans-serif}main{max-width:1600px;margin:auto}svg{display:block;width:100%;height:auto}nav{padding:20px 48px;border-bottom:1px solid #dde2e7}a{color:#b91c32;margin-right:24px}section{margin-bottom:32px}@media print{nav{display:none}section{break-after:page}}</style><nav><a href="#overview">整体架构</a><a href="#report">报告链路</a></nav><main>'''+f'<section id="overview">{overview}</section><section id="report">{report}</section></main></html>'
# Distinct marker IDs across inline SVGs.
html=html.replace(f'<section id="report">{report}', '<section id="report">'+report.replace('id="arrow','id="report-arrow').replace('url(#arrow','url(#report-arrow'))
(P/'index.html').write_text(html)
