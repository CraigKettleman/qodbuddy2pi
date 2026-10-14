# 安装与接入

把 Qoder 与 WorkBuddy 接入 pi coding agent。一件事、一份脚本、一条命令。

## 前置

**Node.js 22.19+** 与 **pi**。这两样都不用自己装：安装脚本会调用 pi 的官方安装方式
（macOS / Linux 上是 `curl -fsSL https://pi.dev/install.sh | sh`），官方安装器在缺 Node
或版本不足时会自行安装 Node，Windows 上还会在没有 `bash.exe` 时引导安装 Git Bash
（pi 在原生 Windows 上要靠它执行 bash 命令）。

**uv** 只有 WorkBuddy 需要（它的反代是 Python 写的，用 uv 拉起）。没装的话安装脚本会装。
Qoder 不需要 uv。

## 安装

一条命令，不用克隆仓库。五种入口，装完之后完全一样。

**macOS / Linux（一行流）**：

```bash
curl -fsSL https://raw.githubusercontent.com/CraigKettleman/qoder2pi/main/install.sh | sh
```

**Windows（一行流）**：

```powershell
irm https://raw.githubusercontent.com/CraigKettleman/qoder2pi/main/install.ps1 | iex
```

**npm / pnpm / bun**：

```bash
npm i -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
pnpm add -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
bun add -g --ignore-scripts qodbuddy2pi && qodbuddy2pi install
```

**npx（不装到全局）**：

```bash
npx --yes qodbuddy2pi install
```

**下载压缩包**：到 Releases 页下载 `qodbuddy2pi-<平台>.tar.gz`（Windows 是 `.zip`），
解开后：

```bash
./start.sh                         # macOS / Linux
start.cmd                          # Windows
```

同一个 Release 里带 `SHA256SUMS`，想核对的话：

```bash
shasum -a 256 -c SHA256SUMS        # macOS / Linux（Windows 用 Get-FileHash）
```

**从源码**：

```bash
git clone https://github.com/CraigKettleman/qoder2pi && cd qoder2pi
./install.sh                       # macOS / Linux
powershell -ExecutionPolicy Bypass -File install.ps1   # Windows
```

三条路最后都是同一份安装器：`qodbuddy2pi install`、`start.sh`、以及一行流里的引导器，
都是去调包内的 `install.sh` / `install.ps1`。不只是「都差不多」——它们真的是同一个
文件，所以不存在某一条路径漏了步骤的问题。

不带参数时会先探测本机现状（已登录哪个区域、哪个反代在跑），把结果列出来逐项确认，
回车采纳默认值。参数所有入口通用：

```bash
--all                 # 全装四个 provider
--only qoder-cn       # 只装指定的（可逗号分隔，也可重复 --only）
--no-service          # 只装接入，不注册常驻服务
--force-reinstall     # 即使已接入也重装一遍
--non-interactive     # 不提问，按探测结果装
--help
```

Windows 上对应的参数是 `-All`、`-Only`、`-NoService`、`-ForceReinstall`、
`-NonInteractive`；`-File install.ps1` 换成 `qodbuddy2pi install` 即可。

### 一行流的引导层

`curl … | sh` 这条路有个固有限制：`sh` 从管道读脚本，stdin 被脚本本身占着，任何提问
都会立刻读到 EOF。所以 `install.sh` 开头会先判断「自己身边有没有 `assets/`」：

- 有（仓库内运行、release 包里的 `start.sh`）→ 直接当安装器跑；
- 没有（从管道跑）→ 下载对应平台的 release 压缩包到临时目录，把终端接回来
  （`< /dev/tty`），再 `exec` 里面那份安装器。

于是提问发生在真正的安装器里，拿到的是干净终端。没有可用终端时（CI、容器）自动退成
`--non-interactive`，不会挂住。Windows 的 `irm | iex` 终端本来就在（不需要抢回），
但 `iex` 下 `$MyInvocation.MyCommand.Path` 是空的，所以同样先下载解压再 `-File` 执行。

引导层下载的是固定文件名（`qodbuddy2pi-<平台>.tar.gz`），所以 URL 能写成
`releases/latest/download/...` 并在每次发版后自动指向最新版。带版本号的那份也一并
发布，供需要锁定版本的场景使用。

### 为什么 npm 要分两步

`npm i -g` 只放命令，接入是 `qodbuddy2pi install`，这是刻意的：npm 的 `postinstall`
在 CI、离线环境、以及设了 `--ignore-scripts` 的机器上都会静默失败，而安装器需要提问
（装哪些 provider、要不要写 PATH），非交互环境里只能默默按默认值走。分成两步之后，
装包永远不会失败，接入则在你眼前跑。

同理，release 包里 `start.sh` 也不直接开界面，而是调安装器——解压后第一次用应该是
「装好」，而不是进一个什么都还没接入的界面。见
[docs/adr/0006](adr/0006-one-liner-downloads-then-execs.md)。

## 发布是怎么产生的

打 `v*` tag 会触发 `.github/workflows/release.yml`：先跑测试，再发 npm 包，最后用
`make-release.sh --all` 生成四个平台的压缩包并附到 GitHub Release，同时产出
`SHA256SUMS`。

压缩包的内容来自 `npm pack`，与 npm 上发布的包是同一份文件集合——不存在「npm 上是
新的、Release 上是旧的」这种漂移。版本号以 tag 为准，发布时用
`npm version "${GITHUB_REF_NAME#v}"` 校准，不用手工同步 `package.json`。

