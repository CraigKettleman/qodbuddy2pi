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

// ---------------------------------------------------------------- 三种安装入口

/**
 * npm 与 release 两条路都靠 `qodbuddy2pi install` 把包内的安装器调起来。
 * 这条链路断在哪一环都不会在开发机上显形（开发时都是直接跑 ./install.sh），
 * 所以在这里钉住：子命令在、安装器找得到、npm 的 files 白名单把它带上了。
 */
test('qodbuddy2pi 有 install 子命令，且指向包内的同一个安装器', () => {
  const entry = read('assets/qodbuddy2pi');
  assert.match(entry, /cmd === 'install'/, '入口应识别 install 子命令');
  assert.match(entry, /runInstaller/, '入口应有 runInstaller 实现');
  // 必须去找 install.sh / install.ps1，而不是另写一套安装逻辑
  assert.match(entry, /install\.sh/, 'runInstaller 应调 install.sh');
  assert.match(entry, /install\.ps1/, 'runInstaller 应调 install.ps1');
});

test('npm 的 files 白名单带上了安装器与 vendored 依赖', () => {
  const pkg = JSON.parse(read('package.json'));
  const files = pkg.files || [];
  for (const need of ['install.sh', 'install.ps1']) {
    assert.ok(files.includes(need), `package.json 的 files 应包含 ${need}`);
  }
  assert.ok(
    files.some((f) => f.startsWith('assets/vendor')),
    'package.json 的 files 应包含 assets/vendor（扩展副本与反代 wheel）',
  );
  // bin 指向的入口也要被打包，否则 npm i -g 装出四个断链的命令
  for (const target of Object.values(pkg.bin || {})) {
    assert.ok(files.includes(target), `files 应包含 bin 入口 ${target}`);
  }
});

test('release 包的 start.sh / start.cmd 调的是同一个安装器', () => {
  const rel = read('make-release.sh');
  assert.match(rel, /install\.sh/, 'start.sh 应调 install.sh');
  assert.match(rel, /install\.ps1/, 'start.cmd 应调 install.ps1');
  // 压缩包内容必须来自 npm pack，两边才不会漂移
  assert.match(rel, /npm pack/, 'release 内容应来自 npm pack');
});

test('qoder 扩展装的是稳定副本，不是仓库或解压目录', () => {
  // pi install 记录的是路径引用；指向仓库 / 临时解压目录的话，
  // 仓库挪走或 release 包被删之后 provider 就失效了。
  assert.match(SH, /\.qoder2pi\/vendor/, 'install.sh 应把扩展复制到 ~/.qoder2pi/vendor');
  assert.match(PS1, /\\.qoder2pi\\vendor/, 'install.ps1 应把扩展复制到 ~/.qoder2pi/vendor');
  // 两份脚本都不该把 vendorQoder 直接指到 $Here / $Res 下的源目录
  assert.ok(
    !/\"vendorQoder\": \"\$vendor\"/.test(SH),
    'install.sh 的 vendorQoder 不该直接指向仓库里的源目录',
  );
});

test('发布流程：打 tag 时同时出 npm 包与四个平台的压缩包', () => {
  const wf = read('.github/workflows/release.yml');
  assert.match(wf, /tags:/, 'workflow 应监听 tag');
  assert.match(wf, /npm test/, '发布前应跑测试');
  assert.match(wf, /npm publish/, '应发布到 npm');
  assert.match(wf, /make-release\.sh --all/, '应生成四个平台的压缩包');
  assert.match(wf, /SHA256SUMS/, '应产出校验值文件');
  // 压缩包内容必须来自 npm pack，两条路径才不会漂移
  const rel = read('make-release.sh');
  assert.match(rel, /npm pack/, 'make-release.sh 内容应来自 npm pack');
});

test('一行流：没有 assets/ 时自己下载 release 再 exec 真正的安装器', () => {
  // curl … | sh 时 stdin 被脚本占着，必须先下载再拿回终端，见 ADR 0006。
  assert.match(SH, /BOOTSTRAPPED/, 'install.sh 应有一行流引导层（带哨兵变量防止递归）');
  assert.match(SH, /releases\/latest\/download/, '引导层应下载 latest release');
  assert.match(SH, /dev\/tty/, '引导层应把终端接回来，否则提问读不到输入');
  assert.match(SH, /--non-interactive/, '没有终端时应退成全自动，不能挂住');

  assert.match(PS1, /BOOTSTRAPPED/, 'install.ps1 应有一行流引导层');
  assert.match(PS1, /releases\/latest\/download/, 'install.ps1 引导层应下载 latest release');
  assert.match(PS1, /Expand-Archive/, 'install.ps1 引导层应解压后执行');
});

test('release 同时产出固定文件名，一行流的 URL 才能长期有效', () => {
  const rel = read('make-release.sh');
  // .../releases/latest/download/qodbuddy2pi-<平台>.tar.gz 这种 URL 要求文件名不带版本号
  assert.match(rel, /qodbuddy2pi-\$target/, 'make-release.sh 应另存一份不带版本号的副本');
  // CI 里要确认这些固定名真的在，否则一行流 404
  const wf = read('.github/workflows/release.yml');
  assert.match(wf, /qodbuddy2pi-darwin-arm64\.tar\.gz|稳定文件名/, 'workflow 应校验固定文件名存在');
});

test('README 首页给出一行安装命令（不必先克隆仓库）', () => {
  const readme = read('README.md');
  assert.match(readme, /curl -fsSL \S+install\.sh \| sh/, 'README 应有 curl|sh 一行安装');
  assert.match(readme, /irm \S+install\.ps1 \| iex/, 'README 应有 irm|iex 一行安装');
  assert.match(readme, /npm i -g/, 'README 应有 npm 安装');
});
