<div align="center">

# QodBuddy2Pi

</div>

<p align="center">      
    <em>把 Qoder 与 WorkBuddy 的订阅额度接进 pi coding agent。</em>      
</p>

<p align="center">      
    <a href="https://github.com/CraigKettleman/qoder2pi/releases"><img src="https://img.shields.io/github/v/release/CraigKettleman/qoder2pi?style=flat-square\\\\\\\&label=release\\\\\\\&color=22c55e" alt="Latest release" /></a>      
    <a href="https://www.npmjs.com/package/qodbuddy2pi"><img src="https://img.shields.io/npm/v/qodbuddy2pi?style=flat-square\\\\\\\&label=npm" alt="npm" /></a>      
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License" /></a>      
</p>

## 这是什么

一条命令把 Qoder 与 WorkBuddy 接成 pi 的 provider。装完之后 `qodbuddy2pi` 是一个总控界面，  
三个 provider 用页签切，服务状态、账号、登录态、日志都在里面。

四个 provider 可以只装其中一个，互相不干扰：

|               | provider           | 端点               | 凭证                                 | 怎么登录  |
| ------------- | ------------------ | ---------------- | ---------------------------------- | ----- |
| Qoder 国内版     | `qoder-cn`         | 直连 Qoder 网关      | pi 的 `auth.json`                   | PAT   |
| Qoder 国际版     | `qoder`            | 直连 Qoder 网关      | pi 的 `auth.json`                   | PAT   |
| WorkBuddy 国内版 | `workbuddy`        | `127.0.0.1:8787` | `~/.codebuddy-session.json`        | 浏览器登录 |
| WorkBuddy 国际版 | `workbuddy-global` | `127.0.0.1:8788` | `~/.codebuddy-global-session.json` | 浏览器登录 |

Qoder 与 WorkBuddy 的形态并不对称。Qoder 没有本机服务：一切都由 pi 扩展  
`pi-provider-qoder` 负责，凭证直接落进 pi，所以它管的是两个区域各自的登录状态。  
WorkBuddy 则在本机起一个反代（Python 写的 `codebuddy_proxy`，由 uv 拉起），把 pi 的请求  
转成 WorkBuddy 额度，因此有端口、常驻服务、多账号这些东西。

## 安装

一条命令，不用克隆仓库。

**macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/CraigKettleman/qoder2pi/main/install.sh | sh
```

**Windows**

```powershell
irm https://raw.githubusercontent.com/CraigKettleman/qoder2pi/main/install.ps1 | iex
```


**npm / pnpm / bun**

```bash
npm i -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
pnpm add -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
bun add -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
# 或 npx --yes qodbuddy2pi install
```

`--ignore-scripts` 是刻意的：包本身不该在安装时改动你的 pi 配置。接入是显式的
`qodbuddy2pi install`，你在眼前看到它要装什么。

**下载压缩包**

到 [Releases](https://github.com/CraigKettleman/qoder2pi/releases) 下载对应平台的包
（`qodbuddy2pi-<平台>.tar.gz` / `.zip`），解开后跑 `./start.sh`（Windows 是 `start.cmd`）。

**从源码**

```bash
git clone https://github.com/CraigKettleman/qoder2pi && cd qoder2pi
./install.sh                     # macOS / Linux
powershell -ExecutionPolicy Bypass -File install.ps1   # Windows
```

这些入口背后是同一份安装器。前两条一行流是引导器：它把对应平台的压缩包下到临时目录，
把终端交给自己，再跑里面那份 `install.sh` / `install.ps1`——和 pi 自己的官方安装器同一
套做法（`curl … | sh` 时 stdin 被脚本占着，提问必须发生在真正的安装器里，见
[docs/adr/0006](docs/adr/0006-one-liner-downloads-then-execs.md)）。

不带参数时会先探测本机现状（已登录哪个区域、哪个反代在跑），把结果列出来逐项确认，
回车采纳默认值。参数所有入口通用：

## 日常使用

```bash
qodbuddy2pi              # 总控界面：1/2/3 或 Tab 切 provider
qodbuddy2pi --check      # 只看环境检查（纯文本，适合脚本）
qodbuddy2pi install      # 接入 / 重装 provider（跑包内自带的安装器）
```

别名打开的是同一个总控，只是焦点预落在对应页：

```bash
qodbuddy                 # 总控（第一页）
qoder2pi                 # Qoder 页
workbuddy2pi             # WorkBuddy 国内版页
```

界面按键：`↑↓`/`jk` 移动，`Enter` 执行，`r` 刷新，`q`/`Esc` 退出；`←→`/`Tab` 或数字键切页。  
日志与自检结果进独立的可滚动页面。

在 pi 里用 `/model` 选择模型，或者直接指定：

```bash
pi --provider qoder-cn        --model qwen3-coder-plus
pi --provider qoder           --model <模型ID>
pi --provider workbuddy       --model deepseek-v4.1-flash
pi --provider workbuddy-global --model <模型ID>
```

`qoder2pi` 与 `workbuddy2pi` 还各自带子命令，纯文本输出，适合脚本：

```bash
qoder2pi status                 # pi、扩展与两个区域的登录状态
qoder2pi login cn pt-xxxxxx     # 用 PAT 登录国内版
workbuddy2pi status             # 服务、端点、凭证、账号
workbuddy2pi account b          # 切到账号 b
workbuddy2pi logs 100           # 反代日志尾部
workbuddy2pi doctor             # 自检
```

## 文档

|                               |                           |
| ----------------------------- | ------------------------- |
| [安装与接入](docs/install.md)      | 完整的安装流程、两个平台各自的步骤、登录凭证怎么拿 |
| [运维命令](docs/operations.md)    | 所有命令、界面按键、两个区域的分工、常驻服务    |
| [账号与凭证](docs/accounts.md)     | 多账号机制、凭证有效期怎么读、国际版能用哪些模型  |
| [排错](docs/troubleshooting.md) | 常见问题与四个已规避的坑              |
| [CONTEXT.md](CONTEXT.md)      | 本项目的术语表                   |
| [docs/adr/](docs/adr/)        | 设计决策记录                    |

<details>

<summary><strong>原理</strong>      
   </summary>

```
pi（provider workbuddy，        baseUrl = http://127.0.0.1:8787/v1）
pi（provider workbuddy-global， baseUrl = http://127.0.0.1:8788/v1）
  ↓
