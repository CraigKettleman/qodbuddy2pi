/**
 * tui.js — 零依赖的全屏 TUI 工具箱。
 *
 * workbuddy2pi / qoder2pi / 安装向导共用同一套实现，避免三份各写一遍。
 * 只用 Node 内建模块与 ANSI 序列：这些脚本「拷进 ~/.local/bin 就能跑」的性质要保住，
 * 所以不引入任何 npm 依赖。
 *
 * 只读 TTY：调用方必须自己确认 process.stdout.isTTY 与 process.stdin.isTTY，
 * 否则管道/重定向时会把控制字符灌进文件。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────
 *
 *   const { createTui } = require('./tui');
 *   await createTui({
 *     title: 'WorkBuddy 国际版',
 *     subtitle: '本机 127.0.0.1:8788 → pi 的 workbuddy-global provider',
 *
 *     // 每次刷新时调用，返回要展示的内容
 *     async refresh() {
 *       return {
 *         status: [['服务', '● launchd · running'], ['端点', '✓ 17 个模型']],
 *         sections: [{
 *           id: 'accounts',
 *           title: '账号',
 *           rows: [{ marker: '●', label: 'a  Craig', note: '剩 364 天', active: true }],
 *         }],
 *         menu: [{
 *           id: 'switch', group: '账号', label: '切换账号',
 *           note: '在当前账号之间切换', pick: 'accounts',
 *         }],
 *       };
 *     },
 *
 *     // 用户按 Enter 后调用；pickedKey 是 pick 选中的行 key（没有 pick 时为 undefined）
 *     async onAction(id, pickedKey) {
 *       return '已切换';                       // 字符串 = 绿色提示
 *       // 或 { flash: '失败原因', error: true }
 *       // 或 { title: '日志', body: '……' }   // 进可滚动文本页
 *       // 或 { suspend: async () => {...} }  // 暂时退出界面，把终端交出去跑交互式命令
 *       // 或 { quit: true }
 *     },
 *   });
 *
 * ── 交互 ────────────────────────────────────────────────────────────────
 *   ↑↓/jk 移动   Enter 执行   r 刷新   q/Esc 退出
 *   选择页：↑↓ 移动，Enter 确认，Esc 返回
 *   文本页：↑↓/PgUp/PgDn 滚动，Esc/q/Enter 返回
 */

'use strict';

// 界面本身只用 process.stdout/stdin，但 findCmd 要在 PATH 里找文件，需要这两个
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- 主题
//
// 配色直接取自 pi 自己的主题（pi 安装目录里的 dark.json / light.json），
// 并且用 pi-tui 的转换器把 OKHSL 预先算成十六进制常量写在这里。
// 不在运行期做色彩空间转换：那些数学要几十行，而这里的颜色只有十几个、且固定。
//
// 为什么值得对齐：pi 的界面用多个色相区分语义（accent 紫、warning 黄、
// success 绿、border 青），全部内容一个亮度会显得像 DOS 面板。
//
// 真彩色需要终端支持，因此按能力降级：真彩色 → 256 色 → 16 色。

/** pi 暗色主题的取色。 */
const PALETTE_DARK = {
  accent: '#a798d7',
  border: '#5fa8cc',
  borderAccent: '#a08ed5',
  borderMuted: '#768186',
  success: '#68b78d',
  error: '#ea7f81',
  warning: '#cd9a22',
  muted: '#9da5a9',
  dim: '#7e888e',
  text: '#dee0e1',
  selectedBg: '#213b49',
};

/** pi 亮色主题的取色。 */
const PALETTE_LIGHT = {
  accent: '#7459b4',
  border: '#3d8eb3',
  borderAccent: '#8a72cb',
  borderMuted: '#9aa2a7',
  success: '#337e58',
  error: '#c8253d',
  warning: '#8f6802',
  muted: '#677176',
  dim: '#879095',
  text: '#3b3f41',
  selectedBg: '#dfe7ec',
};

/**
 * 终端色彩能力。
 *
 * COLORTERM=truecolor 是最可靠的信号；Apple Terminal 不设它（它其实支持
 * 256 色但只有 16 色的历史包袱），所以再按 TERM 判断一次。
 */
function detectColorMode() {
  if (process.env.NO_COLOR) return 'none';
  const ct = (process.env.COLORTERM || '').toLowerCase();
  if (ct === 'truecolor' || ct === '24bit') return 'truecolor';
  const term = (process.env.TERM || '').toLowerCase();
  if (term.includes('direct')) return 'truecolor';
  if (term === '' || term === 'dumb') return 'none';
  // 256color / xterm-256color / screen / tmux / 其它带颜色的 TERM
  if (term.includes('256')) return '256';
  return '16';
}

/** 把 #rrggbb 转成 256 色序号（6x6x6 立方体 + 灰阶），返回 ANSI 序号。 */
function hexTo256(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // 灰阶候选（232-255）与彩色候选（16-231）都算一遍，取距离近的
  const grayAvg = Math.round((r + g + b) / 3);
  const grayIndex = grayAvg > 238 ? 23 : Math.max(0, Math.min(23, Math.round((grayAvg - 8) / 10)));
  const grayVal = 8 + grayIndex * 10;
  const grayDist = (r - grayVal) ** 2 + (g - grayVal) ** 2 + (b - grayVal) ** 2;
  const q = (v) => Math.round((v / 255) * 5);
  const cubeIndex = 16 + 36 * q(r) + 6 * q(g) + q(b);
  const cubeVal = (v) => [0, 95, 135, 175, 215, 255][q(v)];
  const cubeDist = (r - cubeVal(r)) ** 2 + (g - cubeVal(g)) ** 2 + (b - cubeVal(b)) ** 2;
  return grayDist < cubeDist ? 232 + grayIndex : cubeIndex;
}

/** 真彩色前景色序列。 */
const fgHex = (hex) => `\x1b[38;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`;
/** 真彩色背景色序列。 */
const bgHex = (hex) => `\x1b[48;2;${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}m`;
const fg256 = (hex) => `\x1b[38;5;${hexTo256(hex)}m`;
const bg256 = (hex) => `\x1b[48;5;${hexTo256(hex)}m`;

/** 16 色下的近似：把每个语义色退到最接近的 ANSI 基色。 */
const FALLBACK_16 = {
  accent: '35', border: '36', borderAccent: '35', borderMuted: '90',
  success: '32', error: '31', warning: '33', muted: '37', dim: '90',
  text: '37', selectedBg: '44',
};

/**
 * 按终端能力生成一套颜色序列。
 * @param {'dark'|'light'} appearance  终端是深色底还是浅色底
 */
function buildTheme(appearance) {
  const mode = detectColorMode();
  const palette = appearance === 'light' ? PALETTE_LIGHT : PALETTE_DARK;
  const fg = (name) => {
    if (mode === 'truecolor') return fgHex(palette[name]);
    if (mode === '256') return fg256(palette[name]);
    if (mode === '16') return `\x1b[${FALLBACK_16[name] || '37'}m`;
    return ''; // none：不上色
  };
  const bg = (name) => {
    if (mode === 'truecolor') return bgHex(palette[name]);
    if (mode === '256') return bg256(palette[name]);
    if (mode === '16') return '\x1b[44m';
    return '';
  };
  return { fg, bg, mode, palette };
}

/**
 * 终端是深色底还是浅色底。
 *
 * COLORFGBG 形如 "15;0"（前景;背景），最后一段是背景色号；0-6 与 8 偏暗。
 * 拿不到就默认深色——绝大多数终端主题是深色。
 */
function detectAppearance() {
  const v = process.env.COLORFGBG;
  if (v && v.includes(';')) {
    const bgNum = Number(v.split(';').pop());
    if (Number.isFinite(bgNum)) return bgNum <= 6 || bgNum === 8 ? 'dark' : 'light';
  }
  return 'dark';
}