没有配置 `NPM_TOKEN` secret 时 npm 那步会跳过并打印说明，Release 照常生成。

本地想自己打一份：

```bash
./make-release.sh            # 当前平台
./make-release.sh --all      # 四个平台
```

产物在 `release/`（已 gitignore），末尾会打印 SHA256。

## 安装器会做什么

依次：

1. **探测**本机已接入哪些 provider（调 `qodbuddy2pi probe`）；
2. **检查 pi**，缺了就用官方安装方式装；
3. **检查 uv**（只有选了 WorkBuddy 才做）；
4. **部署运维命令**到 `~/.local/bin`：`qodbuddy2pi` 与别名
   `qodbuddy` / `qoder2pi` / `workbuddy2pi`，以及共享模块 `tui.js`；
5. **把 `~/.local/bin` 加入 PATH**（按登录 shell 选文件，写入前会问）；
6. 按选择逐个**接入 provider**；
7. **自检**。

两个平台各自只有一份脚本，逻辑一一对应，差异只在平台本身：

| | `install.sh` | `install.ps1` |
|---|---|---|
| 装 pi | `curl … pi.dev/install.sh \| sh` | `irm … pi.dev/install.ps1 \| iex` |
| 命令目录 | `~/.local/bin` | `%USERPROFILE%\.local\bin` |
| 写 PATH | 登录 shell 的 rc 文件 | HKCU 的 User PATH（不需要管理员权限） |
| 常驻服务 | launchd / systemd --user | 登录触发的计划任务 |
| 装 uv | `curl … astral.sh/uv/install.sh \| sh` | `irm … astral.sh/uv/install.ps1 \| iex` |

**脚本是幂等的**，可以反复运行：已有凭证不会被动，只有与仓库版本不一致的文件会被备份
后再替换。

## Qoder 的接入

Qoder 没有本机服务：一切都由 pi 扩展 `pi-provider-qoder` 负责，凭证直接落在 pi 自己的
`~/.pi/agent/auth.json`。所以它管的是两个区域各自的登录状态。

安装器会：

1. 装 `pi-provider-qoder` 扩展（来自本仓库 `assets/vendor/pi-provider-qoder`，
   不从 npm 拉，因此不受上游发版或下架影响）；
2. 把仓库路径写进 `~/.qoder2pi/config.json`——运维命令装到 `~/.local/bin` 后就不知道
   仓库在哪了，「更新扩展」要用这个路径；
3. 登录。已有凭据就跳过；否则问你要 PAT，或者告诉你怎么手动登录。

PAT 从这里获取：

- 国内版 https://qoder.com.cn/account/integrations
- 国际版 https://qoder.com/account/integrations

创建后得到一个 `pt-` 开头的令牌。把 PAT 交给安装器的话，它会在启动 pi 时通过环境变量
（国内版 `QODERCN_API_KEY`、国际版 `QODER_API_KEY`）让扩展自动兑换 token 并写进
`auth.json`。

### 登录没生效

运行 `pi`，输入 `/login qoder-cn`（国内版）或 `/login qoder`（国际版）完成登录，
再运行 `qodbuddy2pi --check` 确认。

版本说明：`pi-provider-qoder` 0.4.6 修复了与 pi ≥ 0.86 的上下文兼容问题——旧版读不到
> 折叠进首条 system 消息的系统提示词与工具声明，导致请求丢失上下文、模型表现为
> 「没有工具/不能联网」。本仓库的副本不低于该版本。

## WorkBuddy 的接入

WorkBuddy 是本机反代 + 多账号的形态：用 uv 拉起 PyPI 包 `workbuddy2api` 提供的
`codebuddy_proxy`，在本机端口暴露一个与 OpenAI／Anthropic／Responses 兼容的端点，
pi 的请求经它转成 WorkBuddy 额度。

安装器会：

1. 装 pi 扩展 `assets/workbuddy.ts` 到 `~/.pi/agent/extensions/`；
2. 在 `auth.json` 里补齐 `workbuddy` 与 `workbuddy-global` 两个占位 key（本地反代不校验
   key，但 pi 会丢弃没有认证方式的 provider，缺了就一个模型也不出现）；
3. 部署反代实现：把 `assets/vendor/workbuddy2api-*.whl` 拷到 `~/.workbuddy2api/vendor/`；
4. 准备登录凭证；
5. 注册常驻服务（launchd / systemd --user / 计划任务）。

**凭证按以下顺序获取**：

1. 该区域的 session 文件已存在且有效 → 跳过；
2. 没有 → 走浏览器登录，最多等 5 分钟（补算 `expiresAt`）。

两个区域都是这一条路径：桌面端落盘的凭证不通用（国际版是加密对象，导入出来每个请求都
401）。原因见 [排错](troubleshooting.md)。

两个区域必须分开：反代的上游端点与模型表都由启动参数决定，且两边的 session 文件被反代
按 backend 隔离，互相不通用。

## 装完之后

```bash
qodbuddy2pi              # 总控界面
qodbuddy2pi --check      # 只看环境检查（纯文本，适合脚本）
```

在 pi 里用 `/model` 选择模型，或者直接指定：

```bash
pi --provider qoder-cn --model <模型ID>
pi --provider qoder    --model <模型ID>
pi --provider workbuddy        --model <模型ID>
pi --provider workbuddy-global --model <模型ID>
```

日常运维见 [运维命令](operations.md)。
