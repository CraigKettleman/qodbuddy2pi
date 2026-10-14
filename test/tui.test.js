#!/usr/bin/env node
/**
 * tui.test.js — 纯函数测试。
 *
 * 只测不碰终端、不碰文件系统的函数：宽度计算、补位、截断、高度填充、
 * 模型解析。这些是这次改动里最容易出错又完全可离线验证的部分。
 *
 * 渲染本身（行级差分）依赖 process.stdout，不在这里测；它的正确性靠
 * 在真终端里跑一遍确认。安装脚本也不测——那需要真实机器与环境，
 * 写出来的多半是假的。
 *
 * 跑法：node --test test/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { width, pad, truncate, parseModels, fillHeight, readJson, C } = require(
  path.join(__dirname, '..', 'assets', 'tui.js'),
);

// ---------------------------------------------------------------- width

test('width: ASCII 每字符算 1 列', () => {
  assert.strictEqual(width('abc'), 3);
  assert.strictEqual(width(''), 0);
});

test('width: CJK 与全角字符算 2 列', () => {
  assert.strictEqual(width('中文'), 4);
  assert.strictEqual(width('ａ'), 2); // 全角 a
  assert.strictEqual(width('。'), 2);
});

test('width: 中英混排按显示宽度相加', () => {
  assert.strictEqual(width('a中b'), 4);
  assert.strictEqual(width('状态 ok'), 4 + 1 + 2);
});

test('width: 忽略 ANSI 转义序列', () => {
  assert.strictEqual(width(`${C.green}ok${C.reset}`), 2);
  assert.strictEqual(width(`\x1b[1;32m中文\x1b[0m`), 4);
});

test('width: 面板字形算 1 列', () => {
  assert.strictEqual(width('╭─╮'), 3);
  assert.strictEqual(width('●○✓✗▸·'), 6);
});

// ---------------------------------------------------------------- pad

test('pad: 补齐到指定宽度', () => {
  assert.strictEqual(pad('ab', 5), 'ab   ');
  assert.strictEqual(pad('', 3), '   ');
});

test('pad: 已够宽时原样返回', () => {
  assert.strictEqual(pad('abcde', 5), 'abcde');
});

test('pad: 按显示宽度补，中英混排不会歪', () => {
  // '中文' 是 4 列，补到 6 列应该只加 2 个空格
  assert.strictEqual(pad('中文', 6), '中文  ');
  // ASCII 的 'abcd' 也是 4 列，补到 6 列加 2 个空格：两者结果等宽
  assert.strictEqual(width(pad('中文', 6)), width(pad('abcd', 6)));
});

test('pad: 超过目标宽度时走截断，结果是截断后的内容', () => {
  const out = pad('abcdefgh', 4);
  assert.ok(width(out) <= 4, `期望 <= 4 列，实际 ${width(out)}`);
});

// ---------------------------------------------------------------- truncate

test('truncate: 未超长时原样返回', () => {
  assert.strictEqual(truncate('abc', 5), 'abc');
  assert.strictEqual(truncate('abc', 3), 'abc');
});

test('truncate: 超长时截断并加省略号', () => {
  const out = truncate('abcdefghij', 5);
  assert.ok(out.includes('…'), '应包含省略号');
  assert.strictEqual(width(out), 5);
});

test('truncate: 结果宽度不超过上限（含省略号）', () => {
  for (const max of [1, 2, 3, 4, 5, 10]) {
    const out = truncate('中文字符串测试内容', max);
    assert.ok(width(out) <= max, `max=${max} 时宽度 ${width(out)} 超了`);
  }
});

test('truncate: 不会把一个双宽字符切成两半', () => {
  // 上限 3 列：放不下「中文」（4 列），省略号占 1 列，剩 2 列只能放一个字。
  // 末尾带一个 reset，所以比对时只看显示宽度与内容前缀。
  const out = truncate('中文', 3);
  assert.strictEqual(width(out), 3, `期望刚好 3 列，实际 ${width(out)}`);
  assert.ok(out.startsWith('中…'), `期望以「中…」开头，实际 ${JSON.stringify(out)}`);
});

test('truncate: 保留 ANSI 序列，并补一个 reset 以免颜色溢出', () => {
  const out = truncate(`${C.green}abcdef${C.reset}`, 4);
  // 不能写死具体的颜色码：C.green 会随终端色彩能力变化（真彩/256/16）。
  // 要的是「起始颜色还在、末尾有 reset、总宽不超限」。
  assert.ok(out.startsWith(C.green), '应保留起始颜色');
  assert.ok(out.includes('abcdef'[0]), '应保留内容');
  assert.ok(out.endsWith(C.reset), '应以 reset 结尾');
  assert.ok(width(out) <= 4);
});

test('truncate: 无颜色输出下也不会崩（NO_COLOR）', () => {
  // C.green 在无色彩环境下是空串，截断逻辑不能依赖它非空
  const out = truncate('abcdefghij', 5);
  assert.strictEqual(width(out), 5);
});

test('truncate: 需要截断时补一个 reset，以免颜色溢出到后面的内容', () => {
  const out = truncate('abcdefghij', 4);
  assert.ok(out.endsWith(C.reset), '应以 reset 结尾');
});

test('truncate: 未截断时原样返回，不附加 reset', () => {
  const plain = 'abc';
  assert.strictEqual(truncate(plain, 5), plain);
});

// ---------------------------------------------------------------- parseModels

const SAMPLE = [
  'qoder-cn qwen3-coder-plus  ctx 200k',
  'qoder-cn qwen3-max  ctx 128k',
  'qoder claude-sonnet-4  ctx 200k',
  'workbuddy deepseek-v4.1-flash  ctx 128k',
  'workbuddy-global claude-4.0  ctx 200k',
  'workbuddy-global gpt-5  ctx 128k',
].join('\n');

test('parseModels: 按 provider 分组', () => {
  const out = parseModels(SAMPLE, ['qoder-cn', 'qoder', 'workbuddy', 'workbuddy-global']);
  assert.strictEqual(out['qoder-cn'].length, 2);
  assert.strictEqual(out.qoder.length, 1);
  assert.strictEqual(out.workbuddy.length, 1);
  assert.strictEqual(out['workbuddy-global'].length, 2);
});

test('parseModels: 前缀相同的 provider 不会互相吃掉', () => {
  // workbuddy 与 workbuddy-global 只差后缀，按行首整词匹配才分得开
  const out = parseModels(SAMPLE, ['workbuddy', 'workbuddy-global']);
  assert.strictEqual(out.workbuddy.length, 1);
  assert.strictEqual(out['workbuddy-global'].length, 2);
  assert.ok(out.workbuddy[0].startsWith('workbuddy '), '不该混入 workbuddy-global 的行');
});

test('parseModels: 没有模型的 provider 得到空数组而不是缺字段', () => {
  const out = parseModels('qoder-cn a\n', ['qoder-cn', 'qoder']);
  assert.deepStrictEqual(out.qoder, []);
  assert.ok(Object.prototype.hasOwnProperty.call(out, 'qoder'), '字段应存在');
});

test('parseModels: 空输入不炸', () => {
  const out = parseModels('', ['qoder-cn']);
  assert.deepStrictEqual(out['qoder-cn'], []);
  const out2 = parseModels(null, ['qoder-cn']);
  assert.deepStrictEqual(out2['qoder-cn'], []);
  const out3 = parseModels(undefined, ['qoder-cn']);
  assert.deepStrictEqual(out3['qoder-cn'], []);
});

test('parseModels: 空白行与无关行被忽略', () => {
  const raw = '\n\nfoo bar\nqoder-cn a\n   \n';
  const out = parseModels(raw, ['qoder-cn']);
  assert.strictEqual(out['qoder-cn'].length, 1);
});

// ---------------------------------------------------------------- fillHeight

/**
 * fillHeight 读 process.stdout.rows。测试里显式设成想要的值，跑完还原，
 * 免得影响同一进程里的其它测试。
 */