两个独立的 codebuddy_proxy 实例（PyPI 包 workbuddy2api 提供）
  ↓  协议转换 + token 自动刷新
copilot.tencent.com（国内版） / www.workbuddy.ai（国际版）
```

Qoder 没有这一层：扩展直接跟 Qoder 网关通信。

两个 WorkBuddy 区域必须分开：反代的上游端点与模型表都由启动参数决定，两边的 session  
文件也被反代按 backend 隔离，互相不通用。

</details>

<details>

<summary><strong>依赖都固定在本仓库</strong>      
   </summary>

两个 provider 的实现本体都在仓库里，安装脚本不会从别的仓库拉取：

| 依赖                                   | 来源               | 是否在本仓库                                |
| ------------------------------------ | ---------------- | ------------------------------------- |
| `workbuddy2api` 2.0.6（反代实现）          | PyPI             | ✅ `assets/vendor/workbuddy2api-*.whl` |
| `pi-provider-qoder` 0.4.6（qoder 扩展）  | npm              | ✅ `assets/vendor/pi-provider-qoder/`  |
| `workbuddy.ts`（pi provider 扩展）       | —                | ✅ `assets/workbuddy.ts`               |
| Node.js                              | 官方安装器按需安装        | ❌ 二进制运行时                              |
| pi 本体                                | npm registry     | ❌ 宿主程序                                |
| uv                                   | astral.sh 官方安装脚本 | ❌ 二进制（45MB）                           |
| Python 传递依赖（fastapi、uvicorn、httpx 等） | PyPI             | ❌ 通用基础库，由 uv 解析                       |

版本、官方校验值、许可与更新方法见 [assets/vendor/README.md](assets/vendor/README.md)。  
pi 与 Node 是宿主程序与二进制运行时，物理上放不进仓库；Python 传递依赖是通用基础库，  
不随上游项目变动。

</details>

## 开发

```bash
./dev.sh          # 开发模式入口：直接用仓库里的代码跑总控，不安装
npm test          # 纯函数测试（node:test，零依赖）
```

`./dev.sh` 改完 `assets/tui.js` 就能立刻看到效果。测试只覆盖纯函数与两份安装脚本的  
一致性，渲染行为由 `python3 test/pty-render.py` 在真实 PTY 里验证。

改动前建议先读 [CONTEXT.md](CONTEXT.md)（术语表）与 [docs/adr/](docs/adr/)（设计决策），  
它们说明了为什么代码是这个形状。

## 许可

MIT，见 [LICENSE](LICENSE)。仓库里两份第三方制品各遵自己的许可，见该文件末尾。
