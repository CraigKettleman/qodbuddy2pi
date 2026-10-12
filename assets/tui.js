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

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  inverse: '\x1b[7m',
  // 面板外框用的灰阶：比 dim 亮一档，既有边框感又不抢正文
  frame: '\x1b[90m',
  title: '\x1b[1;96m',
};

/** 选中行的高亮底色，光标在哪一行一眼能看到。 */
const SELECT_BG = '\x1b[48;5;236m';

/** 面板与状态用的字形。选的都是等宽字体下宽度稳定的符号。 */
const G = {
  running: '●',
  idle: '○',
  ok: '✓',
  bad: '✗',
  current: '●',
  other: '○',
  pointer: '▸',
  dot: '·',
};

const ALT_ON = '\x1b[?1049h';
const ALT_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';

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

function termWidth() {
  return Math.max(60, Math.min(process.stdout.columns || 80, 110));
}

/**
 * 画一个带标题的面板。rows 可以含 ANSI：这里统一做 ANSI 感知的补位，
 * 调用方不需要自己算宽度。
 * 外框总宽 = inner + 4（左右各一个边框加一个空格）。
 */
function panel(title, rows, inner) {
  const head = `─ ${title} `;
  const dashes = Math.max(0, inner + 4 - width(head) - 2);
  const out = [`${C.frame}╭${C.title}${head}${C.frame}${'─'.repeat(dashes)}╮${C.reset}`];
  for (const row of rows) {
    // 行可以是字符串，也可以是 { text, hl }：hl 为真时整行铺底色
    const text = typeof row === 'string' ? row : row.text;
    const body = pad(text, inner);
    out.push(row && row.hl
      ? `${C.frame}│${C.reset}${SELECT_BG} ${body} ${C.reset}${C.frame}│${C.reset}`
      : `${C.frame}│${C.reset} ${body} ${C.frame}│${C.reset}`);
  }
  out.push(`${C.frame}╰${'─'.repeat(inner + 2)}╯${C.reset}`);
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
    active: false,
    // 多页：pages 为空时就是单页界面（workbuddy2pi / qoder2pi 照旧），
    // 给了 pages 才在标题上方画页签，用 1..9 或 Tab 切换
    pages: [],
    page: 0,
    title: '',
    subtitle: '',
  };

  // ------------------------------------------------------------ 渲染

  /** 页签行；单页界面返回空数组。 */
  function renderTabs(w) {
    if (state.pages.length < 2) return [];
    const parts = state.pages.map((p, i) => (
      i === state.page
        ? `${C.cyan}${C.bold} ${i + 1} ${p.label} ${C.reset}`
        : `${C.dim} ${i + 1} ${p.label} ${C.reset}`
    ));
    const bar = parts.join(`${C.frame}│${C.reset}`);
    return [truncate(bar, w), ''];
  }

  function renderMenu() {
    const w = termWidth();
    const inner = w - 4;
    const lines = [];

    lines.push(...renderTabs(w));
    lines.push(`${C.title}${state.title}${C.reset}`);
    if (state.subtitle) lines.push(`${C.dim}  ${truncate(state.subtitle, w - 2)}${C.reset}`);

    if (state.status.length) {
      // 标签按显示宽度对齐，中英文混排时不会歪；值里的 ANSI 不影响计宽
      const labelW = Math.max(...state.status.map(([k]) => width(k)));
      const rows = state.status.map(([k, v]) => `${C.cyan}${pad(k, labelW)}${C.reset}  ${v}`);
      lines.push(...panel('状态', rows, inner));
      lines.push('');
    }

    for (const section of state.sections) {
      if (!section.rows.length) continue;
      const rows = section.rows.map((row) => {
        const mark = row.active === true ? `${C.green}${G.current}${C.reset}`
          : row.active === false ? `${C.dim}${G.other}${C.reset}`
            : row.marker || ' ';
        const body = `${pad(row.label, section.labelWidth || 26)}${C.dim}${row.note || ''}${C.reset}`;
        return `${mark} ${body}`;
      });
      lines.push(...panel(section.title, rows, inner));
      if (section.hint) lines.push(`  ${C.dim}${truncate(section.hint, w - 4)}${C.reset}`);
      lines.push('');
    }

    if (state.menuItems.length) {
      const rows = [];
      for (const item of state.menuItems) {
        if (item.group && item.group !== rows.lastGroup) {
          const g = `─ ${item.group} `;
          rows.push(`${C.frame}${g}${'─'.repeat(Math.max(0, inner - width(g)))}${C.reset}`);
          rows.lastGroup = item.group;
        }
        const selected = state.menuItems[state.menu] === item;
        const pointer = selected ? `${C.cyan}${C.bold}${G.pointer}${C.reset}` : ' ';
        const label = pad(item.label, 18);
        const noteWidth = Math.max(10, inner - 22);
        const note = item.note ? truncate(item.note, noteWidth) : '';
        const text = ` ${pointer} ${selected ? `${C.bold}${C.white}${label}${C.reset}` : label}${C.dim}${note}${C.reset}`;
        rows.push(selected ? { text, hl: true } : text);
      }
      lines.push(...panel('操作', rows, inner));
      lines.push('');
    }

    const hints = state.pages.length < 2
      ? (options.footer || '↑↓ 选择　Enter 执行　r 刷新　q 退出')
      : (options.footer || `←→/Tab 切换　↑↓ 选择　Enter 执行　r 刷新　q 退出`);
    lines.push(`  ${C.dim}${hints}${C.reset}`);
    if (state.busy) lines.push(`  ${C.yellow}${state.busy}${C.reset}`);
    else if (state.flash) lines.push(`  ${state.error ? C.yellow : C.green}${state.flash}${C.reset}`);

    return lines;
  }

  function renderPicker() {
    const w = termWidth();
    const inner = w - 4;
    const lines = [
      `${C.cyan}${C.bold}${state.pickTitle}${C.reset}`,
      `${C.dim}  ${state.title}${C.reset}`,
      '',
    ];
    const rows = state.pickTargets.map((t) => {
      const mark = t.active ? `${C.green}${G.current}${C.reset}` : `${C.dim}${G.other}${C.reset}`;
      return `${mark} ${pad(t.label, 24)}${C.dim}${t.note || ''}${C.reset}`;
    });
    lines.push(...panel('请选择', rows, inner));
    lines.push('');
    lines.push(`  ${C.dim}↑↓ 选择　Enter 确认　Esc 返回${C.reset}`);
    if (state.flash) lines.push(`  ${state.error ? C.yellow : C.green}${state.flash}${C.reset}`);
    return lines;
  }

  function renderText() {
    const height = Math.max(6, (process.stdout.rows || 24) - 6);
    const inner = termWidth() - 4;
    const lines = [
      `${C.cyan}${C.bold}${state.textTitle}${C.reset}`,
      '',
    ];
    const maxStart = Math.max(0, state.text.length - height);
    state.textOffset = Math.max(0, Math.min(state.textOffset, maxStart));
    const view = state.text.slice(state.textOffset, state.textOffset + height);
    const rows = view.map((l) => l.replace(/\t/g, '  '));
    lines.push(...panel('输出', rows.length ? rows : ['（无输出）'], inner));
    const pos = state.text.length > height
      ? `　${state.textOffset + 1}-${state.textOffset + view.length}/${state.text.length} 行`
      : '';
    lines.push('');
    lines.push(`  ${C.dim}↑↓ 滚动${pos}　Esc/q 返回${C.reset}`);
    return lines;
  }

  // macOS/Linux 下 \n 隐含回车，Windows 控制台不隐含：必须显式写 \r\n，
  // 否则光标停在上一行末尾，每一行都会往右台阶状偏移，\x1b[K 也会清错区间。
  function render() {
    if (!state.active) return;
    const lines = state.screen === 'picker' ? renderPicker()
      : state.screen === 'text' ? renderText()
        : renderMenu();
    process.stdout.write(`\x1b[H${lines.map((l) => `${l}\x1b[K`).join('\r\n')}\r\n\x1b[J`);
  }

  // ------------------------------------------------------------ 生命周期

  function enter() {
    state.active = true;
    process.stdout.write(ALT_ON + CURSOR_HIDE);
    if (process.stdin.setRawMode) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
  }

  function leave() {
    if (!state.active) return;
    state.active = false;
    process.stdin.off('data', onKey);
    // Windows 上没有 SIGWINCH，注册过也永远不会触发；移除是空操作，这里只是表明意图
    process.off('SIGWINCH', render);
    try {
      if (process.stdin.setRawMode) process.stdin.setRawMode(false);
      process.stdin.pause();
    } catch {
      /* 非 TTY 时 setRawMode 会抛，忽略 */
    }
    process.stdout.write(CURSOR_SHOW + ALT_OFF);
  }

  // ------------------------------------------------------------ 数据刷新

  async function refresh() {
    // 有 pages 时数据来自当前页，没 pages 时就是 options 本身（单页用法）
    const page = state.pages[state.page];
    const src = page || options;
    const data = await (page ? page.refresh() : options.refresh());
    state.title = page ? (state.pages[state.page].title || page.label) : options.title;
    state.subtitle = page ? (page.subtitle || '') : (options.subtitle || '');
    state.status = data.status || [];
    state.sections = data.sections || [];
    state.menuItems = (data.menu || []).map(Object.freeze);
    if (data.footer) src.footer = data.footer;
    if (state.menu >= state.menuItems.length) state.menu = 0;
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

  async function onKey(key) {
    if (!state.active || state.busy) return;

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
    enter();
    // 终端改大小时重绘。Windows 不发这个信号，那里只能靠 r 手动刷新
    if (process.platform !== 'win32') process.on('SIGWINCH', render);
    process.stdin.on('data', onKey);
    await refresh();
    render();
    return done;
  })();
}

module.exports = { createTui, C, G, width, pad, truncate, panel, termWidth, findCmd };
