import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const OUT = path.join(ROOT, 'docs/rail-platform/presentation');
const WORK = path.join(OUT, 'generated');
const SHOTS = path.join(OUT, 'screenshots');
const W = 1600;
const H = 900;
const C = {
  bg: '#F4F6F8',
  white: '#FFFFFF',
  ink: '#17212B',
  text: '#344054',
  muted: '#667085',
  line: '#D9E0E7',
  red: '#C91838',
  red2: '#E64A68',
  blush: '#FCECEF',
  green: '#21875B',
  amber: '#D97706',
  dark: '#202831',
};

fs.mkdirSync(WORK, { recursive: true });

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (m) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[m],
  );
const dataUri = (file) =>
  `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
const img = Object.fromEntries(
  fs
    .readdirSync(SHOTS)
    .filter((f) => f.endsWith('.png'))
    .map((f) => [f.slice(0, 2), dataUri(path.join(SHOTS, f))]),
);

function lines(text, max = 22) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let cur = '';
    for (const ch of para) {
      const unit = /[\x00-\xff]/.test(ch) ? 0.55 : 1;
      const len = [...cur].reduce(
        (n, c) => n + (/[\x00-\xff]/.test(c) ? 0.55 : 1),
        0,
      );
      if (len + unit > max && cur) {
        out.push(cur);
        cur = ch;
      } else cur += ch;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function text(
  x,
  y,
  value,
  size = 28,
  color = C.ink,
  weight = 400,
  anchor = 'start',
  max = null,
  lineHeight = 1.35,
) {
  const arr = max ? lines(value, max) : String(value).split('\n');
  return `<text x="${x}" y="${y}" font-family="Noto Sans CJK SC, sans-serif" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${arr.map((s, i) => `<tspan x="${x}" dy="${i ? size * lineHeight : 0}">${esc(s)}</tspan>`).join('')}</text>`;
}

const rect = (x, y, w, h, fill = C.white, r = 20, stroke = 'none', sw = 1) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const circle = (x, y, r, fill = C.white, stroke = 'none', sw = 1) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const line = (x1, y1, x2, y2, stroke = C.line, sw = 2, dash = '') =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
const pill = (x, y, label, fill = C.blush, color = C.red, w = 122) =>
  `${rect(x, y, w, 36, fill, 18)}${text(x + w / 2, y + 25, label, 17, color, 600, 'middle')}`;
const icon = (x, y, label, fill = C.blush, color = C.red, r = 30) =>
  `${circle(x, y, r, fill)}${text(x, y + 8, label, 22, color, 700, 'middle')}`;

function chromeImage(x, y, w, h, uri, label = '') {
  const id = `clip${Math.round(x)}${Math.round(y)}${Math.round(w)}`;
  return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18"/></clipPath></defs>${rect(x, y, w, h, C.white, 18, C.line, 2)}<image href="${uri}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" clip-path="url(#${id})"/>${label ? pill(x + 18, y + 18, label, C.dark, C.white, Math.max(92, label.length * 21)) : ''}`;
}

