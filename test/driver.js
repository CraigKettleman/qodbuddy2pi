#!/usr/bin/env node
/**
 * driver.js — 渲染器的最小驱动器（测试用）。
 *
 * 不加载任何 provider 业务逻辑，只用固定的假数据调 createTui，用来单独验证：
 * 标题行、铺满高度、以及行级差分（按方向键时到底重写了哪些行）。
 *
 * 由 test/pty-render.py 在指定尺寸的 PTY 里启动，尺寸从 argv 取。
 */

'use strict';

const path = require('node:path');
const { createTui, C, G } = require(path.join(__dirname, '..', 'assets', 'tui.js'));

// PTY 默认开着 ONLCR，会把子进程写的 \n 翻成 \r\n，字节流里的换行数变成两倍，
// 没法用来判断「填了多少行」。真正关掉它的地方在 test/pty-render.py（它持有
// pty 主端，能改 termios）；这里不做任何输出相关的特殊处理，让渲染器走和真终端
// 完全一样的路径。

const rows = [
  { key: 'a', label: '选项甲  option-a', note: '第一项', active: true },
  { key: 'b', label: '选项乙  option-b', note: '第二项', active: false },
  { key: 'c', label: '选项丙  option-c', note: '第三项', active: false },
];

createTui({
  title: '驱动测试',
  subtitle: '只验证渲染，不碰真实凭证',
  async refresh() {
    return {
      status: [
        ['Node', `${C.green}${G.ok}${C.reset} ${process.version}`],
        ['终端', `${process.stdout.columns}x${process.stdout.rows}`],
      ],
      sections: [{ id: 'items', title: '测试项', rows }],
      menu: [
        { id: 'noop', group: '操作', label: '什么都不做', note: '按回车只刷新' },
        { id: 'noop2', group: '操作', label: '第二个操作项', note: '用来验证选中行会跟着动' },
      ],
    };
  },
  async onAction() {
    return { flash: '已执行' };
  },
}).then(() => {
  // 按键完全交给 TUI 自己处理。早先这里又注册了一个 stdin 监听器去调 done()，
  // 结果是它和 TUI 的监听器抢同一份输入——TUI 的 leave() 会把自己的监听器摘掉，
  // 界面就不再响应按键。退出用 q / Esc，超时由 pty 脚本 kill。
});