const THEME = buildTheme(detectAppearance());

/**
 * 语义色序列表。
 *
 * 旧代码用的是 C.green / C.cyan 这类名字，为了不动四个命令里的几百处引用，
 * 这里把它们映射到语义色上：cyan→border（青）、green→success、
 * magenta→accent。这样「换成 pi 的配色」不需要改每个调用点。
 */
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inverse: '\x1b[7m',

  // 语义色（新代码用这些）
  accent: THEME.fg('accent'),
  border: THEME.fg('border'),
  borderAccent: THEME.fg('borderAccent'),
  borderMuted: THEME.fg('borderMuted'),
  success: THEME.fg('success'),
  error: THEME.fg('error'),
  warning: THEME.fg('warning'),
  muted: THEME.fg('muted'),
  faint: THEME.fg('dim'),
  text: THEME.fg('text'),

  // 旧名字（映射到语义色，避免改所有调用点）
  green: THEME.fg('success'),
  yellow: THEME.fg('warning'),
  red: THEME.fg('error'),
  cyan: THEME.fg('border'),
  magenta: THEME.fg('accent'),
  blue: THEME.fg('border'),
  white: THEME.fg('text'),

  // 面板外框与标题
  frame: THEME.fg('borderMuted'),
  frameAccent: THEME.fg('border'),
  title: `\x1b[1m${THEME.fg('accent')}`,
};

/** 选中行的底色。 */
const SELECT_BG = THEME.bg('selectedBg');

/**
 * 面板与状态用的字形。
 *
 * 尽量沿用 pi-tui 自己的选择，让两边的观感一致：
 *   - 选中指针用 → （pi 的 select-list 就是 `→ ` / `  `）
 *   - 载入用盲文点阵帧（pi 的 loader 就是那一组）
 * 其余符号选的是等宽字体下宽度稳定的字符。
 */
const G = {
  running: '●',
  idle: '○',
  ok: '✓',
  bad: '✗',
  current: '●',
  other: '○',
  pointer: '→',
  dot: '·',
};

/** 载入动画的帧，取自 pi-tui 的 loader（盲文点阵）。 */
/**
 * 大字字模：每个字母 5 行高、5 列宽，用实心块 █ 拼。
 *
 * 终端里没法真的放大字号，所以「大」只能靠字符拼——pi 的欢迎屏也是这么做的
 * （它用半方块拼出 pi 的标志）。这里只做 QODBUDDY2PI 需要的字符，不引整套
 * 字库：多出来的字形没人看，还占体积。
 *
 * 字母之间留一列空格，读起来才不糊成一片。
 */
const BIG_FONT = {
  Q: [' ███ ', '█   █', '█   █', '█  ██', ' ████'],
  O: [' ███ ', '█   █', '█   █', '█   █', ' ███ '],
  D: ['████ ', '█   █', '█   █', '█   █', '████ '],
  B: ['████ ', '█   █', '████ ', '█   █', '████ '],
  U: ['█   █', '█   █', '█   █', '█   █', ' ███ '],
  Y: ['█   █', ' █ █ ', '  █  ', '  █  ', '  █  '],
  2: [' ███ ', '█   █', '   █ ', '  █  ', '█████'],
  P: ['████ ', '█   █', '████ ', '█    ', '█    '],
  I: ['███', ' █ ', ' █ ', ' █ ', '███'],
};

/** 把一串字符拼成 5 行大字，返回行数组；字模里没有的字符原样占位。 */
function bigText(text, gap = ' ') {
  const glyphs = [...text].map((ch) => BIG_FONT[ch] || null);
  const height = glyphs.reduce((h, g) => Math.max(h, g ? g.length : 1), 1);
  const lines = [];
  for (let r = 0; r < height; r += 1) {
    lines.push(glyphs.map((g) => (g ? (g[r] ?? ' '.repeat(g[0].length)) : text)).join(gap));
  }
  return lines;
}

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const ALT_ON = '\x1b[?1049h';
const ALT_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';

// 鼠标追踪。
//
// 为什么必须开：备用屏只换了一块画布，终端的滚动缓冲还在。不开鼠标追踪时
// 滚轮事件由终端自己处理，它就把整个界面滚出去（pi 的 fullscreen 模式也是
// 自己接管滚轮，见 TuiAltScreen）。开了之后事件以 SGR 序列发给我们，我们
// 吃掉它，屏幕就不会动。
//
//   1000 基本按钮事件  1006 SGR 坐标格式（能表达超过 223 的列）
//   1002 按住拖动      1004 焦点变化（配合下面关掉，仅列出来说明为什么不用）
const MOUSE_ON = '\x1b[?1000h\x1b[?1006h';
const MOUSE_OFF = '\x1b[?1006l\x1b[?1000l';

const ANSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;

/** 测量与补位必须先剔掉 ANSI，否则转义序列会被当成可见字符把对齐算坏。 */
function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}

/** CJK 与全角字符在等宽字体下占两列，对齐必须按显示宽度算。 */
function charWidth(ch) {
  return /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(ch)
    ? 2
    : 1;
}

function width(text) {
  let w = 0;
  for (const ch of stripAnsi(text)) w += charWidth(ch);
  return w;
}