function base(n, title, kicker, body, dark = false) {
  const bg = dark ? C.dark : C.bg;
  const ink = dark ? C.white : C.ink;
  const muted = dark ? '#C7D0D9' : C.muted;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="1600" height="900" fill="${bg}"/><path d="M0 0H1600V9H0Z" fill="${C.red}"/><text x="70" y="66" font-family="Noto Sans CJK SC" font-size="16" font-weight="700" letter-spacing="3" fill="${C.red2}">${esc(kicker.toUpperCase())}</text>${text(70, 124, title, 48, ink, 700)}${body ? text(72, 163, body, 20, muted, 400, 'start', 62) : ''}<text x="1518" y="844" font-family="Noto Sans CJK SC" font-size="15" fill="${muted}" text-anchor="end">${String(n).padStart(2, '0')} / 20</text><text x="70" y="844" font-family="Noto Sans CJK SC" font-size="13" fill="${muted}">轨道客室智能设计平台 · 项目介绍</text>`;
}
const end = '</svg>';

function metric(x, y, label, value, note, accent = C.red) {
  return `${rect(x, y, 270, 132, C.white, 18, C.line)}${text(x + 24, y + 31, label, 17, C.muted, 500)}${text(x + 24, y + 79, value, 36, accent, 800)}${text(x + 24, y + 108, note, 14, C.muted)}`;
}

function loopDiagram(cx, cy, r) {
  const nodes = [
    ['项目资产', '119 项', -90, '资'],
    ['开始设计', '7 会话', -18, '设'],
    ['AI 应用', '18 项能力', 54, 'AI'],
    ['任务执行', '31 项台账', 126, '任'],
    ['设计成果', '27 项入库', 198, '果'],
  ];
  let s = `<defs><filter id="glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${circle(cx, cy, r + 18, 'none', '#F7CCD5', 16)}${circle(cx, cy, r, 'none', '#D94762', 3)}${circle(cx, cy, 94, C.white, '#E8A8B4', 2)}${text(cx, cy - 5, '持续设计', 28, C.ink, 700, 'middle')}${text(cx, cy + 30, '输入 · 生成 · 验证 · 入库', 15, C.muted, 400, 'middle')}`;
  nodes.forEach(([a, b, deg, mark]) => {
    const rad = (deg * Math.PI) / 180;
    const x = cx + Math.cos(rad) * r;
    const y = cy + Math.sin(rad) * r;
    s +=
      icon(x, y, mark, C.white, C.red, 38) +
      text(
        x + Math.cos(rad) * 68,
        y + Math.sin(rad) * 68 - 2,
        a,
        20,
        C.ink,
        650,
        'middle',
      ) +
      text(
        x + Math.cos(rad) * 68,
        y + Math.sin(rad) * 68 + 23,
        b,
        14,
        C.muted,
        400,
        'middle',
      );
  });
  for (let i = 0; i < 3; i++) {
    const a = -75 + i * 120;
    const rad = (a * Math.PI) / 180;
    s += circle(
      cx + Math.cos(rad) * r,
      cy + Math.sin(rad) * r,
      7,
      C.red2,
      'none',
      0,
    ).replace(
      '/>',
      ` filter="url(#glow)"><animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="${7 + i}s" repeatCount="indefinite"/></circle>`,
    );
  }
  return s;
}

const slides = [];

slides.push(
  `${base(1, '轨道客室智能设计平台', 'RAIL CABIN AI DESIGN', '', true)}${text(78, 206, '以项目为边界，把 18 项 AI 能力、资产与任务组织成可持续的设计闭环', 27, '#E6EBF0', 400, 'start', 42)}${pill(78, 305, '项目化协同', '#3A2430', '#FFB7C5', 150)}${pill(240, 305, '真实 ComfyUI', '#3A2430', '#FFB7C5', 170)}${pill(422, 305, '资产可追溯', '#3A2430', '#FFB7C5', 150)}${loopDiagram(1160, 440, 205)}${rect(78, 682, 700, 88, '#2A333D', 18, '#46515D')}${text(108, 720, '稳定平台框架 + 可替换外部能力适配器', 24, C.white, 650)}${text(108, 752, 'Vue 3 · Nitro · PostgreSQL · MinIO · ComfyUI Worker', 17, '#C7D0D9')}${end}`,
);

slides.push(
  `${base(2, '为什么需要统一设计平台', 'PROBLEM', 'AI 能力越来越多，但真正的设计工作不能停留在“逐个工具调用”。')}${rect(70, 220, 1460, 500, C.white, 28, C.line)}${['能力入口分散', '素材重复上传', '结果难以复用', '任务状态割裂'].map((t, i) => `${icon(235 + i * 360, 330, String(i + 1))}${text(235 + i * 360, 400, t, 25, C.ink, 650, 'middle')}${text(235 + i * 360, 444, ['切换页面与上下文', '同一图片反复选择', '输出缺少资产身份', '失败与进度不可追踪'][i], 17, C.muted, 400, 'middle')}`).join('')}${line(235, 530, 1315, 530, '#E7A5B2', 4, '8 10')}${pill(606, 575, '统一项目上下文', C.red, C.white, 210)}${text(800, 653, '把人、项目、输入、任务、输出和审计连接成一条可追溯业务链', 24, C.text, 600, 'middle')}${end}`,
);

slides.push(
  `${base(3, '平台设计闭环', 'CORE WORKFLOW', '首页用动态图表达核心关系：不是线性流水线，而是持续迭代的设计循环。')}${rect(70, 205, 1460, 560, C.white, 28, C.line)}${loopDiagram(800, 485, 220)}${text(1320, 280, '真实统计', 18, C.red, 700, 'middle')}${metric(1180, 315, '资产', '119', '跨项目可访问', C.ink)}${metric(1180, 465, '任务', '31', '28 完成 / 3 异常', C.green)}${text(208, 694, '数据脉冲沿固定轨道循环，五个节点均可进入对应业务页面', 18, C.muted, 500)}${end}`,
);

