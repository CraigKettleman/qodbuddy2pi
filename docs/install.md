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

**macOS / Linux**：

```bash
./install.sh
```

**Windows**：

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

不带参数时会先探测本机现状（已登录哪个区域、哪个反代在跑），把结果列出来逐项确认，
回车采纳默认值。

也可以用参数跳过提问：

```bash
./install.sh --all                 # 全装四个 provider
./install.sh --only qoder-cn       # 只装指定的（可逗号分隔，也可重复 --only）
./install.sh --no-service          # 只装接入，不注册常驻服务
./install.sh --force-reinstall     # 即使已接入也重装一遍
./install.sh --non-interactive     # 不提问，按探测结果装
./install.sh --help
```

Windows 上对应的参数是 `-All`、`-Only`、`-NoService`、`-ForceReinstall`、
`-NonInteractive`。

### 一行安装

除了仓库里的脚本，还有三种等价入口，它们都只是「拿到仓库 + 调用同一个安装器」，
不重写安装逻辑：

```bash
# npm（命令装好后仍需跑安装器来部署服务与登录）
npm i -g qodbuddy2pi && qodbuddy2pi probe

# GitHub Release：解开后跑 ./start.sh（Windows 用 start.cmd）
tar -xzf qodbuddy2pi-<版本>-<平台>.tar.gz && cd qodbuddy2pi-<版本>-<平台> && ./start.sh
```

`start.sh` 调的就是 `install.sh`。之所以要这样分两层，是因为 `curl … | sh` 时 stdin
被脚本本身占用，任何提问都会立刻读到 EOF；所以真正需要提问的安装器必须拿到干净终端
才能跑起来。见 [docs/adr/0006](adr/0006-one-liner-downloads-then-execs.md)。

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