/** 按显示宽度截断：转义序列原样保留，末尾补一个 reset 以免颜色溢出。 */
function truncate(text, max, ellipsis = '…') {
  if (width(text) <= max) return text;
  const room = Math.max(0, max - width(ellipsis));
  let out = '';
  let acc = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\x1b') {
      const m = /^\x1b\[[0-9;?]*[a-zA-Z]/.exec(text.slice(i));
      if (m) {
        out += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    const cw = charWidth(text[i]);
    if (acc + cw > room) break;
    out += text[i];
    acc += cw;
  }
  return `${out}${ellipsis}${C.reset}`;
}

/**
 * 按显示宽度折行（ANSI 感知）。说明文字不再截成 …，而是换行显示。
 *
 * 折行时把最近一次见过的 SGR 序列带到新行开头——状态值里常有
 * 「绿色 ✓ + 正文」这种前缀着色，不带过去的话第二行开始颜色就丢了。
 * 行首的空格丢掉，避免缩进堆叠。
 */
function wrapText(text, max) {
  if (max < 4) return [text];
  const src = String(text);
  const SGR = /^\x1b\[[0-9;?]*[a-zA-Z]/;

  // 切成「原子」：连续的可见字符为一原子，sep 记录它后面是否跟着空格。
  // 空格作为原子的尾巴单独保存，折行时丢掉、不断行时保留——如果先按空格
  // split 再拼，词首的空格会丢，出现「国内版 ·反代控制台」这种粘连。
  const atoms = [];
  let cur = '';
  let sawSpace = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '\x1b') {
      const m = SGR.exec(src.slice(i));
      if (m) { cur += m[0]; i += m[0].length - 1; continue; }
    }
    if (ch === ' ') {
      if (cur) sawSpace = true;
      continue;
    }
    if (sawSpace && cur) { atoms.push({ text: cur, sep: ' ' }); cur = ''; sawSpace = false; }
    cur += ch;
  }
  if (cur) atoms.push({ text: cur, sep: sawSpace ? ' ' : '' });

  const lines = [];
  let line = '';
  let lineW = 0;
  let pendingSep = '';
  for (const atom of atoms) {
    const aw = width(atom.text);
    const need = aw + (lineW > 0 && pendingSep ? 1 : 0);
    if (lineW > 0 && lineW + need > max) {
      lines.push(line);
      line = '';
      lineW = 0;
      pendingSep = '';
    } else if (lineW > 0 && pendingSep) {
      line += pendingSep;
      lineW += 1;
    }
    if (aw > max) {
      // 单个原子就超宽（长 URL、长中文串）：只能硬切
      let chunk = '';
      let chunkW = 0;
      for (const ch of atom.text) {
        if (ch === '\x1b') { chunk += ch; continue; }
        const cw = charWidth(ch);
        if (chunkW + cw > max && chunkW > 0) {
          lines.push(chunk);
          chunk = '';
          chunkW = 0;
        }
        chunk += ch;
        chunkW += cw;
      }
      line = chunk;
      lineW = chunkW;
    } else {
      line += atom.text;
      lineW += aw;
    }
    pendingSep = atom.sep;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** 按显示宽度右侧补空格（ANSI 感知）。 */
function pad(text, target) {
  const w = width(text);
  if (w >= target) return truncate(text, target);
  return text + ' '.repeat(target - w);
}

/**
 * 在 PATH 里找一个命令，返回完整路径或 null。
 *
 * 不用 `sh -c 'command -v'`：Windows 原生没有 sh，那样写会让
 * “找得到也报找不到”，把已装好的东西误判成未安装。
 * Windows 上按 PATHEXT 补扩展名（node.exe / uv.exe）。
 */
/**
 * 把「命令 + 参数」翻译成 spawnSync 能真正执行的形式。
 *
 * Windows 上官方 pi 安装器落的是 pi.cmd（npm 的 shim），而 Node 从
 * 18.20/20.12 起不再允许直接 spawn .cmd/.bat（会报 EINVAL），必须过
 * cmd.exe /c。不是 .cmd 的（node.exe、uv.exe、schtasks.exe）原样返回。
 *
 * 顺带把命令解析成绝对路径：PATH 上有同名 .cmd 与 .exe 时，交给 shell
 * 去猜容易命中错的那个。
 */
function resolveSpawn(cmd, args) {
  const full = findCmd(cmd) || cmd;
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(full)) {
    return { cmd: process.env.COMSPEC || 'cmd.exe', args: ['/d', '/s', '/c', full, ...args] };
  }
  return { cmd: full, args };
}

function findCmd(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean)
    : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, name + ext);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
        /* 目录不存在或没权限，继续找下一个 */
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- 共享工具
//
// 以下函数原本在 qoder2pi / workbuddy2pi / qodbuddy2pi / wizard.js 里各有一份
// 逐字相同的副本，收拢到这里。它们与界面无关，但都由「装在 ~/.local/bin、没有
// node_modules」的运维命令共用，所以和渲染器放在同一个文件里——多一个文件就多
// 一份安装脚本要部署的东西。

const os = require('os');

/** pi 的资源目录，凭证与扩展都在它下面。 */
const PI_DIR = path.join(os.homedir(), '.pi', 'agent');

/** pi 的登录凭证文件；Qoder 的 provider 凭证就落在这里。 */
const AUTH_JSON = path.join(PI_DIR, 'auth.json');

/** 反代的部署目录：wheel 与运行期数据都放这里。 */
const DATA_DIR = path.join(os.homedir(), '.workbuddy2api');

/**
 * 读一个 JSON 文件，任何失败都返回 null。
 *
 * 刻意不抛异常：调用方几乎都是「这个文件还没有 → 显示未接入」，把
 * 不存在、没权限、内容损坏区分开对用户没有意义，只会多出一堆分支。
 */