slides.push(
  `${base(4, '项目是最高业务边界', 'PROJECT BOUNDARY', '普通用户的数据访问、资产复用与任务执行都必须落在明确的项目上下文中。')}${rect(100, 215, 1400, 520, C.white, 30, C.line)}${text(800, 275, 'PROJECT · CR-2026-xxxx', 20, C.muted, 700, 'middle')}${rect(170, 320, 330, 310, '#FFF7F8', 22, '#F1C4CD', 2)}${rect(635, 320, 330, 310, '#FFF7F8', 22, '#F1C4CD', 2)}${rect(1100, 320, 330, 310, '#FFF7F8', 22, '#F1C4CD', 2)}${icon(335, 385, '人')}${icon(800, 385, '资')}${icon(1265, 385, '任')}${text(335, 456, '成员与权限', 26, C.ink, 700, 'middle')}${text(335, 500, '创建者 / 管理员邀请\n项目成员按 ID 识别', 18, C.muted, 400, 'middle')}${text(800, 456, '项目资产', 26, C.ink, 700, 'middle')}${text(800, 500, '图片、文本、文档、3D\n统一登记与版本追踪', 18, C.muted, 400, 'middle')}${text(1265, 456, '任务台账', 26, C.ink, 700, 'middle')}${text(1265, 500, '参数、输入、输出、状态\n完整记录并可审计', 18, C.muted, 400, 'middle')}${line(500, 475, 635, 475, C.red2, 3, '8 8')}${line(965, 475, 1100, 475, C.red2, 3, '8 8')}${end}`,
);

slides.push(
  `${base(5, '从一个设计问题开始', 'DESIGN HOME', '登录后的“设计工作台”汇总全部可访问项目，帮助用户快速继续工作。')}${chromeImage(70, 205, 980, 550, img['03'], '真实首页')}${metric(1090, 230, '可访问资产', '119', '按当前账号汇总')}${metric(1090, 380, '设计会话', '7', '直接继续最近工作')}${metric(1090, 530, 'AI 能力', '18', '已接入工作流')}${text(1094, 705, '首页只聚合真实 API 数据，不用静态样例填充。', 18, C.text, 600, 'start', 28)}${end}`,
);

slides.push(
  `${base(6, '一个会话，组合多种 AI 能力', 'MULTI-APP CONVERSATION', '同一会话可多轮交互、切换不同应用，并在当前上下文内继续设计。')}${chromeImage(70, 205, 1030, 560, img['05'], '设计会话')}${rect(1140, 215, 360, 510, C.white, 24, C.line)}${text(1180, 270, '会话内能力编排', 25, C.ink, 700)}${['文生文：梳理设计意图', '文生图：形成视觉方案', '局部重绘：精确修改', '智能扩图：延展画面', '多图编辑：融合参考'].map((t, i) => `${icon(1195, 335 + i * 73, String(i + 1), i === 0 ? C.red : C.blush, i === 0 ? C.white : C.red, 22)}${text(1235, 342 + i * 73, t, 18, C.text, 550)}`).join('')}${text(1180, 690, '同一会话只允许一个任务运行；不同会话可并行。', 16, C.muted, 500, 'start', 25)}${end}`,
);

slides.push(
  `${base(7, '统一输入：文本、资产与参数合一', 'UNIFIED INPUT', '用户不再在多个页面之间搬运数据；输入、能力和快捷参数集中在同一个输入器。')}${rect(120, 260, 1360, 300, C.white, 34, '#F0A7B5', 3)}${text(170, 330, '描述你的设计需求…', 23, C.muted)}${line(160, 390, 1440, 390, C.line, 2)}${pill(170, 430, '＋ 添加素材', C.white, C.ink, 140)}${pill(328, 430, '文生图 ×', C.blush, C.red, 120)}${pill(466, 430, '模型', C.white, C.ink, 92)}${pill(576, 430, '比例 16:9', C.white, C.ink, 130)}${pill(724, 430, '风格', C.white, C.ink, 92)}${pill(834, 430, '更多', C.white, C.ink, 92)}${circle(1382, 466, 38, C.red)}${text(1382, 476, '↑', 34, C.white, 800, 'middle')}${text(800, 620, '主参数原位快速修改 · 完整参数由“更多”展开 · 图片与 Markdown 资产均可输入', 22, C.text, 600, 'middle')}${text(800, 666, '发送后清空输入，并把文本、图片、参数和有序资产保存为不可变任务快照', 17, C.muted, 400, 'middle')}${end}`,
);

