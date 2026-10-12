#!/usr/bin/env node
/**
 * wizard.js — 统一接入向导。
 *
 * 仓库里有四份各自的安装脚本（Qoder 两份、WorkBuddy 两份），参数还不一样
 * （Qoder 国际版要 QODER_REGION=global，WorkBuddy 国际版要 --global），
 * 记不住。这个向导把它们收进一个菜单，用户只管选。
 *
 * 安装逻辑**不在这里重写**：向导只负责选参数、收集 PAT、然后把终端交给
 * 仓库里那四份脚本执行。这样安装流程仍然只有一份实现，不会和脚本漂移。
 *
 * 因此它必须从仓库里运行（qodbuddy 包装脚本就是为此存在），不装到 ~/.local/bin。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');
const { createTui, C, G, findCmd } = require('./tui');

const REPO = path.join(__dirname, '..');
const IS_WIN = process.platform === 'win32';

const HOME = os.homedir();
const AUTH_JSON = path.join(HOME, '.pi', 'agent', 'auth.json');

/** 四个接入目标，各自对应仓库里的一份安装脚本。 */
const TARGETS = {
  'qoder-cn': {
    title: 'Qoder 国内版',
    script: path.join(REPO, 'qoder2pi', 'install-pi-qoder.sh'),
    ps1: path.join(REPO, 'qoder2pi', 'install-pi-qoder.ps1'),
    provider: 'qoder-cn',
    needsPat: 'https://qoder.com.cn/account/integrations',
    // 已接入的判据：pi 的 auth.json 里有这个 provider 的凭据
    installed: () => !!(readJson(AUTH_JSON) || {})['qoder-cn'],
  },
  'qoder-global': {
    title: 'Qoder 国际版',
    script: path.join(REPO, 'qoder2pi', 'install-pi-qoder.sh'),
    ps1: path.join(REPO, 'qoder2pi', 'install-pi-qoder.ps1'),
    region: 'global',
    provider: 'qoder',
    needsPat: 'https://qoder.com/account/integrations',
    installed: () => !!(readJson(AUTH_JSON) || {})['qoder'],
  },
  'wb-cn': {
    title: 'WorkBuddy 国内版',
    script: path.join(REPO, 'workbuddy2pi', 'install-workbuddy2pi.sh'),
    ps1: path.join(REPO, 'workbuddy2pi', 'install-workbuddy2pi.ps1'),
    provider: 'workbuddy',
    // WorkBuddy 的判据是生效凭证文件；由它自己启动浏览器登录，不需要 PAT
    installed: () => fs.existsSync(path.join(HOME, '.codebuddy-session.json')),
  },
  'wb-global': {
    title: 'WorkBuddy 国际版',
    script: path.join(REPO, 'workbuddy2pi', 'install-workbuddy2pi.sh'),
    ps1: path.join(REPO, 'workbuddy2pi', 'install-workbuddy2pi.ps1'),
    args: ['--global'],
    provider: 'workbuddy-global',
    installed: () => fs.existsSync(path.join(HOME, '.codebuddy-global-session.json')),
  },
};