function withRows(rows, fn) {
  const orig = Object.getOwnPropertyDescriptor(process.stdout, 'rows');
  Object.defineProperty(process.stdout, 'rows', { value: rows, configurable: true });
  try {
    return fn();
  } finally {
    if (orig) Object.defineProperty(process.stdout, 'rows', orig);
    else delete process.stdout.rows;
  }
}

test('fillHeight: 补到 rows - 1 行', () => {
  withRows(24, () => {
    const out = fillHeight(['a', 'b'], 80);
    assert.strictEqual(out.length, 23, '应补到 23 行（留一行给末尾的换行）');
    assert.strictEqual(out[0], 'a');
    assert.strictEqual(out[1], 'b');
  });
});

test('fillHeight: 补出的空行是整宽的空白', () => {
  withRows(10, () => {
    const out = fillHeight(['x'], 40);
    for (let i = 1; i < out.length; i += 1) {
      assert.strictEqual(width(out[i]), 40, `第 ${i} 行应是 40 列空白`);
    }
  });
});

test('fillHeight: 内容比屏幕高时原样返回，不截断', () => {
  withRows(5, () => {
    const lines = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const out = fillHeight(lines, 80);
    assert.deepStrictEqual(out, lines, '不能剪掉内容');
  });
});

test('fillHeight: 恰好等于目标行数时不动', () => {
  withRows(4, () => {
    const lines = ['1', '2', '3']; // rows - 1 === 3
    assert.deepStrictEqual(fillHeight(lines, 80), lines);
  });
});

test('fillHeight: 不修改传入的数组', () => {
  withRows(10, () => {
    const lines = ['a'];
    fillHeight(lines, 20);
    assert.strictEqual(lines.length, 1, '原数组不应被改动');
  });
});

// ---------------------------------------------------------------- readJson

test('readJson: 不存在的文件返回 null，不抛异常', () => {
  assert.strictEqual(readJson('/nonexistent/qodbuddy-test-xyz.json'), null);
});

test('readJson: 内容损坏时返回 null', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qodbuddy-test-'));
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{ not json');
  try {
    assert.strictEqual(readJson(bad), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readJson: 正常文件解析成对象', () => {
  const os = require('node:os');
  const fs = require('node:fs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qodbuddy-test-'));
  const good = path.join(dir, 'ok.json');
  fs.writeFileSync(good, JSON.stringify({ a: 1, b: ['x'] }));
  try {
    assert.deepStrictEqual(readJson(good), { a: 1, b: ['x'] });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