const workflowNames = [
  '文生文',
  '文生图',
  '多图融合',
  '局部重绘',
  '智能扩图',
  '分区编辑',
  '双图编辑',
  '镜头调整',
  '图像理解',
  '实时捕捉',
  '2D 生 3D',
  '多视图生 3D',
  'CMF 方案',
  '客室效果',
  '零部件生成',
  'LoRA 训练',
  '自动报告',
  '模型处理',
];
slides.push(
  `${base(8, '18 项能力：以统一契约接入', 'CAPABILITY MATRIX', '原始 ComfyUI API JSON 保持只读；平台用版本化映射公开业务参数与资产契约。')}${rect(70, 205, 1460, 560, C.white, 28, C.line)}${workflowNames
    .map((t, i) => {
      const col = i % 6;
      const row = Math.floor(i / 6);
      const x = 105 + col * 238;
      const y = 255 + row * 145;
      return `${rect(x, y, 210, 112, row === 0 ? '#FFF5F7' : '#FAFBFC', 18, row === 0 ? '#EAB0BC' : C.line)}${pill(x + 15, y + 15, ['文本', '生成', '编辑'][row], row === 0 ? C.blush : '#F1F3F5', row === 0 ? C.red : C.muted, 62)}${text(x + 18, y + 78, t, 20, C.ink, 650)}`;
    })
    .join(
      '',
    )}${text(800, 742, '共同遵守：输入资产类型 · 参数 Schema · 输出类型 · 版本快照 · 失败错误码', 17, C.muted, 500, 'middle')}${end}`,
);

slides.push(
  `${base(9, '特殊节点也需要业务化交互', 'SPECIAL NODES', '遮罩、分区重绘、实时捕捉、图像对比和镜头控制不能退化成普通文件上传。')}${chromeImage(70, 205, 970, 560, img['08'], '遮罩编辑器')}${rect(1080, 205, 450, 560, C.white, 24, C.line)}${text(1120, 258, '对齐 ComfyUI 的关键体验', 24, C.ink, 700)}${['画笔、橡皮、填充、取色', '撤销 / 重做 / 清除', '遮罩图层与绘制图层', '保存后登记项目资产', '结果继续用于下一能力'].map((t, i) => `${circle(1140, 330 + i * 73, 17, C.blush)}${text(1140, 337 + i * 73, '✓', 16, C.red, 800, 'middle')}${text(1174, 337 + i * 73, t, 19, C.text, 550)}`).join('')}${pill(1120, 690, '统一交互组件', C.red, C.white, 180)}${end}`,
);

slides.push(
  `${base(10, '结果不是终点，而是下一轮输入', 'CONTINUE DESIGN', '每轮保留输入、参数、状态和输出；用户可查看、下载、入库、继续设计或复用运行。')}${chromeImage(70, 205, 1050, 560, img['05'], '多轮结果')}${rect(1160, 225, 340, 490, C.white, 24, C.line)}${text(1200, 275, '结果操作', 25, C.ink, 700)}${['复制 / 下载', '加入项目资产', '流转到本会话能力', '遮罩与对比', '复用本轮再次运行'].map((t, i) => `${icon(1218, 340 + i * 70, ['复', '下', '转', '比', '再'][i], C.blush, C.red, 23)}${text(1260, 347 + i * 70, t, 18, C.text, 550)}`).join('')}${text(1200, 690, '暂存输出不会自动入库；\n用户确认后才成为可复用资产。', 16, C.muted, 500, 'start', 23)}${end}`,
);

slides.push(
  `${base(11, '资产是能力之间的交换协议', 'ASSET PROTOCOL', '输出只有登记为同项目资产后，才能被其他能力安全复用。')}${rect(90, 235, 1420, 470, C.white, 28, C.line)}${[
    '应用 A 输出',
    '暂存结果',
    '用户确认入库',
    '项目资产',
    '应用 B 输入',
  ]
    .map((t, i) => {
      const x = 145 + i * 285;
      return `${icon(x + 80, 380, ['A', '临', '✓', '资', 'B'][i], i === 3 ? C.red : C.blush, i === 3 ? C.white : C.red, 42)}${text(x + 80, 458, t, 21, C.ink, 650, 'middle')}${i < 4 ? `${line(x + 132, 380, x + 232, 380, i === 2 ? C.red2 : C.line, 4, '9 7')}<polygon points="${x + 230},372 ${x + 246},380 ${x + 230},388" fill="${i === 2 ? C.red2 : C.line}"/>` : ''}`;
    })
    .join(
      '',
    )}${text(800, 560, '跨能力复用校验', 20, C.red, 700, 'middle')}${pill(395, 600, '同一项目', C.blush, C.red, 130)}${pill(545, 600, '当前用户', C.blush, C.red, 130)}${pill(695, 600, '类型兼容', C.blush, C.red, 130)}${pill(845, 600, '目标输入位', C.blush, C.red, 150)}${pill(1015, 600, '版本可追溯', C.blush, C.red, 160)}${end}`,
);

