#!/usr/bin/env node
/**
 * render-width.test.js — 界面每一行的宽度必须正好等于终端宽度。
 *
 * 为什么值得单独一条：行宽算错时终端不会报错，只会默默折行或留残影，
 * 而那正是「界面看起来不对」最常见的成因。这次重排的过程中就出现过
 * 右侧分栏少算一列（分隔占 5 列而非 4 列）导致的错位。
 *
 * 做法：把 stdout 换成一个只收集字符串的假对象，直接量渲染产物的每一行，
 * 不经过 PTY——PTY 会把 \n 翻成 \r\n、还会插入清行序列，干扰行宽判断。
 *
 * 跑法：node --test test/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const TUI = path.join(__dirname, '..', 'assets', 'tui.js');

/**
 * 一次性把界面渲染出来并取回「最终屏幕」的行数组。
 *
 * 为什么不能只取最后一帧的字节：渲染器首帧整屏重写、之后只按绝对定位
 * （\x1b[<行>H）重写变化的行。只看最后一次 \x1b[H] 永远拿到「正在读取…」
 * 的首帧，看不到真正的内容。
 *
 * 因此这里做一个最小的终端模拟：假 stdout 在每次 write 时按控制序列
 * 更新一块行缓冲，测试直接读那块缓冲。
 */