function readJson(file) {
  try {
    // 去掉开头的 BOM：Windows PowerShell 5.1 的 `-Encoding UTF8` 会写 BOM，
    // 而 JSON.parse 遇到 BOM 直接抛（安装器写的 version.json / config.json
    // 就是这种情况），表现成「版本号不显示」「配置读不到」。
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * 解析 pi --list-models 的输出，按 provider 分组。
 *
 * 输出每行形如 `<provider> <model> ...`，所以按行首匹配即可，不需要
 * 理解后半部分的格式。models 里没有的 provider 得到空数组，而不是缺字段：
 * 「这个 provider 一个模型都没有」和「没查到这个 provider」在界面上是同一种
 * 显示，调用方不必分别处理。
 *
 * @param {string} stdout  pi --list-models 的原始输出
 * @param {string[]} providers  要分组的 provider id
 * @returns {Object<string, string[]>} provider → 该 provider 的模型行
 */
function parseModels(stdout, providers) {
  const out = {};
  for (const p of providers) out[p] = [];
  for (const line of String(stdout || '').split('\n')) {
    // 取行首的第一个字段作为 provider 名
    const name = line.split(' ')[0];
    if (Object.prototype.hasOwnProperty.call(out, name)) out[name].push(line);
  }
  return out;
}

/*
 * 面板与边框字形。
 *
 * 复刻 pi-tui 的规范：只有 banner 用圆角方框，其余一律用横线分隔。
 * pi 自己也这样——它的 ┌┐└┘│ 只出现在搜索浮层里，普通区块靠 ─ 划开。
 *
 * 于是区块的写法是：首行「─ 标题 ──────」，内容行直接缩进，不画左右边框。
 * 少两个竖线字符，宽终端下看着干净，也省掉一整列宽度。
 */
const BOX = {
  // banner（唯一的圆角方框）
  bannerTL: '╭',
  bannerTR: '╮',
  bannerBL: '╰',
  bannerBR: '╯',
  h: '─',
};

/** 版本号：安装器写下的 version.json，其次仓库里的 package.json。 */
function readVersion() {
  // 运维命令装在 ~/.local/bin，那里没有 package.json，所以安装器会把版本
  // 写成同目录的 version.json。直接从仓库跑时（./dev.sh）回退到 package.json。
  const fromJson = readJson(path.join(__dirname, 'version.json'));
  if (fromJson && fromJson.version) return fromJson.version;
  const fromPkg = readJson(path.join(__dirname, '..', 'package.json'));
  if (fromPkg && fromPkg.version) return fromPkg.version;
  return null;
}

function termWidth() {
  // 跟随终端实际宽度铺满（pi 也是全宽）；下限 60 保留——再窄下去
  // 边框和内容会互相挤坏。
  return Math.max(60, process.stdout.columns || 80);
}

/**
 * 把行数补到整个终端高度，让界面铺满。
 *
 * 只补到 rows - 1：渲染时末尾要写一个 \r\n 把光标留在最后一行的下一行。
 * 如果这里填满 rows 行，那个 \r\n 就会把屏幕顶上去一行，整个界面开始滚动。
 *
 * 内容比屏幕高时原样返回，不做截断：菜单比屏幕高的情况需要滚动，
 * 在这里剪掉会让后面的项永远看不到。
 */
/**
 * 造一个外层大框的边框部件。
 *
 * pi 的做法是标题嵌在框线上：╭─ Pi v1.2.0 ─。这里沿用，标题放左上角。
 *
 * 返回 { top, bottom, row, blank, divider, inner }：whole 界面共用同一个框，
 * 而不是每个区块各画一个小框——那样看着像一堆互不相干的卡片。
 */
function makeFrame(w) {
  const inner = w - 4; // 去掉左右各一个边框与一个空格
  const top = (title) => {
    const head = `─ ${title} `;
    const room = w - 2 - width(head);
    return `${C.frame}${BOX.bannerTL}${C.borderAccent}${head}${C.frame}${BOX.h.repeat(Math.max(0, room))}${BOX.bannerTR}${C.reset}`;
  };
  const bottom = `${C.frame}${BOX.bannerBL}${BOX.h.repeat(w - 2)}${BOX.bannerBR}${C.reset}`;
  // 内容行：左边框 + 空格 + 内容（补到 inner）+ 空格 + 右边框
  const row = (text) => {
    const body = pad(text, inner);
    return `${C.frame}│${C.reset} ${body} ${C.frame}│${C.reset}`;
  };
  // 区块之间用与边框同色的细分隔线（左侧留一个 ├ 形状的起点，和 pi 一致）
  const divider = (label = '') => {
    if (!label) return `${C.frame}├${BOX.h.repeat(w - 2)}┤${C.reset}`;
    const head = `─ ${label} `;
    const room = w - 2 - width(head);
    return `${C.frame}├${C.muted}${head}${C.frame}${BOX.h.repeat(Math.max(0, room))}┤${C.reset}`;
  };
  const blank = row('');

  /**
   * 把整个界面撑到指定行数：在末尾的 tailLines 行之前补空白行。
   *
   * 不能像以前那样在框外补空行——那样框只包住内容，下面空空一块，
   * 看着像画到一半。pi 的界面是框一直延伸到终端底部，状态栏贴着底边。
   */
  const stretch = (lines, targetRows, tailLines = 1) => {
    if (lines.length >= targetRows) return lines.slice(0, targetRows);
    const head = lines.slice(0, lines.length - tailLines);
    const tail = lines.slice(lines.length - tailLines);
    const out = head.slice();
    while (out.length < targetRows - tailLines) out.push(blank);
    return [...out, ...tail];
  };

  return { top, bottom, row, blank, divider, inner, stretch };
}

/**
 * 把左右两块内容合成一行（左块占 leftW 列，中间一个分隔竖线）。
 * pi 的首页就是这种结构：左边大字块，右边 Welcome / Commands 侧栏。
 *
 * 右侧为空也照画分隔竖线：竖线是分栏的视觉边界，缺了一行就会断掉。
 * 只有 caller 明确不要分栏（rightW 为 0）时才退回单栏。
 *
 * 分隔占 3（间距）+ 1（竖线）+ 1（空格）= 5 列，调用方算 leftW 时要把这 5 列扣掉。
 */
function twoColumn(left, right, leftW, rightW, gap = 3) {
  const leftBody = pad(left, leftW);
  if (!rightW) return leftBody;
  return `${leftBody}${' '.repeat(gap)}${C.frame}│${C.reset} ${pad(right || '', rightW)}`;
}

/** 左右分栏时，分隔部分占的总宽度。 */
const COLUMN_GAP = 3 + 1 + 1;

/**
 * 框应该占多少行。
 *
 * 留一行给末尾的 \r\n：渲染时最后要写一个换行把光标留在下一行。
 * 占满全屏的话那个换行会把屏幕顶上去一行，整个界面开始滚动。
 */
function frameRows() {
  return Math.max(6, (process.stdout.rows || 24) - 1);
}

/**
 * 把行数补到终端高度（不画框时用）。
 *
 * 画框的界面用 makeFrame().stretch——空白要补在框内，而不是框外，
 * 否则底边框跑到中间，下面空一大块。
 *
 * 内容比屏幕高时原样返回，不截断：那样的界面需要滚动。
 */
function fillHeight(lines, w) {
  const rows = process.stdout.rows || 24;
  const target = Math.max(0, rows - 1);
  if (lines.length >= target) return lines;
  const out = lines.slice();
  // 空白行必须真的补到整宽，否则行级差分下会漏出上一帧的残迹——
  // 空字符串与「旧内容的行」在比较时并不相等，但还是给满宽度更稳。
  while (out.length < target) out.push(' '.repeat(w));
  return out;
}


/** 把一行内容按显示宽度居中。 */
function center(text, target) {
  const w = width(text);
  if (w >= target) return truncate(text, target);
  const left = Math.floor((target - w) / 2);
  return ' '.repeat(left) + text;
}

/**
 * 画一个区块：首行是「─ 标题 ────」横线，下面跟内容行。
 *
 * rows 可以含 ANSI：这里统一做 ANSI 感知的补位，调用方不需要自己算宽度。
 * 内容行不再画左右竖线（pi-tui 规范：非 banner 不发方框）。
 *
 * inner 是整个区块的目标显示宽度，标题横线正好 inner 列，内容行是
 * 「一个空格 + 正文 + 一个空格」，所以正文区是 inner - 2。
 * 早先正文按 inner 补位，结果每行比标题宽 2 列，右边界会漂。
 */
function panel(title, rows, inner) {
  const head = `${BOX.h} ${title} `;
  const dashes = Math.max(0, inner - width(head));
  const out = [`${C.frame}${head}${BOX.h.repeat(dashes)}${C.reset}`];
  const body = Math.max(0, inner - 2);
  for (const row of rows) {
    // 行可以是字符串，也可以是 { text, hl }：hl 为真时整行铺底色
    const text = typeof row === 'string' ? row : row.text;
    const filler = pad(text, body);
    out.push(row && row.hl
      ? `${SELECT_BG} ${filler} ${C.reset}`
      : ` ${filler} `);
  }
  return out;
}

const MENU_KEYS = {
  up: ['\x1b[A', 'k'],
  down: ['\x1b[B', 'j'],
  enter: ['\r', '\n'],
  esc: ['\x1b'],
  pageUp: ['\x1b[5~'],
  pageDown: ['\x1b[6~'],
};

function createTui(options) {
  const state = {
    screen: 'menu',
    menu: 0,
    pick: 0,
    pickTargets: [],
    pickTitle: '',
    pickAction: null,
    text: [],
    textOffset: 0,
    textTitle: '',
    status: [],
    sections: [],
    menuItems: [],
    flash: '',
    error: false,
    busy: '',
    loading: false,
    active: false,
    // 多页：pages 为空时就是单页界面（workbuddy2pi / qoder2pi 照旧），
    // 给了 pages 才在标题上方画页签，用 1..9 或 Tab 切换
    pages: [],
    page: 0,
    title: '',
    subtitle: '',
    // 上一帧的行内容与当时的终端宽度；行级差分靠它们判断哪行需要重写
    frameLines: [],
    frameWidth: 0,
  };

  // ------------------------------------------------------------ 渲染

  /** 页签行内容（不含外层边框）；单页界面不调用它。 */
  function renderTabs(w) {
    const parts = state.pages.map((p, i) => (
      i === state.page
        // 当前页反白（就是选中行的底色），一眼知道在哪一页
        ? `${SELECT_BG}${C.bold}${C.text} ${i + 1} ${p.label} ${C.reset}`
        : `${C.faint} ${i + 1} ${p.label} ${C.reset}`
    ));
    // 页签之间用 · 而不是 │（│ 是方框字形，留给外层大框）
    return truncate(parts.join(`${C.frame}${G.dot}${C.reset}`), w);
  }

  /** 版本号，显示在 banner 左上角与框线上。 */
  /**
   * pi 式 banner：一个圆角框只包住头部，框线上嵌版本号，框内左中右三块，
   * 右栏前面有一道竖线分隔（pi 的欢迎屏就是这样：logo 区与 Welcome/Commands
   * 侧栏之间一道 │）。框外才是页签与内容区——pi 的 [Context] 等区块也不在框里。
   *
   *   ╭─ qodbuddy v2.0.0 ─────────────────────────────────╮
   *   │                              │ Welcome            │
   *   │      Q O D B U D D Y 2 P I   │ 接入 Qoder 与 ...  │
   *   │                              │                    │
   *   │      接入 Qoder 与 WorkBuddy │ Commands           │
   *   │                              │ 1/2/3 切 provider  │
   *   ╰──────────────────────────────────────────────────────╯
   */
  function renderBanner() {
    const w = termWidth();
    const inner = w - 4;
    const v = readVersion();
    const version = v ? `qodbuddy v${v}` : 'qodbuddy';
    const tagline = 'Qoder 与 WorkBuddy 已接入 pi';
    const sub = `${state.title}${state.subtitle ? `　·　${state.subtitle}` : ''}`;
    const right = [
      `${C.accent}${C.bold}Welcome${C.reset}`,
      `${C.text}接入 Qoder 与 WorkBuddy${C.reset}`,
      '',
      `${C.accent}${C.bold}Commands${C.reset}`,
      `${C.muted}1/2/3 切 provider${C.reset}`,
      `${C.muted}r 刷新 · q 退出${C.reset}`,
    ];
    const sideW = Math.max(...right.map((r) => width(r))) + 2;
    const rows = [];

    // 大字：QODBUDDY 一行字模，宽 47 列。放不下就退成单行小标题。
    const bigLines = bigText('QODBUDDY');
    const bigW = width(bigLines[0]);
    const twoLine = bigText('2PI');
    const twoW = width(twoLine[0]);

    // 宽度分三档，别一挤就全退成单行——
    //   宽：大字 QODBUDDY + 2PI，右栏 Welcome/Commands
    //   中：只留大字 QODBUDDY（去掉 2PI，省 7 行），右栏保留
    //   窄：单行标题
    // 阈值按「左侧内容 + 竖线 + 右栏 + 一圈留白」实算，别拍脑袋写个大数：
    // 写大了会让 100 列的终端白白退成单行。
    const needBig = bigW + 4;
    const needSide = sideW + 2;
    // 高度也要够：大字 banner 占约 20 行，矮终端上会把内容区整个挤出屏幕。
    // 留出 16 行给页签与内容，剩下的才给大字。
    const rows_ = process.stdout.rows || 24;
    const tallEnough = rows_ >= 30;
    const showBig = tallEnough && inner >= needBig + needSide;
    const showTwo = showBig && rows_ >= 34 && inner >= needBig + needSide + 8;

    if (!showBig) {
      rows.push(`${C.frame}${BOX.bannerTL}${BOX.h.repeat(w - 2)}${BOX.bannerTR}${C.reset}`);
      rows.push(`${C.frame}│${C.reset} ${pad(`${C.accent}${C.bold}QODBUDDY2PI${C.reset}  ${C.faint}${sub}${C.reset}`, inner)} ${C.frame}│${C.reset}`);
      rows.push(`${C.frame}${BOX.bannerBL}${BOX.h.repeat(w - 2)}${BOX.bannerBR}${C.reset}`);
      return rows;
    }

    // 右栏（Welcome/Commands）与左侧内容之间一道竖线，与 pi 一致
    const leftW = inner - sideW - 1; // 行结构 │·左块·│·右块·│，合计 leftW+sideW+5 = w

    // 左栏：版本号 → 大字 QODBUDDY → 大字 2PI → 标语 → 当前页名。
    // 空行把大字与文字隔开，整块才不挤——banner 因此比之前高了好几行。
    const centered = (text) => {
      const ind = Math.max(0, Math.floor((leftW - width(text)) / 2));
      return ' '.repeat(ind) + text;
    };
    const bigStyled = (l) => centered(`${C.accent}${C.bold}${l}${C.reset}`);
    const leftCells = [
      ` ${C.faint}${version}${C.reset}`,
      '',
      ...bigLines.map(bigStyled),
      ...(showTwo ? ['', ...twoLine.map(bigStyled)] : []),
      '',
      centered(`${C.text}${tagline}${C.reset}`),
      '',
      centered(`${C.muted}${truncate(sub, Math.max(10, leftW - 2))}${C.reset}`),
    ];

    // 行数取左右两栏的较大者，短的那栏补空——竖线才不会断
    const height = Math.max(leftCells.length, right.length);
    for (let i = 0; i < height; i += 1) {
      rows.push(`${C.frame}│${C.reset} ${pad(leftCells[i] || '', leftW)}${C.frame}│${C.reset} ${pad(right[i] || '', sideW)}${C.frame}│${C.reset}`);
    }

    return [
      `${C.frame}${BOX.bannerTL}${BOX.h.repeat(w - 2)}${BOX.bannerTR}${C.reset}`,
      ...rows,
      `${C.frame}${BOX.bannerBL}${BOX.h.repeat(w - 2)}${BOX.bannerBR}${C.reset}`,
    ];
  }

  /**
   * 菜单页：pi 式布局。
   *
   *   ╭─ qodbuddy v2.0.0 ─────────────╮
   *   │        banner（含右栏）       │
   *   ╰───────────────────────────────╯
   *
   *        1 Qoder · 2 WorkBuddy 国内版 · ...
   *   WorkBuddy 国内版 · 反代控制台
   *
   *   [状态]
   *     ...
   *   [账号]
   *     ...
   *                                    │ [操作]
   *                                    │   ...
   *
   *   ←→/Tab 切换   ↑↓ 选择  ...
   *
   * 框只包 banner（pi 的欢迎屏就一个框），下面的页签、内容与状态栏全部
   * 裸排在背景上——包一层框反而显得是表格，不像 pi。
   */
  function renderMenu() {
    const w = termWidth();
    const lines = [];

    // banner：pi 式圆角框只包头部
    lines.push(...renderBanner());

    // 页签行：居中、裸排（无框）。前后各留两行——内容挤在顶部、
    // 下面空一大片会显得头重脚轻，留白拉开后整屏更匀。
    if (state.pages.length > 1) {
      lines.push('');
      lines.push('');
      lines.push(center(renderTabs(w - 4), w));
    }

    // 内容区：左右分栏（窄终端退单栏），裸排
    const stacked = w < 76;
    const rightW = stacked ? 0 : Math.min(50, Math.max(28, Math.floor(w * 0.36)));
    const leftW = stacked ? w - 2 : w - rightW - COLUMN_GAP; // 再扣 2 列做左缩进

    const left = renderOverview(leftW);
    const right = stacked ? [] : renderActions(rightW);

    lines.push('');
    lines.push('');
    if (stacked) {
      for (const line of left) lines.push(`  ${line}`);
      const menu = renderActions(w - 4);
      if (menu.length) {
        lines.push('');
        for (const line of menu) lines.push(`  ${line}`);
      }
    } else {
      const bodyRows = Math.max(left.length, right.length);
      for (let i = 0; i < bodyRows; i += 1) {
        lines.push(`  ${twoColumn(left[i] || '', right[i] || '', leftW - 2, rightW)}`);
      }
    }

    // 底部状态栏：裸排，紧贴底边，上面留两行
    const tail = ['', '', footerLine(w)];
    return stretchBare([...lines, ...tail], frameRows(), tail.length);
  }

  /**
   * 裸排（无框）时的行数补齐：空白补在末尾 tailLines 行之前，
   * 空白行补到整宽（防止差分残迹）。
   */
  function stretchBare(lines, targetRows, tailLines = 1) {
    const w = termWidth();
    // 每行补到整宽：裸排没有边框兜底，行尾不补齐的话差分渲染会留下上一帧残迹
    const padded = lines.map((l) => (width(stripAnsi(l)) < w ? pad(l, w) : l));
    if (padded.length >= targetRows) return padded.slice(0, targetRows);
    // 末尾 tailLines 行（提示/状态栏）钉在底部，空白补在内容与它们之间。
    // 不要再传 frontKeep 把标题钉顶、把中间内容错位——空白永远只出现在
    // 「内容结束」与「底部提示开始」之间，标题和选项都顶格排在最前面。
    const tail = padded.slice(padded.length - tailLines);
    const head = padded.slice(0, padded.length - tailLines);
    const out = head.slice();
    while (out.length < targetRows - tailLines) out.push(pad('', w));
    return [...out, ...tail];
  }

  /** 左栏：状态与各分区。返回不带边框的内容行。 */
  /**
   * 左栏：状态与各分区。
   *
   * 区块标题用 pi 的写法：[状态] 这样方括号包住、用次级颜色，下面直接跟缩进的内容行。
   * 不用「─ 标题 ──」那样的横线——pi 的 [Context] / [Skills] / [Extensions] 就是这么
   * 写的，横线一多就杂乱，也把本来就不宽的内容区又切掉一块。
   */
  function renderOverview(inner) {
    const out = [];

    if (state.status.length) {
      // 区块标题用强调色：pi 的 [Context]/[Skills] 用的是 mdHeading（主题强调色），
      // 列表内容用暗色——标题一亮一暗，扫一眼就能分区。
      out.push(`${C.accent}[状态]${C.reset}`);
      // 标签按显示宽度对齐，中英混排时不会歪
      const labelW = Math.max(...state.status.map(([k]) => width(k)));
      for (const [k, v] of state.status) {
        // 值换行而不是截成 …：凭证路径、有效期这类信息截断就看不到了
        const segs = wrapText(v, inner - 4 - labelW);
        out.push(`  ${C.muted}${pad(k, labelW)}${C.reset}  ${segs[0]}${C.reset}`);
        for (let i = 1; i < segs.length; i += 1) {
          out.push(`  ${' '.repeat(labelW)}  ${segs[i]}${C.reset}`);
        }
      }
      out.push('');
      out.push('');
    }

    for (const section of state.sections) {
      if (!section.rows.length) continue;
      out.push(`${C.accent}[${section.title}]${C.reset}`);
      for (const row of section.rows) {
        const mark = row.active === true ? `${C.success}${G.current}${C.reset}`
          : row.active === false ? `${C.faint}${G.other}${C.reset}`
            : row.marker || ' ';
        const labelW = section.labelWidth || 26;
        // 标签用正文色、备注用次级色；备注折行，续行对齐到备注起点
        const noteW = Math.max(8, inner - 6 - labelW);
        const segs = row.note ? wrapText(row.note, noteW) : [''];
        out.push(`  ${mark} ${C.text}${pad(row.label, labelW)}${C.reset} ${C.faint}${segs[0]}${C.reset}`);
        for (let i = 1; i < segs.length; i += 1) {
          out.push(`    ${' '.repeat(labelW)} ${C.faint}${segs[i]}${C.reset}`);
        }
      }
      if (section.hint) {
        for (const seg of wrapText(section.hint, inner - 4)) {
          out.push(`    ${C.faint}${seg}${C.reset}`);
        }
      }
      out.push('');
      out.push('');
    }

    // 去掉末尾多出来的空行
    while (out.length && stripAnsi(out[out.length - 1]).trim() === '') out.pop();
    return out;
  }

  /** 右栏：操作菜单。返回不带边框的内容行。 */
  function renderActions(inner) {
    const out = [];
    if (!state.menuItems.length) return out;

    out.push(`${C.accent}[操作]${C.reset}`);
    for (const item of state.menuItems) {
      // 分组用 pi 的方括号写法，缩进一层；组名用警示色，与顶层的强调色拉开层次
      if (item.group && item.group !== out.lastGroup) {
        out.push('');
        out.push('');
        out.push(`  ${C.warning}[${item.group}]${C.reset}`);
        out.lastGroup = item.group;
      }
      const selected = state.menuItems[state.menu] === item;
      const pointer = selected ? `${C.accent}${C.bold}${G.pointer}${C.reset}` : ' ';
      // 标签宽按本组内容自适应：中文标签只占 8 列，写死 16 会把备注挤成碎片
      const labelW = Math.max(10, Math.min(16,
        Math.max(...state.menuItems.map((it) => width(it.label))) + 2));
      const label = pad(item.label, labelW);
      // 备注折行：截成 … 的话「从桌面端登录文件导入」这类操作说明就看不全了
      const noteW = Math.max(8, inner - labelW - 6);
      const segs = item.note ? wrapText(item.note, noteW) : [''];
      const styled = selected
        ? `${C.bold}${C.text}${label}${C.reset}${C.muted}${segs[0]}${C.reset}`
        : `${C.text}${label}${C.faint}${segs[0]}${C.reset}`;
      const text = `${pointer}  ${styled}`;
      out.push(truncate(selected ? `${SELECT_BG}${text}${C.reset}` : text, inner));
      for (let i = 1; i < segs.length; i += 1) {
        out.push(`     ${' '.repeat(labelW)}${C.faint}${segs[i]}${C.reset}`);
      }
    }
    return out;
  }

  /** 底部状态栏：当前页 + 按键提示 + 临时消息（右对齐的那部分留给消息）。 */
  function footerLine(inner) {
    const hints = state.pages.length < 2
      ? (options.footer || '↑↓ 选择　Enter 执行　r 刷新　q 退出')
      : (options.footer || '←→/Tab 切换　↑↓ 选择　Enter 执行　r 刷新　q 退出');

    let msg = '';
    let colour = C.muted;
    if (state.busy) { msg = state.busy; colour = C.warning; }
    else if (state.loading) { msg = `${SPINNER[0]} 正在读取…`; colour = C.faint; }
    else if (state.flash) { msg = state.flash; colour = state.error ? C.warning : C.success; }

    if (!msg) return `${C.faint}${truncate(hints, inner)}${C.reset}`;

    // 消息放右边，与提示同一行；放不下时优先保住消息
    const hintW = Math.max(0, inner - width(msg) - 2);
    const left = hintW > 10 ? `${C.faint}${truncate(hints, hintW)}${C.reset}` : '';
    const gapN = Math.max(1, inner - width(left) - width(msg));
    return `${left}${' '.repeat(gapN)}${colour}${msg}${C.reset}`;
  }

  function renderPicker() {
    const w = termWidth();
    const lines = [];
    const inner = w - 4;

    // 标题裸排：与 pi 的 [区块] 标题同一层级
    lines.push(`${C.accent}${C.bold}QODBUDDY2PI${C.reset}  ${C.text}${truncate(state.pickTitle, w - 16)}${C.reset}`);
    lines.push(`${C.muted}${truncate(state.title, w)}${C.reset}`);
    lines.push('');

    state.pickTargets.forEach((t, i) => {
      const selected = i === state.pick;
      const mark = t.active ? `${C.success}${G.current}${C.reset}` : `${C.faint}${G.other}${C.reset}`;
      const body = `${mark} ${C.text}${pad(t.label, 24)}${C.reset}${C.muted}${t.note || ''}${C.reset}`;
      const pointer = selected ? `${C.accent}${C.bold}${G.pointer}${C.reset}` : ' ';
      const text = `  ${pointer} ${body}`;
      lines.push(truncate(selected ? `${SELECT_BG}${text}${C.reset}` : text, w));
    });

    // 提示与消息压底
    const hint = `${C.faint}↑↓ 选择　Enter 确认　Esc 返回${C.reset}`;
    const tail = ['', state.flash ? `${state.error ? C.warning : C.success}${state.flash}${C.reset}` : hint];
    return stretchBare([...lines, ...tail], frameRows(), tail.length);
  }

  function renderText() {
    const w = termWidth();
    const height = Math.max(4, frameRows() - 5);

    const lines = [];
    lines.push(`${C.accent}${C.bold}QODBUDDY2PI${C.reset}  ${C.text}${truncate(state.textTitle, w - 16)}${C.reset}`);
    lines.push('');

    const maxStart = Math.max(0, state.text.length - height);
    state.textOffset = Math.max(0, Math.min(state.textOffset, maxStart));
    const view = state.text.slice(state.textOffset, state.textOffset + height);

    if (view.length) {
      for (const l of view) lines.push(`  ${l.replace(/\t/g, '  ')}`);
    } else {
      lines.push(`  ${C.faint}（无输出）${C.reset}`);
    }

    const pos = state.text.length > height
      ? `　${state.textOffset + 1}-${state.textOffset + view.length}/${state.text.length} 行`
      : '';
    const tail = ['', `${C.faint}↑↓ 滚动${pos}　Esc/q 返回${C.reset}`];
    return stretchBare([...lines, ...tail], frameRows(), tail.length);
  }

  // macOS/Linux 下 \n 隐含回车，Windows 控制台不隐含：必须显式写 \r\n，
  // 否则光标停在上一行末尾，每一行都会往右台阶状偏移，\x1b[K 也会清错区间。
  //
  // 行级差分：只重写内容变化了的行，不再每帧全屏重写。
  //
  // 两个必须成对处理的细节：
  //   1. 每行仍带 \x1b[K。因为没有整屏清空，一行变短时行尾会留下上一帧的残迹。
  //   2. 宽度变化时退回一次全屏重写。宽度变了所有行的排版都不同，逐行比较没有意义；
  //      而且行数变少时，多出来的旧行只能靠整屏清空来抹掉。
  //
  // 光标用绝对定位（\x1b[<行>H）而不是相对移动：差分要跳着改行，相对移动必须先
  // 算出行差，还要处理上下两个方向，反而更容易错。
  function render() {
    if (!state.active) return;
    const lines = state.screen === 'picker' ? renderPicker()
      : state.screen === 'text' ? renderText()
        : renderMenu();

    const w = process.stdout.columns || 80;
    const sameShape = w === state.frameWidth && lines.length === state.frameLines.length;

    // 整屏重写的两种情况：形状变了，或是第一帧
    if (!sameShape) {
      state.frameWidth = w;
      state.frameLines = lines;
      process.stdout.write(`\x1b[H${lines.map((l) => `${l}\x1b[K`).join('\r\n')}\r\n\x1b[J`);
      return;
    }

    // 逐行比较：只把变化的行写到它自己的位置上
    let out = '';
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i] === state.frameLines[i]) continue;
      // 行号是 1-based，且终端不滚屏时绝对定位不会把内容挤出屏幕
      out += `\x1b[${i + 1}H${lines[i]}\x1b[K`;
    }
    if (out) process.stdout.write(out);
    state.frameLines = lines;
  }

  // ------------------------------------------------------------ 生命周期

  function enter() {
    state.active = true;
    // 备用屏 + 隐藏光标 + 接管鼠标：三者缺一不可，否则滚轮会把界面滚出屏幕
    process.stdout.write(ALT_ON + CURSOR_HIDE + MOUSE_ON);
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    // 每次进入都要重挂键盘监听：leave() 会摘掉它，而 suspend（输入 PAT、
    // 浏览器登录这类要交出终端的操作）正是 leave → 用户操作 → enter 的流程。
    // 只在启动时挂一次的话，suspend 回来界面画得出来、按键全部失灵。
    // 先 off 再 on：EventEmitter 对同一函数不去重，直接 on 会越挂越多，
    // 一次按键触发 N 次。
    process.stdin.off('data', onKey);
    process.stdin.on('data', onKey);
    // 窗口缩放重绘同理：leave() 摘掉（suspend 期间终端归子进程），enter() 补挂。
    // 用 stdout 的 'resize' 事件而不是 process 的 SIGWINCH：前者保证在
    // columns/rows 更新之后触发；后者与 Node 更新列数的处理器有竞态，
    // 可能拿旧宽度画出一模一样的帧，看起来就是「缩放没反应」。
    // Windows 上没有这个信号，那里只能靠 r 手动刷新。
    process.stdout.off('resize', render);
    process.stdout.on('resize', render);
  }

  function leave() {
    if (!state.active) return;
    state.active = false;
    // 下一帧必须整屏重写：备用屏被丢弃后光标位置与屏幕内容都不可知，
    // 留着上一次的 frameLines 会让差分跳过本该重画的行。
    state.frameLines = [];
    state.frameWidth = 0;
    process.stdin.off('data', onKey);
    // 与 enter() 里的 stdout 'resize' 配对；非 TTY 时 off 是空操作
    process.stdout.off('resize', render);
    try {
      if (process.stdin.setRawMode) process.stdin.setRawMode(false);
      process.stdin.pause();
    } catch {
      /* 非 TTY 时 setRawMode 会抛，忽略 */
    }
    process.stdout.write(MOUSE_OFF + CURSOR_SHOW + ALT_OFF);
  }

  // ------------------------------------------------------------ 数据刷新

  async function refresh() {
    // 有 pages 时数据来自当前页，没 pages 时就是 options 本身（单页用法）
    const page = state.pages[state.page];
    const src = page || options;
    const token = (state.refreshToken = (state.refreshToken || 0) + 1);
    // 取数可能花几百毫秒（要跑 pi 之类的子进程）。先画一帧「正在读取」：
    // 渲染只要几微秒，但换来的是一按就有反应；否则屏幕一动不动，
    // 用户会以为按键没生效而反复敲。
    // 用 loading 而不是 busy：读取期间应该还能切页、按 q 退出，
    // 只有真正在执行操作（act）时才阻止输入。
    if (state.active) {
      state.loading = true;
      render();
    }
    try {
      const data = await (page ? page.refresh() : options.refresh());
      // 读取期间用户可能又切了页（那时不会阻塞）；旧结果回来时直接丢弃，
      // 否则它会把新页面的内容覆盖掉。
      if (token !== state.refreshToken) return;
      state.title = page ? (state.pages[state.page].title || page.label) : options.title;
      state.subtitle = page ? (page.subtitle || '') : (options.subtitle || '');
      state.status = data.status || [];
      state.sections = data.sections || [];
      state.menuItems = (data.menu || []).map(Object.freeze);
      if (data.footer) src.footer = data.footer;
      if (state.menu >= state.menuItems.length) state.menu = 0;
    } finally {
      if (token === state.refreshToken) state.loading = false;
    }
  }

  /** 切到第 i 页；页号越界则不动。 */
  async function gotoPage(i) {
    if (i < 0 || i >= state.pages.length || i === state.page) return;
    state.page = i;
    state.screen = 'menu';
    state.menu = 0;
    state.flash = '';
    state.error = false;
    await refresh();
    render();
  }

  // ------------------------------------------------------------ 交互

  async function act(itemId, pickedKey) {
    state.flash = '';
    state.error = false;
    state.busy = '执行中…';
    render();

    let result;
    try {
      const page = state.pages[state.page];
      result = await (page ? page.onAction(itemId, pickedKey) : options.onAction(itemId, pickedKey));
    } catch (error) {
      result = { flash: error && error.message ? error.message : String(error), error: true };
    }
    state.busy = '';

    if (!result) {
      await refresh();
      render();
      return;
    }
    if (typeof result === 'string') {
      await refresh();
      state.flash = result;
      render();
      return;
    }
    if (result.quit) return quit();
    if (result.suspend) {
      leave();
      try {
        await result.suspend();
      } catch (error) {
        process.stdout.write('');
        state.flash = error && error.message ? error.message : String(error);
        state.error = true;
      }
      enter();
      await refresh();
      if (!state.flash) state.flash = result.after || '';
      render();
      return;
    }
    if (result.body !== undefined) {
      state.textTitle = result.title || '输出';
      state.text = String(result.body).split('\n');
      state.textOffset = 0;
      state.screen = 'text';
      state.error = !!result.error;
      render();
      return;
    }
    await refresh();
    if (result.flash) state.flash = result.flash;
    state.error = !!result.error;
    render();
  }

  /**
   * 把一次 stdin 读到的内容拆成交互 token。
   *
   * 终端会把连续按键合并成一个 data 事件（快速连按、粘贴、按住方向键都算），
   * 而 onKey 是按单个按键判断的：方向键要先整段识别，剩下的才逐字符切，
   * 否则 'q' 这种单字符判断永远不成立，整批按键被静默丢掉。
   */
/** SGR 鼠标报告：\x1b[<按钮;列;行(M|m)。M 按下，m 松开。 */
const MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;

/**
 * 把一次 stdin 读到的内容拆成交互 token。
 *
 * 终端会把连续按键合并成一个 data 事件（快速连按、粘贴、按住方向键都算），
 * 而 onKey 是按单个按键判断的：方向键与鼠标报告要先整段识别，剩下的才逐字符切，
 * 否则 'q' 这种单字符判断永远不成立，整批按键被静默丢掉。
 *
 * 鼠标报告必须整体识别、优先于普通转义序列：它形如 \x1b[<0;10;5M，
 * 中间有个 '<'，普通 CSI 正则匹配不到它，会被拆成单个字符造成乱码。
 */
function splitKeys(data) {
    const out = [];
    let i = 0;
    while (i < data.length) {
      if (data[i] === '\x1b' && data[i + 1] === '[') {
        // 鼠标报告优先
        const mouse = MOUSE_RE.exec(data.slice(i));
        if (mouse) {
          out.push({ mouse: Number(mouse[1]), col: Number(mouse[2]), row: Number(mouse[3]), press: mouse[4] === 'M' });
          i += mouse[0].length;
          continue;
        }
        // 普通转义序列：\x1b[ 后跟参数与终止字母
        const m = /^\x1b\[[0-9;?]*[a-zA-Z~]/.exec(data.slice(i));
        if (m) {
          out.push(m[0]);
          i += m[0].length;
          continue;
        }
      }
      // 单个 \x1b 本身就是 Esc
      out.push(data[i]);
      i += 1;
    }
    return out;
  }

  async function onKey(data) {
    // 一次可能收到多个按键，逐个处理，不能只取第一个
    for (const key of splitKeys(String(data))) {
      await handleKey(key);
      if (!state.active) return; // 中途退出了
    }
  }

  async function handleKey(key) {
    if (!state.active || state.busy) return;

    // 鼠标事件：滚轮用来滚动，其余一律吃掉。
    // 吃掉是必要的：不认的事件若漏下去，终端就会自己处理，界面跟着动。
    if (key && typeof key === 'object' && key.mouse !== undefined) {
      // SGR 按钮码的低 2 位是修饰键，64/65 是滚轮上/下（bit 6 置位）
      const isWheel = (key.mouse & 64) === 64;
      if (isWheel && key.press) {
        const up = (key.mouse & 1) === 0;
        if (state.screen === 'text') {
          state.textOffset += up ? -1 : 1;
        } else if (state.screen === 'menu' && state.menuItems.length) {
          const n = state.menuItems.length;
          state.menu = (state.menu + (up ? n - 1 : 1)) % n;
        } else if (state.screen === 'picker' && state.pickTargets.length) {
          const n = state.pickTargets.length;
          state.pick = Math.max(0, Math.min(n - 1, state.pick + (up ? -1 : 1)));
        }
        render();
      }
      return;
    }

    if (key === '\x03') return quit(); // Ctrl+C

    // 页签切换：数字键直达，Tab/←→ 循环；只在菜单页生效，文本页里的数字没有歧义问题
    if (state.pages.length > 1 && state.screen === 'menu') {
      if (key >= '1' && key <= '9') {
        const i = Number(key) - 1;
        if (i < state.pages.length) return gotoPage(i);
      }
      if (key === '\t' || key === '\x1b[C') return gotoPage((state.page + 1) % state.pages.length);
      if (key === '\x1b[D') return gotoPage((state.page + state.pages.length - 1) % state.pages.length);
    }

    if (state.screen === 'text') {
      if (MENU_KEYS.up.includes(key)) state.textOffset -= 1;
      else if (MENU_KEYS.down.includes(key)) state.textOffset += 1;
      else if (MENU_KEYS.pageUp.includes(key)) state.textOffset -= 10;
      else if (MENU_KEYS.pageDown.includes(key)) state.textOffset += 10;
      else if (MENU_KEYS.esc.includes(key) || key === 'q' || MENU_KEYS.enter.includes(key)) {
        state.screen = 'menu';
        await refresh();
      }
      render();
      return;
    }

    if (state.screen === 'picker') {
      if (MENU_KEYS.up.includes(key)) state.pick = Math.max(0, state.pick - 1);
      else if (MENU_KEYS.down.includes(key)) state.pick = Math.min(state.pickTargets.length - 1, state.pick + 1);
      else if (MENU_KEYS.esc.includes(key) || key === 'q') {
        state.screen = 'menu';
        render();
        return;
      } else if (MENU_KEYS.enter.includes(key)) {
        const target = state.pickTargets[state.pick];
        const action = state.pickAction;
        state.screen = 'menu';
        if (target && action) return act(action, target.key);
      }
      render();
      return;
    }

    // menu
    if (MENU_KEYS.up.includes(key)) state.menu = (state.menu + state.menuItems.length - 1) % state.menuItems.length;
    else if (MENU_KEYS.down.includes(key)) state.menu = (state.menu + 1) % state.menuItems.length;
    else if (key === 'q' || MENU_KEYS.esc.includes(key)) return quit();
    else if (key === 'r') {
      state.flash = '';
      await refresh();
    } else if (MENU_KEYS.enter.includes(key)) {
      const item = state.menuItems[state.menu];
      if (!item) return;
      if (item.pick) {
        const section = state.sections.find((s) => s.id === item.pick);
        const targets = (section ? section.rows : []).filter((r) => r.key);
        if (!targets.length) {
          state.flash = item.emptyHint || '这里还没有可选的内容';
          state.error = true;
          return render();
        }
        state.screen = 'picker';
        state.pickTitle = item.pickTitle || item.label;
        state.pickTargets = targets;
        state.pick = Math.max(0, targets.findIndex((t) => t.active));
        state.pickAction = item.id;
        state.flash = '';
        return render();
      }
      return act(item.id, undefined);
    }
    render();
  }

  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  function quit() {
    leave();
    resolveDone();
  }

  return (async () => {
    state.pages = options.pages || [];
    // 初始页：别名（qoder2pi / workbuddy2pi）用它把焦点预落到对应页。
    // 越界就当 0，不报错——别名只是快捷方式，不该因为页号没对上就拒绝启动。
    if (Number.isInteger(options.initialPage) && options.initialPage > 0 && options.initialPage < state.pages.length) {
      state.page = options.initialPage;
    }
    enter();
    await refresh();
    render();
    return done;
  })();
}

// ---------------------------------------------------------------- 日志

/**
 * 纯文本日志。TUI 的渲染与它无关，但四个入口都需要同一套前缀。
 * 颜色码与 tui.js 的 C 一致，免得同一次输出里两种青不一样。
 */
const log = {
  ok: (m) => console.log(`\x1b[1;32m✓\x1b[0m ${m}`),
  info: (m) => console.log(`\x1b[1;36m==>\x1b[0m ${m}`),
  warn: (m) => console.log(`\x1b[1;33m!\x1b[0m ${m}`),
  fail: (m) => {
    console.error(`\x1b[1;31m错误:\x1b[0m ${m}`);
    process.exit(1);
  },
};

module.exports = {
  createTui, C, G, width, pad, truncate, wrapText, panel, termWidth, fillHeight, findCmd, resolveSpawn,
  // 主题：配色、字形、色彩能力探测
  THEME, BOX, SPINNER, SELECT_BG, BIG_FONT, bigText, detectColorMode, detectAppearance, hexTo256,
  // 共享工具：四个运维/向导文件原本各自声明一份
  readJson, parseModels, readVersion, PI_DIR, AUTH_JSON, DATA_DIR,
  // 供安装器与向导使用的日志前缀（与 shell 脚本的 ==>/!/错误: 保持一致）
  log,
};