slides.push(
  `${base(12, '资产中心：多模态、目录化、可追溯', 'ASSET CENTER', '统一管理用户上传与应用输出，支持目录、收藏、筛选、排序、批量操作和详情深链。')}${chromeImage(70, 205, 1030, 560, img['06'], '资产中心')}${rect(1140, 215, 360, 510, C.white, 24, C.line)}${text(1180, 266, '当前实况', 24, C.ink, 700)}${text(1180, 326, '118', 42, C.red, 800)}${text(1270, 326, '图片', 18, C.muted, 500)}${rect(1180, 350, 260, 16, '#EEF0F3', 8)}${rect(1180, 350, 255, 16, C.red2, 8)}${text(1180, 418, '1', 36, C.ink, 800)}${text(1232, 418, 'Markdown 文本', 18, C.muted, 500)}${rect(1180, 442, 260, 16, '#EEF0F3', 8)}${rect(1180, 442, 18, 16, C.red2, 8)}${text(1180, 520, '文件类型', 17, C.muted, 600)}${text(1180, 557, 'image · video · audio · text', 16, C.text)}${text(1180, 587, 'document · model3d · model · archive', 16, C.text)}${pill(1180, 650, '收藏是软链接', C.blush, C.red, 180)}${end}`,
);

slides.push(
  `${base(13, '任务中心：统一执行台账', 'JOB LEDGER', '状态、进度、错误、创建者、输入输出和执行记录统一进入任务台账。')}${chromeImage(70, 205, 1030, 560, img['07'], '任务中心')}${metric(1140, 230, '累计任务', '31', '跨项目当前账号可见', C.ink)}${metric(1140, 380, '已完成', '28', '结果已登记或明确结束', C.green)}${metric(1140, 530, '异常', '3', '展示稳定错误码', C.amber)}${text(1140, 700, '未配置外部适配器时明确失败，绝不伪造成功。', 16, C.muted, 600, 'start', 29)}${end}`,
);

slides.push(
  `${base(14, '验证结果：对比、遮罩与三维预览', 'RESULT VALIDATION', '用视觉对比确认修改范围，用交互查看器验证 3D 成果。')}${rect(70, 220, 720, 500, C.white, 26, C.line)}${text(110, 270, '左右滑动图像对比', 24, C.ink, 700)}${rect(110, 305, 640, 330, '#E9EDF1', 18)}${rect(110, 305, 318, 330, '#D7DDE3', 18)}${text(269, 475, '原始输入', 25, C.muted, 700, 'middle')}${text(590, 475, '生成结果', 25, C.red, 700, 'middle')}${line(430, 305, 430, 635, C.white, 4)}${circle(430, 470, 28, C.dark)}${text(430, 478, '↔', 20, C.white, 700, 'middle')}${pill(110, 655, '只读工作流快照推断', C.blush, C.red, 220)}${rect(830, 220, 700, 500, C.dark, 26)}${text(875, 270, '三维结果交互查看', 24, C.white, 700)}${line(930, 610, 1430, 610, '#69737F', 2)}${line(1180, 340, 1180, 610, '#69737F', 2)}${['场景', '模型', '摄影机', '灯光', '控制', '导出'].map((t, i) => pill(875 + (i % 3) * 180, 650 + Math.floor(i / 3) * 45, t, '#303A45', '#E6EBF0', 120)).join('')}${circle(1180, 475, 105, '#3C4651', '#E6EBF0', 3)}${text(1180, 487, '3D', 42, C.white, 800, 'middle')}${end}`,
);

