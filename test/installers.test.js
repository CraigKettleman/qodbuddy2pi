#!/usr/bin/env node
/**
 * installers.test.js — 两份安装脚本的一致性检查。
 *
 * 安装逻辑本身不测（那要真实机器与环境，写出来的多半是假的），但有一类
 * 错误完全可以在离线时抓住：两份脚本对同一份文件清单的描述不一致。
 * 这正是「四份脚本各写一遍」时代的病根，所以在这里钉住。
 *
 * 跑法：node --test test/
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// 归一化行尾再解析：Windows 检出时 install.ps1 是 CRLF（见 .gitattributes），
// 而下面那批按 ^ 与 \n 写的正则遇到 \r 会失配，测试会在 Windows 上假红。
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const SH = read('install.sh');
const PS1 = read('install.ps1');

/** 从 install.sh 的 OPS_FILES 数组里取出文件名（去掉 :mode）。 */
function shFileList() {
  const m = SH.match(/^OPS_FILES=\(\n([\s\S]*?)^\)/m);
  assert.ok(m, 'install.sh 里找不到 OPS_FILES 数组');
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('"'))
    .map((l) => l.replace(/^"/, '').replace(/"$/, '').split(':')[0]);
}

/** 从 install.ps1 的 $OPS_FILES 数组里取出文件名（一行可能放两个）。 */
function ps1FileList() {
  const m = PS1.match(/^\$OPS_FILES = @\(\n([\s\S]*?)^\)/m);
  assert.ok(m, 'install.ps1 里找不到 $OPS_FILES 数组');
  return m[1]
    .split('\n')
    .map((l) => l.trim().replace(/,$/, ''))
    // 一行可能是 "a", "b"，所以逐个抽引号里的内容
    .flatMap((l) => [...l.matchAll(/"([^"]+)"/g)].map((x) => x[1]));
}

test('两份安装脚本部署同一组文件', () => {
  const sh = shFileList().sort();
  const ps1 = ps1FileList().sort();
  assert.deepStrictEqual(
    sh,
    ps1,
    `install.sh 与 install.ps1 的文件清单不一致\n  sh : ${sh.join(', ')}\n  ps1: ${ps1.join(', ')}`,
  );
});

test('清单里的每个文件都真实存在', () => {
  for (const name of shFileList()) {
    const p = path.join(ROOT, 'assets', name);
    assert.ok(fs.existsSync(p), `清单里列了 ${name}，但 assets/ 下没有它`);
  }
});

test('清单里不再包含已删除的 workbuddy2pi-global', () => {
  const all = [...shFileList(), ...ps1FileList()];
  assert.ok(
    !all.some((f) => f.includes('workbuddy2pi-global')),
    'workbuddy2pi-global 已并入总控的页签，两份脚本都该清理它而不是部署它',
  );
});

test('两份脚本都会清理旧的 workbuddy2pi-global', () => {
  assert.match(SH, /workbuddy2pi-global/, 'install.sh 应清理旧命令');
  assert.match(PS1, /workbuddy2pi-global/, 'install.ps1 应清理旧命令');
});

test('两份脚本都调用 qodbuddy2pi probe 做探测（而不是各写一套）', () => {
  assert.match(SH, /qodbuddy2pi"?\s*probe|probe_state/, 'install.sh 应调 probe');
  assert.match(PS1, /probe/, 'install.ps1 应调 probe');
});

test('两份脚本都用 pi 的官方安装方式，而不是自己装 Node', () => {
  assert.match(SH, /https:\/\/pi\.dev\/install\.sh/, 'install.sh 应用官方安装方式');
  assert.match(PS1, /https:\/\/pi\.dev\/install\.ps1/, 'install.ps1 应用官方安装方式');
  // 自己装 Node 的逻辑（brew install node / winget NodeJS）应该已经删掉
  assert.ok(!/brew install node/.test(SH), 'install.sh 不该再自己 brew 装 Node');
  assert.ok(
    !/winget install[^\n]*NodeJS/i.test(PS1),
    'install.ps1 不该再自己 winget 装 Node',
  );
});

test('$var 紧跟中文标点的写法会踩 bash 的坑，install.sh 里不能有', () => {
  // bash 会把中文字符当成变量名的一部分（$name，→ 变量名 "name，"），
  // 于是 set -u 下报 unbound variable。必须写成 ${name}。
  const lines = SH.split('\n');
  const offenders = [];
  lines.forEach((line, i) => {
    if (line.trim().startsWith('#')) return;
    // 简单 $var 形式（不是 ${...}）后面紧接非 ASCII
    const re = /\$([A-Za-z_][A-Za-z0-9_]*)(?=[^\x00-\x7F])/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      offenders.push(`  第 ${i + 1} 行: $${m[1]} 紧跟中文 → ${line.trim().slice(0, 70)}`);
    }
  });
  assert.strictEqual(
    offenders.length,
    0,
    `install.sh 里有 $var 紧跟中文的写法，会解析成别的变量名:\n${offenders.join('\n')}`,
  );
});