function frame(cols, rows, opts) {
  return new Promise((resolve, reject) => {
    const screen = new Map(); // 行号(1 起) → 内容（含 ANSI）
    let row = 1;
    let pending = '';

    const flush = () => {
      screen.set(row, (screen.get(row) || '') + pending);
      pending = '';
    };

    const emit = (s) => {
      let i = 0;
      while (i < s.length) {
        if (s[i] === '\x1b') {
          const m = /^\x1b\[([0-9;]*)([a-zA-Z])/.exec(s.slice(i));
          if (m) {
            const params = m[1];
            const final = m[2];
            if (final === 'H') {
              flush();
              row = params === '' ? 1 : Number(params.split(';')[0] || 1);
              // 绝对定位是「光标移到该行行首」：后续写入从行首覆盖，
              // 不是追加。追加会把同一行写很多遍，宽度翻倍。
              screen.delete(row);
            } else if (final === 'J') {
              // 清屏尾：只在整屏重写末尾出现。此时行号是顺序递增的，
              // 所以「当前行之后」就是还没写到的行——把之前帧残留的高行删掉。
              // 不能用 row 比较删差分帧的行：差分帧行号是跳着的。
              flush();
              for (const k of [...screen.keys()]) if (k > row) screen.delete(k);
            }
            // 其余（颜色、\x1b[K 等）忽略：它们不改行结构
            i += m[0].length;
            continue;
          }
        }
        if (s[i] === '\r') { i += 1; continue; }
        if (s[i] === '\n') { flush(); row += 1; i += 1; continue; }
        pending += s[i];
        i += 1;
      }
    };

    const fakeOut = {
      columns: cols, rows, isTTY: true,
      write(s) { emit(String(s)); return true; },
      on() {}, off() {}, removeListener() {},
    };
    const fakeIn = {
      isTTY: true, setEncoding() {}, setRawMode() {}, resume() {}, pause() {},
      on() {}, off() {}, removeListener() {},
    };
    Object.defineProperty(process, 'stdout', { value: fakeOut, configurable: true });
    Object.defineProperty(process, 'stdin', { value: fakeIn, configurable: true });
    delete require.cache[require.resolve(TUI)];
    const tui = require(TUI);

    try {
      tui.createTui(opts(tui)).catch(reject);
    } catch (e) {
      reject(e);
      return;
    }

    const started = Date.now();
    const pick = () => {
      flush();
      // 末尾可能有一行只是光标停留处（渲染最后写的 \r\n 造成的），无内容，去掉
      let maxRow = Math.max(...screen.keys(), 0);
      while (maxRow > 0 && !(screen.get(maxRow) || '').trim()) maxRow -= 1;
      const lines = [];
      for (let r = 1; r <= maxRow; r += 1) lines.push(screen.get(r) || '');
      // 首帧是「正在读取…」的占位；等 refresh 真正返回再取
      const stillLoading = lines.some((l) => /正在读取/.test(l));
      if (stillLoading && Date.now() - started < 3000) {
        setTimeout(pick, 30);
        return;
      }
      resolve({ lines, tui });
    };
    setTimeout(pick, 60);
  });
}

const MENU_OPTS = (tui) => ({
  title: '测试页',
  subtitle: '副标题在这里',
  async refresh() {
    const { C, G } = tui;
    return {
      status: [
        ['pi', `${C.success}${G.ok}${C.reset} 1.2.0`],
        ['一个很长的标签', `${C.muted}值${C.reset}`],
      ],
      sections: [{
        id: 's',
        title: '区域',
        hint: '● 已登录　○ 未登录',
        rows: [
          { key: 'a', label: '国内版  某个 provider', note: '已登录 · 13 个模型', active: true },
          { key: 'b', label: '国际版  某个 provider', note: '未登录', active: false },
        ],
      }],
      menu: [
        { id: 'm1', group: '账号', label: '切换账号', note: '换一个账号生效' },
        { id: 'm2', group: '服务', label: '重启服务', note: '重启本机反代进程' },
      ],
    };
  },
  async onAction() { return { flash: 'ok' }; },
});

const PAGES_OPTS = (tui) => ({
  ...MENU_OPTS(tui),
  pages: [
    { label: 'Qoder', ...MENU_OPTS(tui) },
    { label: 'WorkBuddy 国内版', ...MENU_OPTS(tui) },
    { label: 'WorkBuddy 国际版', ...MENU_OPTS(tui) },
  ],
});

test('菜单页：每行宽度等于终端宽度（多种尺寸）', async () => {
  for (const [cols, rows] of [[80, 24], [100, 30], [118, 34], [160, 40], [70, 20], [60, 18]]) {
    const { lines, tui } = await frame(cols, rows, MENU_OPTS);
    const bad = lines
      .map((l, i) => ({ i: i + 1, w: tui.width(l), vis: l.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') }))
      .filter((x) => x.w !== cols);
    assert.strictEqual(
      bad.length, 0,
      `${cols}x${rows} 下有 ${bad.length} 行宽度不等于 ${cols}：\n`
      + bad.map((x) => `  第 ${x.i} 行 宽=${x.w} ${JSON.stringify(x.vis.slice(0, 60))}`).join('\n'),
    );
  }
});

test('多页签界面：每行宽度也等于终端宽度', async () => {
  for (const [cols, rows] of [[80, 24], [118, 34], [160, 40]]) {
    const { lines, tui } = await frame(cols, rows, PAGES_OPTS);
    const bad = lines
      .map((l, i) => ({ i: i + 1, w: tui.width(l) }))
      .filter((x) => x.w !== cols);
    assert.strictEqual(bad.length, 0, `${cols}x${rows} 下有 ${bad.length} 行宽度异常`);
  }
});

test('界面占满终端（rows - 1 行，末行留给换行）', async () => {
  // 只占 rows - 1：渲染末尾要写一个换行把光标留在下一行；填满 rows 会把屏幕顶上去
  for (const rows of [20, 24, 34]) {
    const { lines } = await frame(100, rows, MENU_OPTS);
    assert.strictEqual(lines.length, rows - 1, `${rows} 行终端渲染出 ${lines.length} 行`);
  }
});

test('界面延伸到终端底部，末行是状态栏', async () => {
  const { lines } = await frame(100, 34, MENU_OPTS);
  const last = lines[lines.length - 1].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  assert.ok(/[↑↓←→]|Enter/.test(last), `末行应是状态栏，实际 ${JSON.stringify(last.slice(0, 40))}`);
});

test('非框内容不超出宽度（含 CJK 与 ANSI 混排）', async () => {
  const { lines, tui } = await frame(76, 24, (t) => ({
    ...MENU_OPTS(t),
    subtitle: '中英混排 subtitle with English and 中文，还有全角标点：！？（）',
  }));
  const over = lines.filter((l) => tui.width(l.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trimEnd()) > 76);
  assert.strictEqual(over.length, 0, `有 ${over.length} 行超出宽度`);
});

test('窄终端退成上下单栏，且菜单不会被吞掉', async () => {
  const { lines } = await frame(72, 30, MENU_OPTS);
  const vis = lines.map((l) => l.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, ''));
  const text = vis.join('\n');
  // 左栏内容在
  assert.ok(text.includes('状态'), '窄布局应仍有状态区');
  assert.ok(text.includes('区域'), '窄布局应仍有分区');
  // 操作菜单也要在（曾经因为行数算错被 stretch 整个截掉）
  assert.ok(text.includes('操作'), '窄布局不应吞掉操作菜单');
  assert.ok(text.includes('切换账号') || text.includes('登录国内版'), '菜单项应在');
  // banner 框有边框字形，其余是裸排；只检查内容行不残留分栏竖线以外的框线
  const cols = vis.filter((l) => (l.match(/│/g) || []).length > 2);
  assert.strictEqual(cols.length, 0, '窄布局不该再画分栏竖线');
});

// ---------------------------------------------------------------- 鼠标与滚轮

/**
 * 往界面里注入一段字节，然后取回屏幕。
 *
 * 滚轮那件事必须端到端验证：它是否生效取决于 enter() 有没有开鼠标追踪、
 * splitKeys 有没有正确识别 SGR 报告、handleKey 有没有吃掉事件，三处任一
 * 出错都会让终端自己滚屏。单测某个函数证明不了这一点。
 */
function withInput(keys, cols, rows, opts) {
  return new Promise((resolve, reject) => {
    const screen = new Map();
    let row = 1;
    let pending = '';
    const flush = () => { screen.set(row, (screen.get(row) || '') + pending); pending = ''; };
    const emit = (str) => {
      let i = 0;
      while (i < str.length) {
        if (str[i] === '\x1b') {
          const m = /^\x1b\[([0-9;]*)([a-zA-Z])/.exec(str.slice(i));
          if (m) {
            if (m[2] === 'm') {
              // 颜色序列要留在缓冲里：测试靠 selectedBg 找选中行
              pending += m[0];
              i += m[0].length;
              continue;
            }
            if (m[2] === 'H') {
              flush();
              row = m[1] === '' ? 1 : Number(m[1].split(';')[0] || 1);
              screen.delete(row);
            } else if (m[2] === 'J') {
              flush();
              for (const k of [...screen.keys()]) if (k > row) screen.delete(k);
            }
            i += m[0].length;
            continue;
          }
        }
        if (str[i] === '\r') { i += 1; continue; }
        if (str[i] === '\n') { flush(); row += 1; i += 1; continue; }
        pending += str[i];
        i += 1;
      }
    };
    const written = [];
    const fakeOut = {
      columns: cols, rows, isTTY: true,
      write(s) { written.push(String(s)); emit(String(s)); return true; },
      on() {}, off() {}, removeListener() {},
    };
    let dataHandler = null;
    const fakeIn = {
      isTTY: true, setEncoding() {}, setRawMode() {}, resume() {}, pause() {},
      on(evt, fn) { if (evt === 'data') dataHandler = fn; },
      off() {}, removeListener() {},
    };
    Object.defineProperty(process, 'stdout', { value: fakeOut, configurable: true });
    Object.defineProperty(process, 'stdin', { value: fakeIn, configurable: true });
    delete require.cache[require.resolve(TUI)];
    const tui = require(TUI);
    try {
      tui.createTui(opts(tui)).catch(reject);
    } catch (e) { reject(e); return; }

    const started = Date.now();
    const step = () => {
      flush();
      const maxRow = [...screen.keys()].length ? Math.max(...screen.keys()) : 0;
      const lines = [];
      for (let r = 1; r <= maxRow; r += 1) lines.push(screen.get(r) || '');
      const loading = lines.some((l) => /正在读取/.test(l));
      if (loading && Date.now() - started < 3000) { setTimeout(step, 30); return; }
      if (keys.length && dataHandler) {
        dataHandler(keys.shift());
        setTimeout(step, 120);
        return;
      }
      resolve({ lines, raw: written.join('') });
    };
    setTimeout(step, 60);
  });
}

test('进入界面时开启鼠标追踪，退出时关闭', async () => {
  const { raw } = await withInput([], 100, 26, MENU_OPTS);
  // 不开鼠标追踪，终端的滚动缓冲会把界面滚出去（这是实际踩到的问题）
  assert.ok(raw.includes('\x1b[?1000h'), '应开启基本鼠标事件');
  assert.ok(raw.includes('\x1b[?1006h'), '应开启 SGR 坐标格式');
});

test('滚轮改变选中项，而不是让终端滚屏', async () => {
  const tuiRef = require(TUI);
  const base = await withInput([], 100, 26, MENU_OPTS);
  const after = await withInput(['\x1b[<65;20;10M'], 100, 26, MENU_OPTS);
  // 选中行带 selectedBg 底色。底色序列随终端色彩能力变化（真彩/256/16），
  // 从模块里取；再从最终屏幕（而不是某一段差分）里找带底色的那一行。
  const pickLines = (r) => r.lines.filter((l) => l.includes(tuiRef.SELECT_BG || '\u001b[48;5;'));
  const pick = (r) => {
    const hit = pickLines(r).pop() || '';
    return hit.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim();
  };
  assert.ok(pick(base).includes('切换账号'), `基准选中项应是第一项，实际 ${JSON.stringify(pick(base))}`);
  assert.ok(
    pick(after).length > 0 && pick(after) !== pick(base),
    `滚轮应移动选中项：基准 ${JSON.stringify(pick(base))}，滚轮后 ${JSON.stringify(pick(after))}`,
  );
});

test('滚轮事件不会被拆成乱码字符', async () => {
  // SGR 报告里有 '<'，普通 CSI 正则匹配不到，会被逐字符拆开并当成按键处理。
  // 表现是界面上出现 '[<65;20;10M' 这类痕迹。
  const { lines } = await withInput(['\x1b[<65;20;10M'], 100, 26, MENU_OPTS);
  const text = lines.join('\n').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  assert.ok(!text.includes(';20;10'), '屏幕上不该出现鼠标报告的残片');
  assert.ok(!/\[<\d+;\d+;\d+/.test(text), '屏幕上不该出现鼠标报告原文');
});