slides.push(
  `${base(15, '典型任务：从需求到客室方案', 'USE CASE', '以“现代客室空间方案”为例，平台把设计过程拆成可追溯的多轮协作。')}${rect(80, 235, 1440, 440, C.white, 28, C.line)}${[
    '需求描述',
    '参考资产',
    '文生图探索',
    '局部/分区修改',
    '对比验证',
    '成果入库',
  ]
    .map((t, i) => {
      const x = 130 + i * 235;
      return `${icon(x + 65, 370, String(i + 1), i === 5 ? C.red : C.blush, i === 5 ? C.white : C.red, 34)}${text(x + 65, 442, t, 19, C.ink, 650, 'middle')}${i < 5 ? `${line(x + 105, 370, x + 195, 370, C.red2, 3, '7 7')}<polygon points="${x + 193},363 ${x + 207},370 ${x + 193},377" fill="${C.red2}"/>` : ''}`;
    })
    .join(
      '',
    )}${text(800, 580, '每一步都绑定项目、会话、应用版本、参数快照、输入资产与输出资产', 21, C.text, 600, 'middle')}${pill(590, 710, '设计过程可复盘', C.red, C.white, 200)}${pill(810, 710, '成果可继续迭代', C.dark, C.white, 200)}${end}`,
);

slides.push(
  `${base(16, '团队协作与数据边界', 'COLLABORATION', '项目成员共享业务成果，但用户私有会话和权限边界仍由后端强制校验。')}${rect(80, 220, 680, 510, C.white, 28, C.line)}${text(120, 275, '项目协作', 25, C.ink, 700)}${icon(220, 390, '创', C.red, C.white, 44)}${icon(420, 390, '编', C.blush, C.red, 44)}${icon(620, 390, '读', '#EEF1F4', C.muted, 44)}${text(220, 465, '创建者', 20, C.ink, 650, 'middle')}${text(420, 465, '编辑成员', 20, C.ink, 650, 'middle')}${text(620, 465, '只读成员', 20, C.ink, 650, 'middle')}${line(265, 390, 375, 390, C.line, 3, '7 7')}${line(465, 390, 575, 390, C.line, 3, '7 7')}${text(120, 550, '按 USR-* 邀请 · 成员贡献可筛选 · 移除不删除历史业务数据', 17, C.muted, 500, 'start', 48)}${rect(800, 220, 720, 510, C.dark, 28)}${text(845, 275, '不可越过的边界', 25, C.white, 700)}${['普通用户仅访问参与项目', '管理员权限不等于读取他人 AI 正文', '资产和任务查询强制项目范围', '关键动作记录审计元数据'].map((t, i) => `${circle(865, 350 + i * 75, 16, '#3A4651')}${text(865, 357 + i * 75, '✓', 15, '#FFB7C5', 800, 'middle')}${text(900, 357 + i * 75, t, 19, '#E6EBF0', 500)}`).join('')}${end}`,
);

slides.push(
  `${base(17, '稳定平台框架 + 可替换能力适配器', 'ARCHITECTURE', '外部 AI、ComfyUI、LoRA、3D 和报告服务通过后端适配器接入，不把地址与密钥暴露给浏览器。')}${rect(90, 205, 1420, 560, C.white, 28, C.line)}${[
    'Web 体验层',
    '平台 API 与领域层',
    '数据与对象存储',
    '外部能力适配层',
  ]
    .map((t, i) => {
      const y = 255 + i * 112;
      const fills = ['#FFF4F6', '#FFF9FA', '#F7F9FB', '#202831'];
      return `${rect(150, y, 1300, 84, fills[i], 18, i === 3 ? 'none' : C.line)}${text(190, y + 34, t, 20, i === 3 ? C.white : C.red, 700)}${text(410, y + 34, ['Vue 3 · Pinia · Router · Ant Design Vue', '认证 · RBAC · 项目 · 资产 · 会话 · 任务 · 审计', 'PostgreSQL 17 · MinIO / S3 · 私有对象', 'ComfyUI Worker · LLM API · 2D→3D · LoRA · 报告'][i], 19, i === 3 ? '#E6EBF0' : C.text, 500)}${text(190, y + 64, ['固定外壳与沉浸式设计入口', '所有边界校验与业务真值', '结构化元数据和多模态文件', '版本化契约、超时、取消与明确失败'][i], 15, i === 3 ? '#AAB4BF' : C.muted)}`;
    })
    .join('')}${end}`,
);

