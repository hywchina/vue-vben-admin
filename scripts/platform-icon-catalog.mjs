import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const platform = 'apps/web-antd/src/modules/platform/';
const scanRoots = [
  'apps/web-antd/src',
  'packages/effects/layouts/src',
  'packages/effects/common-ui/src',
  'packages/@core/ui-kit',
];
const read = (path) => readFileSync(join(root, path), 'utf8');
function walk(path) {
  return readdirSync(join(root, path), { withFileTypes: true }).flatMap(
    (item) => {
      const child = `${path}/${item.name}`;
      return item.isDirectory() ? walk(child) : [child];
    },
  );
}
export function iconSources() {
  return scanRoots
    .flatMap((path) => walk(path))
    .filter(
      (path) => /\.(ts|vue)$/.test(path) && !/\.(test|spec)\.ts$/.test(path),
    )
    .map((path) => ({ path, text: read(path) }));
}

const businessMeanings = {
  access: '成员、用户与权限',
  applications: 'AI 应用与能力目录',
  assets: '资产中心、项目资产、加入资产',
  audit: '操作日志与审计',
  cabin: '客室效果',
  cmf: 'CMF 色彩、材料与表面工艺',
  component: '客室零部件',
  conversations: '会话数量、文本对话能力',
  design: '设计生成入口',
  history: '历史会话、查看我的设计',
  home: '首页',
  jobs: '累计任务、任务台账',
  modelTraining: 'LoRA 模型训练',
  newDesign: '新建设计、无结果时的设计占位',
  profile: '个人用户',
  projects: '项目、项目选择',
  report: '报告生成、报告业务分类',
  runningJobs: '运行任务、开始运行',
  security: '角色权限、安全状态',
  workbench: '设计工作台',
  workflow: '工作流管理、工作流版本',
  mask: '遮罩、局部重绘',
};
const typeMeanings = {
  archive: '压缩包',
  audio: '音频',
  document: '文档',
  image: '图片',
  model: '模型权重文件',
  model3d: '3D 模型',
  text: '文本',
  video: '视频',
};
const sharedMeanings = {
  ArrowDown: '向下移动',
  ArrowLeft: '返回',
  ArrowLeftToLine: '关闭右侧标签',
  ArrowRightLeft: '切换/调整标签',
  ArrowRightToLine: '关闭左侧标签',
  ArrowUp: '向上移动',
  ArrowUpToLine: '返回顶部',
  Bell: '通知',
  Check: '确认/选中',
  ChevronDown: '展开下拉',
  ChevronLeft: '上一项/收起',
  ChevronRight: '下一项/展开',
  ChevronsDown: '展开全部',
  ChevronRightIcon: '下一页（ChevronRight 同图）',
  ChevronUp: '向上滚动',
  CircleIcon: '单选项（Circle 同图）',
  ChevronsLeft: '快速向左',
  ChevronsRight: '快速向右',
  Circle: '未选中',
  CircleAlert: '警告',
  CircleCheck: '成功/选中',
  CircleHelp: '帮助',
  CircleX: '关闭/清空全部',
  Copy: '复制',
  CornerDownLeft: '回车快捷键',
  Download: '下载',
  Ellipsis: '更多',
  EmptyIcon: '公共空列表插画（不是业务资产）',
  ExternalLink: '外部链接',
  Eye: '显示密码',
  EyeOff: '隐藏密码',
  FoldHorizontal: '标签两侧收拢',
  Grip: '拖拽排序',
  GripVertical: '竖向拖拽手柄',
  IconDefault: '默认菜单项',
  Inbox: '通知为空',
  Info: '信息提示',
  InspectionPanel: '标签概览',
  Languages: '语言',
  LayoutGrid: '网格布局',
  List: '列表布局',
  LoaderCircle: '加载中',
  LockKeyhole: '锁定屏幕',
  LogOut: '退出登录',
  MailCheck: '通知已读（沿用信箱图形，不是邮件服务）',
  Maximize2: '全屏',
  MdiKeyboardEsc: 'Esc 快捷键',
  MdiMenuClose: '收起菜单',
  MdiMenuOpen: '展开菜单',
  Menu: '菜单',
  Minimize2: '退出全屏',
  MoonStar: '暗色主题',
  Paintbrush: '画笔',
  Minus: '减少/部分选择/分隔符',
  MoreHorizontal: '更多（Ellipsis 同图）',
  Palette: '主题颜色（不是 CMF 业务分类）',
  PanelLeft: '左侧布局',
  PanelRight: '右侧布局',
  Pin: '置顶',
  PinOff: '取消置顶',
  Plus: '新增',
  RefreshCw: '刷新/重试',
  RotateCcw: '重置/向左旋转',
  Search: '搜索',
  SearchX: '无搜索结果',
  Settings: '设置',
  Shrink: '紧凑布局',
  Square: '未选择项',
  SquareCheckBig: '复选框选中',
  SquareCode: '代码',
  SquareMinus: '部分选择',
  Sun: '亮色主题',
  SunMoon: '跟随系统主题',
  SwatchBook: '主题配色',
  UserRoundPen: '编辑个人资料',
  X: '关闭',
};