const ok = (m) => console.log(`\x1b[1;32m✓\x1b[0m ${m}`);
const info = (m) => console.log(`\x1b[1;36m==>\x1b[0m ${m}`);
const warn = (m) => console.log(`\x1b[1;33m!\x1b[0m ${m}`);
const fail = (m) => {
  console.error(`\x1b[1;31m错误:\x1b[0m ${m}`);
  process.exit(1);
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: opts.timeout || 120000, ...opts });
  return { status: r.status === null ? -1 : r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

// Windows 原生没有 sh，用 findCmd 直接查 PATH 才准
function has(cmd) {
  return !!findCmd(cmd);
}

/**
 * 把某个目标交给对应的安装脚本执行。
 * 退出码非零时把最后几行输出抛出去，界面会把它显示成错误提示。
 */
function runInstaller(key, pat) {
  const t = TARGETS[key];
  const env = { ...process.env };
  if (t.region) env.QODER_REGION = t.region;

  let cmd;
  let args;
  if (IS_WIN) {
    cmd = 'powershell';
    args = ['-ExecutionPolicy', 'Bypass', '-File', t.ps1];
    if (t.region) args.push('-Region', t.region);
    if (pat) args.push(pat);
  } else {
    cmd = 'bash';
    args = [t.script, ...(t.args || [])];
    if (pat) args.push(pat);
  }

  const r = spawnSync(cmd, args, { stdio: 'inherit', env });
  if (r.status !== 0) throw new Error(`${t.title} 的安装脚本以退出码 ${r.status} 结束`);
}

function promptLine(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** 跑仓库里的运维命令，拿到纯文本输出（用于「查看状态」与「自检」）。 */
function runOps(op, args = []) {
  const ops = path.join(REPO, 'assets', op);
  const r = spawnSync(process.execPath, [ops, ...args], { encoding: 'utf8', timeout: 300000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`.replace(/\x1b\[[0-9;]*m/g, '').trim();
  return { ok: r.status === 0, out };
}

async function tuiMain() {
  await createTui({
    title: '接入向导',
    subtitle: `把 Qoder 与 WorkBuddy 的订阅接进 pi coding agent　·　仓库 ${REPO}`,

    async refresh() {
      const rows = Object.entries(TARGETS).map(([key, t]) => {
        const done = t.installed();
        return {
          key,
          label: t.title,
          note: done ? `已接入（${t.provider}）` : '未接入',
          active: done,
        };
      });
      const scriptsReady = Object.values(TARGETS).every((t) => fs.existsSync(t.script));

      return {
        status: [
          ['Node', `${C.green}${G.ok}${C.reset} ${process.version}`],
          ['pi', has('pi') ? `${C.green}${G.ok}${C.reset} 已安装` : `${C.red}${G.bad}${C.reset} 未找到`],
          ['脚本', scriptsReady
            ? `${C.green}${G.ok}${C.reset} 四份安装脚本都在`
            : `${C.red}${G.bad}${C.reset} 有脚本缺失，请在完整仓库里运行`],
        ],
        sections: [{ id: 'targets', title: '接入情况', rows }],
        menu: [
          { id: 'qoder-cn', group: 'Qoder', label: '安装国内版', note: '需要 PAT，从 qoder.com.cn 获取' },
          { id: 'qoder-global', group: 'Qoder', label: '安装国际版', note: '需要 PAT，从 qoder.com 获取' },
          { id: 'wb-cn', group: 'WorkBuddy', label: '安装国内版', note: '端口 8787，provider workbuddy' },
          { id: 'wb-global', group: 'WorkBuddy', label: '安装国际版', note: '端口 8788，会引导浏览器登录' },
          { id: 'status', group: '诊断', label: '查看接入状态', note: '两个 provider 各自的账号与模型' },
          { id: 'doctor', group: '诊断', label: '自检', note: '分别跑两个 provider 的 doctor' },
          { id: 'quit', group: '其它', label: '退出', note: '' },
        ],
      };
    },

    async onAction(id) {
      if (id === 'quit') return { quit: true };

      if (id === 'status' || id === 'doctor') {
        const ops = id === 'status' ? ['workbuddy2pi', 'qoder2pi'] : ['workbuddy2pi', 'qoder2pi'];
        const args = id === 'status' ? ['status'] : ['doctor'];
        const parts = [];
        let allOk = true;
        for (const op of ops) {
          const r = runOps(op, args);
          allOk = allOk && r.ok;
          parts.push(`── ${op} ${args[0]} ──`, r.out, '');
        }
        return {
          title: id === 'status' ? '接入状态' : '自检结果',
          body: parts.join('\n').trimEnd(),
          error: id === 'doctor' && !allOk,
        };
      }

      const target = TARGETS[id];
      if (!target) return { flash: `未知操作：${id}`, error: true };
      if (!fs.existsSync(IS_WIN ? target.ps1 : target.script)) {
        return { flash: `安装脚本不在：${IS_WIN ? target.ps1 : target.script}`, error: true };
      }

      // 安装会持续输出进度、还可能开浏览器，必须把终端交出去
      return {
        suspend: async () => {
          let pat = '';
          if (target.needsPat) {
            console.log(`\n${target.title} 需要 PAT（以 pt- 开头）。`);
            console.log(`获取地址：${target.needsPat}\n`);
            pat = await promptLine('粘贴 PAT（直接回车则跳过，脚本会打印手动步骤）：');
          }
          runInstaller(id, pat);
        },
        after: `${target.title} 处理完毕`,
      };
    },
  });
}

function usage() {
  console.log(`qodbuddy — 接入向导

用法：
  ./qodbuddy            进入交互界面（在本仓库根目录下运行）

它把仓库里的四份安装脚本收进一个菜单：
  Qoder 国内版 / 国际版、WorkBuddy 国内版 / 国际版

安装逻辑仍然在那四份脚本里，向导只负责选参数、收集 PAT，再把终端交给它们执行。
所以要改安装行为，改脚本；向导和脚本不会各有一套实现。

各 provider 的日常运维各有专门的命令：
  workbuddy2pi / workbuddy2pi-global     WorkBuddy 的服务、账号与日志
  qoder2pi                               Qoder 的登录状态与扩展
它们不带参数时也是交互界面。`);
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = (argv[0] || '').toLowerCase();

  if (cmd === '-h' || cmd === '--help' || cmd === 'help') return usage();
  if (cmd === 'tui' || (!argv.length && process.stdout.isTTY && process.stdin.isTTY)) return tuiMain();
  if (!argv.length) fail('需要在终端里运行；用法见 qodbuddy --help');

  usage();
  fail(`未知子命令：${cmd}`);
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