slides.push(
  `${base(18, '完整血缘：每一次生成都能追溯', 'TRACEABILITY', '稳定业务 ID 用于页面、搜索和协作；UUID 继续作为内部关系主键。')}${rect(85, 230, 1430, 420, C.white, 28, C.line)}${[
    'USR-000001',
    'CR-2026-0001',
    'DSC / Conversation',
    'TSK-00000001',
    'AST-00000001',
  ]
    .map((t, i) => {
      const x = 120 + i * 286;
      return `${rect(x, 330, 236, 110, i === 3 ? '#FFF1F4' : '#FAFBFC', 18, i === 3 ? '#E694A5' : C.line, 2)}${text(x + 118, 374, ['用户', '项目', '设计会话', '任务', '资产'][i], 17, C.muted, 600, 'middle')}${text(x + 118, 414, t, 18, i === 3 ? C.red : C.ink, 700, 'middle')}${i < 4 ? `${line(x + 236, 385, x + 276, 385, C.red2, 3)}<polygon points="${x + 274},378 ${x + 288},385 ${x + 274},392" fill="${C.red2}"/>` : ''}`;
    })
    .join(
      '',
    )}${text(800, 555, '应用版本 · 参数快照 · 有序输入 · Worker 执行 · 输出登记 · 审计事件', 20, C.text, 600, 'middle')}${pill(480, 700, '可定位', C.blush, C.red, 140)}${pill(640, 700, '可复盘', C.blush, C.red, 140)}${pill(800, 700, '可审计', C.blush, C.red, 140)}${pill(960, 700, '可继续设计', C.red, C.white, 170)}${end}`,
);

slides.push(
  `${base(19, 'Linux 本地开发：一条命令启动完整环境', 'LOCAL DEPLOYMENT', 'Web 与 API 使用本机 Node.js；PostgreSQL、MinIO、Mailpit 由 Docker Compose 提供。')}${rect(80, 220, 1440, 500, C.white, 28, C.line)}${[
    '环境检查',
    '基础设施',
    '数据库迁移',
    '种子初始化',
    'Web + API',
  ]
    .map((t, i) => {
      const x = 120 + i * 285;
      return `${icon(x + 70, 360, String(i + 1), i === 4 ? C.red : C.blush, i === 4 ? C.white : C.red, 38)}${text(x + 70, 430, t, 20, C.ink, 650, 'middle')}${i < 4 ? `${line(x + 112, 360, x + 240, 360, C.line, 4, '8 8')}<polygon points="${x + 238},352 ${x + 254},360 ${x + 238},368" fill="${C.line}"/>` : ''}`;
    })
    .join(
      '',
    )}${rect(265, 535, 1070, 80, C.dark, 16)}${text(800, 584, './rail-platform.sh start', 28, C.white, 700, 'middle')}${text(800, 665, 'Web 5666 · API 5320 · MinIO 9000/9001 · Mailpit 8025', 18, C.muted, 500, 'middle')}${pill(585, 715, 'check_env', C.blush, C.red, 120)}${pill(720, 715, 'status', C.blush, C.red, 110)}${pill(845, 715, 'restart', C.blush, C.red, 110)}${pill(970, 715, 'stop', C.blush, C.red, 100)}${end}`,
);

slides.push(
  `${base(20, '让 AI 能力真正进入设计业务', 'SUMMARY', '', true)}${text(80, 205, '平台的价值不在于“拥有多少模型”，而在于把每次输入、生成、验证和复用组织起来。', 28, '#E6EBF0', 500, 'start', 48)}${['项目是数据边界', '会话是设计上下文', '资产是交换协议', '任务是执行台账'].map((t, i) => `${rect(80 + i * 370, 330, 330, 180, i === 3 ? C.red : '#2C3540', 24, i === 3 ? 'none' : '#46515D')}${text(112 + i * 370, 390, `0${i + 1}`, 20, i === 3 ? '#FFD7DF' : '#FF9DB0', 800)}${text(112 + i * 370, 448, t, 26, C.white, 700)}${text(112 + i * 370, 485, ['人、资产、任务受控共享', '多轮组合 18 项能力', '结果确认后才能跨能力复用', '状态、进度、错误可追溯'][i], 16, i === 3 ? '#FFE7EC' : '#B9C2CC', 400, 'start', 22)}`).join('')}${text(80, 650, '下一阶段', 18, '#FF9DB0', 700)}${text(80, 700, '真实 GPU 长任务验收  ·  更多企业能力适配  ·  试运行与备份恢复演练', 24, C.white, 550)}${pill(80, 758, '持续设计，从一个问题开始', C.red, C.white, 310)}${end}`,
);

if (slides.length !== 20)
  throw new Error(`Expected 20 slides, got ${slides.length}`);

for (let i = 0; i < slides.length; i++) {
  fs.writeFileSync(
    path.join(WORK, `slide-${String(i + 1).padStart(2, '0')}.svg`),
    slides[i],
  );
}