export function buildIconCatalog() {
  const sources = iconSources();
  const sections = [];
  let count = 0;
  for (const [file, registry, meanings, heading] of [
    [
      'semantic-icons.ts',
      'platformSemanticIcons',
      businessMeanings,
      '业务实体与分类',
    ],
    ['asset-types.ts', 'assetTypeIcons', typeMeanings, '八类文件类型'],
    ['ui-icons.ts', 'platformUiIcons', {}, '通用操作、状态与专业工具'],
  ]) {
    const entries = [
      ...read(platform + file).matchAll(
        /(?:\/\*\* ([^\n]+) \*\/\s*)?\b(\w+): '(lucide:[^']+|rail:[^']+)'/g,
      ),
    ];
    count += entries.length;
    sections.push(
      `## ${heading}\n\n| 含义 | 统一图标 | 代码入口 | 使用位置 |\n| --- | --- | --- | --- |`,
    );
    for (const [, comment, key, icon] of entries) {
      const locations = sources
        .filter(
          (source) =>
            source.path !== platform + file &&
            source.text.includes(`${registry}.${key}`),
        )
        .map(
          (source) => `\`${source.path.replace('apps/web-antd/src/', '')}\``,
        );
      sections.push(
        `| ${meanings[key] ?? comment ?? key} | \`${icon}\` | \`${registry}.${key}\` | ${locations.join('<br>') || '集中类型索引/动态映射'} |`,
      );
    }
    sections.push('');
  }
  const capabilities = [
    ...read(`${platform}capability-icons.ts`).matchAll(
      /(?:'([^']+)'|(\w+)): ((?:platformSemanticIcons|platformUiIcons|assetTypeIcons)\.\w+),/g,
    ),
  ];
  sections.push(
    '## 动态应用功能映射\n\n应用 API 返回后按稳定功能代码归一化图标；兼容已有数据库的旧图标，不修改数据库、发布版本或绑定。\n\n| 功能代码 | 统一映射 |\n| --- | --- |',
  );
  capabilities.forEach(([, quoted, bare, icon]) =>
    sections.push(`| \`${quoted ?? bare}\` | \`${icon}\` |`),
  );
  const shared = new Map();
  for (const source of sources) {
    for (const [, imported] of source.text.matchAll(
      /import\s*\{([^}]+)\}\s*from\s*['"](?:@vben(?:-core)?\/icons|@lucide\/vue)['"]/g,
    )) {
      for (const token of imported.split(',').map((value) => value.trim())) {
        const name = token.split(/\s+as\s+/)[0];
        if (
          !/^[A-Z]\w+$/.test(name) ||
          name === 'IconifyIcon' ||
          name === 'IconPicker'
        )
          continue;
        const locations = shared.get(name) ?? [];
        locations.push(source.path);
        shared.set(name, locations);
      }
    }
  }
  sections.push(
    '\n## 公共外壳与基础组件\n\n以下为实际源文件引入的组件（包括受偏好设置控制的可选 UI），不代表每个页面同时显示。业务页面不能拿主题调色板代替 CMF，或拿通知信封代替报告。\n\n| 组件图标 | 含义 | 使用位置 |\n| --- | --- | --- |',
  );
  for (const [name, locations] of [...shared].toSorted(([a], [b]) =>
    a.localeCompare(b, 'en'),
  )) {
    if (!sharedMeanings[name]) throw new Error(`缺少公共图标含义: ${name}`);
    sections.push(
      `| \`${name}\` | ${sharedMeanings[name]} | ${locations.map((path) => `\`${path}\``).join('<br>')} |`,
    );
  }
  sections.push(
    '\n公共外壳额外使用的字符串图标：`lucide:panel-left-close`（收起侧栏）、`lucide:panel-left-open`（展开侧栏）、`lucide:globe-2`（时区），以及首页面包屑的 `lucide:layout-dashboard`（与业务首页同图）。这些是共享包内部定义，不能反向依赖 Web 应用模块。',
  );
  return `# 平台图标语义清单\n\n本清单覆盖 rail 主平台 Web 全部业务页、路由、动态应用，以及使用的 Vben 公共外壳与基础 UI 组件。不包含未加载的上游示例、第三方 ComfyUI/AI Toolkit/Presenton 原生界面，或图标库仅导出但未被引入的图形。\n\n业务/类型/操作集中映射共 ${count} 项，动态能力映射 ${capabilities.length} 项，公共组件图标 ${shared.size} 种；集中映射条目数不是去重后的图形数。\n\n## 使用规则\n\n- 同一含义只使用一个集中映射：资产业务一律 \`platformSemanticIcons.assets\`（\`lucide:library-big\`），不再使用文件夹或任意文件图标表示资产中心。\n- 资产“属于什么业务”与“是什么文件”分开：报告分类用报告图标，PDF/Word 文件用 document 图标；图片文件仍用 image。资产卡片展示真实文件类型不是资产入口，不应强制全换成资料库。\n- 同一功能的入口、结果工具与分类保持一致；刷新用 refresh-cw，重置/旋转用 rotate-ccw，历史用 history；全屏用 maximize-2，扩图用 expand。\n- 统一图形不要求所有位置同样尺寸/颜色。颜色继续表达品牌、选中、成功/失败/禁用，动作含义同时保留文本/提示与无障碍标签。\n- 运行时不得散写 \`lucide:*\`；业务实体、文件类型、通用操作分别引用三份映射。新功能同步维护 \`capability-icons.ts\`；未知应用只允许本地登记图标，无法识别时回退为应用图标，避免远程取图或空白。\n- \`rail:mask\` 为集中注册的 ComfyUI 遮罩符号；AI 助手头像 \`assistant-logo.svg\` 与平台 Logo \`rail-logo.svg\` 是品牌图形。首页轨道线稿、Loss 曲线、摄影机角度画布为内容可视化，不是操作 icon。\n\n本文件由 \`node scripts/platform-icon-catalog.mjs\` 输出生成；代码变动后更新清单，并执行 \`node scripts/platform-icon-catalog.mjs --check\` 检查。\n\n${sections.join('\n')}\n`;
}

if (
  process.argv[1] &&
  relative(root, process.argv[1]) === 'scripts/platform-icon-catalog.mjs'
) {
  const markdown = buildIconCatalog();
  if (process.argv.includes('--check')) {
    const normalize = (value) =>
      value
        .replaceAll(/-{3,}/g, '---')
        .replaceAll(/\s+/g, ' ')
        .replaceAll(/ *\| */g, '|')
        .trim();
    if (
      normalize(read('docs/rail-platform/ICON_CATALOG.md')) !==
      normalize(markdown)
    ) {
      throw new Error('图标清单已过期，请更新 ICON_CATALOG.md');
    }
    console.log('图标清单与代码一致');
  } else {
    process.stdout.write(markdown);
  }
}