const chrome = '/usr/bin/google-chrome';
for (let i = 0; i < slides.length; i++) {
  const n = String(i + 1).padStart(2, '0');
  execFileSync(
    chrome,
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${W},${H}`,
      `--screenshot=${path.join(WORK, `slide-${n}.png`)}`,
      `file://${path.join(WORK, `slide-${n}.svg`)}`,
    ],
    { stdio: 'ignore' },
  );
}

const pkg = path.join(WORK, 'pptx-package');
fs.rmSync(pkg, { recursive: true, force: true });
for (const d of [
  '_rels',
  'docProps',
  'ppt/_rels',
  'ppt/slides/_rels',
  'ppt/slides',
  'ppt/media',
  'ppt/slideMasters/_rels',
  'ppt/slideMasters',
  'ppt/slideLayouts/_rels',
  'ppt/slideLayouts',
  'ppt/theme',
])
  fs.mkdirSync(path.join(pkg, d), { recursive: true });
const write = (p, s) => fs.writeFileSync(path.join(pkg, p), s);
const sldIds = slides
  .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
  .join('');
const presRels = [
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>`,
  ...slides.map(
    (_, i) =>
      `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`,
  ),
  `<Relationship Id="rId${slides.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>`,
  `<Relationship Id="rId${slides.length + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>`,
  `<Relationship Id="rId${slides.length + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>`,
].join('');
write(
  '[Content_Types].xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/><Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/><Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
);
write(
  '_rels/.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
);
write(
  'docProps/core.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>轨道客室智能设计平台项目介绍</dc:title><dc:creator>Codex</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">2026-08-14T00:00:00Z</dcterms:created></cp:coreProperties>`,
);
write(
  'docProps/app.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office PowerPoint</Application><PresentationFormat>Widescreen</PresentationFormat><Slides>20</Slides></Properties>`,
);
write(
  'ppt/presentation.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`,
);
write(
  'ppt/_rels/presentation.xml.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${presRels}</Relationships>`,
);
write(
  'ppt/presProps.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`,
);
write(
  'ppt/viewProps.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" lastView="slideView"><p:normalViewPr/><p:slideViewPr/><p:notesTextViewPr/><p:gridSpacing cx="78028800" cy="78028800"/></p:viewPr>`,
);
write(
  'ppt/tableStyles.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
);
write(
  'ppt/slideMasters/slideMaster1.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`,
);
write(
  'ppt/slideMasters/_rels/slideMaster1.xml.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
);
write(
  'ppt/slideLayouts/slideLayout1.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld></p:sldLayout>`,
);
write(
  'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
);
write(
  'ppt/theme/theme1.xml',
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Rail"><a:themeElements><a:clrScheme name="Rail"><a:dk1><a:srgbClr val="17212B"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="344054"/></a:dk2><a:lt2><a:srgbClr val="F4F6F8"/></a:lt2><a:accent1><a:srgbClr val="C91838"/></a:accent1><a:accent2><a:srgbClr val="E64A68"/></a:accent2><a:accent3><a:srgbClr val="21875B"/></a:accent3><a:accent4><a:srgbClr val="D97706"/></a:accent4><a:accent5><a:srgbClr val="667085"/></a:accent5><a:accent6><a:srgbClr val="D9E0E7"/></a:accent6><a:hlink><a:srgbClr val="C91838"/></a:hlink><a:folHlink><a:srgbClr val="8A102A"/></a:folHlink></a:clrScheme><a:fontScheme name="Rail"><a:majorFont><a:latin typeface="Noto Sans CJK SC"/><a:ea typeface="Noto Sans CJK SC"/><a:cs typeface="Noto Sans CJK SC"/></a:majorFont><a:minorFont><a:latin typeface="Noto Sans CJK SC"/><a:ea typeface="Noto Sans CJK SC"/><a:cs typeface="Noto Sans CJK SC"/></a:minorFont></a:fontScheme><a:fmtScheme name="Rail"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`,
);

for (let i = 0; i < slides.length; i++) {
  const n = i + 1;
  fs.copyFileSync(
    path.join(WORK, `slide-${String(n).padStart(2, '0')}.png`),
    path.join(pkg, `ppt/media/image${n}.png`),
  );
  write(
    `ppt/slides/slide${n}.xml`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide ${n}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="12192000" cy="6858000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`,
  );
  write(
    `ppt/slides/_rels/slide${n}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${n}.png"/></Relationships>`,
  );
}

const pptx = path.join(OUT, '轨道客室智能设计平台项目介绍.pptx');
fs.rmSync(pptx, { force: true });
execFileSync('/usr/bin/zip', ['-qr', pptx, '.'], { cwd: pkg });
console.log(pptx);
