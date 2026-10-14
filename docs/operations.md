# 运维命令

装完之后日常用的就是这些命令。它们只读状态、触发运维动作，不改动本机。

## 命令一览

| 命令 | 打开的是 |
|---|---|
| `qodbuddy2pi` | 总控界面，第一页 |
| `qodbuddy` | 同上（别名） |
| `qoder2pi` | 总控界面，焦点在 Qoder 页 |
| `workbuddy2pi` | 总控界面，焦点在 WorkBuddy 国内版页 |

带参数时别名把参数原样转给 `qodbuddy2pi`，所以 `qodbuddy --check`、`qodbuddy probe`
都能用。`qoder2pi` 与 `workbuddy2pi` 还各自带子命令，见下。

```bash
qodbuddy2pi             # 总控界面（1/2/3 或 Tab 切 provider）
qodbuddy2pi --check     # 环境检查（纯文本，适合脚本）
qodbuddy2pi probe       # 以 JSON 报出已接入哪些 provider
qodbuddy2pi --help
```

总控界面只在真终端里启用；管道或重定向时会退回纯文本，方便脚本调用。

## 总控界面

一页装一个 provider，用数字键或 Tab 切换：

```
 1 Qoder · 2 WorkBuddy 国内版 · 3 WorkBuddy 国际版
```

界面顶部是三栏 banner（左版本号、中间大字标题、右 Welcome + Commands 说明），
下面依次是居中的页签行、当前页名字、各分区块与操作菜单，底部状态栏压在框的底边上。

整个界面由一个圆角大框包住，内部用竖线左右分栏：左栏状态与各分区，右栏操作菜单。
区块标题用方括号写法（`[状态]`、`[区域]`、`[操作]`），与 pi 自己的
`[Context]` / `[Skills]` / `[Extensions]` 一致。终端窄于 76 列时退成上下单栏。

配色与字形对齐 pi 的主题（见 `assets/tui.js` 里的主题段），按终端能力降级：
真彩色 → 256 色 → 16 色 → 无色；深色/浅色底按 `COLORFGBG` 选主题。

按键：`↑↓`/`jk` 移动，`Enter` 执行，`r` 刷新，`q`/`Esc` 退出；`←→`/`Tab` 或数字键切页；
滚轮可移动选中项或在文本页滚动。选择页用 `↑↓` 与 `Enter`，`Esc` 返回；
日志与自检结果进独立的可滚动文本页。

界面会接管鼠标事件（开启 SGR 鼠标追踪）。这是必要的：备用屏只换了画布，
终端的滚动缓冲还在，不接管的话滚轮会把整个界面滚出去。

状态只在按 `r` 时刷新，不做定时刷新——刷新要跑子进程，而界面在你读内容时跳动并不好受。

三个 provider 的形态并不对称，界面里看到的也就不一样：WorkBuddy 是「本机反代服务 +
多账号」，所以有切换/增删账号、重启服务这些操作；Qoder 没有服务、凭证直接存在 pi 的
`auth.json`，所以它管的是两个区域各自的登录状态。

## Qoder 的子命令

Qoder 没有本机服务，凭证直接存在 pi 的 `~/.pi/agent/auth.json`，没有端口、服务、
账号切换这类操作。两个区域（国内版 `qoder-cn`、国际版 `qoder`）是并存的，不需要二选一。

```bash
qoder2pi                        # 总控界面，焦点在 Qoder 页
qoder2pi status                 # 纯文本：pi、扩展与两个区域的登录状态
qoder2pi login cn pt-xxxxxx     # 用 PAT 登录国内版
qoder2pi login global           # 不给 PAT 时打印手动步骤与获取地址
qoder2pi logout cn              # 退出登录（auth.json 会先备份）
qoder2pi install-extension      # 从本仓库副本重装扩展
qoder2pi models                 # 列出两个区域在 pi 里可见的模型
qoder2pi doctor                 # 自检
```

## WorkBuddy 的子命令

```bash
workbuddy2pi                    # 总控界面，焦点在 WorkBuddy 国内版页
workbuddy2pi status             # 服务、端点、凭证、账号一览（纯文本）
workbuddy2pi account            # 列出账号
workbuddy2pi account b          # 切到账号 b（重启服务，约 1–3 秒）
workbuddy2pi account add        # 添加账号（浏览器登录建档）
workbuddy2pi account remove b   # 删除账号 b
workbuddy2pi account renew      # 续期当前账号的凭证
workbuddy2pi account renew b    # 续期指定账号
workbuddy2pi login              # 浏览器登录建档（与 account add 同一条路径）
workbuddy2pi restart            # 重启服务
workbuddy2pi logs 100           # 查看反代日志尾部
workbuddy2pi models             # 列出模型：pi 可见的 + 本机反代在服务的
workbuddy2pi doctor             # 依赖与接入自检
workbuddy2pi install-service    # 注册常驻服务
workbuddy2pi uninstall-service  # 移除常驻服务
workbuddy2pi global <命令>       # 上面这些作用于国际版实例
```

## 两个区域

WorkBuddy 的国际版是一个完全独立的实例：端口、凭证、账号、日志都各用各的。

| | 国内版 | 国际版 |
|---|---|---|
| 在总控里 | 第 2 页 | 第 3 页 |
| pi provider | `workbuddy` | `workbuddy-global` |
| 端点 | `http://127.0.0.1:8787/v1` | `http://127.0.0.1:8788/v1` |
| 上游 | `copilot.tencent.com` | `www.workbuddy.ai` |
| 生效凭证 | `~/.codebuddy-session.json` | `~/.codebuddy-global-session.json` |
| 账号 slot | `~/.workbuddy2api/sessions/` | `~/.workbuddy2api/sessions-global/` |
| 日志 | `~/.workbuddy2api/` | `~/.workbuddy2api/global/` |
| 常驻服务 | `workbuddy2api` | `workbuddy2api-global` |
| 账号凭证形态 | 明文 JWT | 加密对象 |
| 添加账号方式 | 浏览器登录 | 浏览器登录 |

两者是同一份实现，不存在两套需要同步的代码。`workbuddy2pi global <命令>` 与原来那个
独立命令等价。

端点必须显式写成 `www.workbuddy.ai`：反代 2.0.6 的国际版默认端点是 `www.codebuddy.ai`，
而账号自身的 domain 与登录接口都在 `workbuddy.ai` 下。

## 常驻服务

反代由常驻服务拉起，开机/登录自动运行，崩溃自动重启：

| 平台 | 位置 |
|---|---|
| macOS | `~/Library/LaunchAgents/com.<用户>.workbuddy2api.plist` |
| Linux | `~/.config/systemd/user/workbuddy2api.service` |
| Windows | 计划任务 `workbuddy2pi` |

国际版对应再加 `-global` 后缀。

## 原理

```
pi（provider workbuddy，        baseUrl = http://127.0.0.1:8787/v1）
pi（provider workbuddy-global， baseUrl = http://127.0.0.1:8788/v1）
  ↓
两个独立的 codebuddy_proxy 实例（PyPI 包 workbuddy2api 提供）
  ↓  协议转换 + token 自动刷新
copilot.tencent.com（国内版） / www.workbuddy.ai（国际版）
```

Qoder 没有这一层：扩展直接跟 Qoder 网关通信。

| 组件 | 位置 | 作用 |
|---|---|---|
| `assets/qodbuddy2pi` | `~/.local/bin/` | 总控界面 |
| `assets/qoder2pi` | `~/.local/bin/` | Qoder 运维命令 + 总控的 Qoder 页 |
| `assets/workbuddy2pi` | `~/.local/bin/` | WorkBuddy 运维命令 + 总控的两个 WorkBuddy 页 |
| `assets/qodbuddy` | `~/.local/bin/` | 别名 |
| `assets/tui.js` | `~/.local/bin/` | 界面本体与共享工具（四个命令共用） |
| `assets/workbuddy.ts` | `~/.pi/agent/extensions/` | 注册 pi 的 `workbuddy` / `workbuddy-global` provider |
| `pi-provider-qoder` | 本仓库 `assets/vendor/` | 注册 pi 的 `qoder-cn` / `qoder` provider |
| `workbuddy2api-*.whl` | `~/.workbuddy2api/vendor/` | 反代实现本体，由常驻服务加载 |

界面本体 `tui.js` 完全用 ANSI 序列手写，没有引入任何依赖——这些命令只用 Node 内建模块、
拷几个文件就能跑，这一点比界面精致更值得保住（见
[ADR 0004](adr/0004-tui-stays-zero-dependency.md)）。

## 多账号

多账号只存在于 WorkBuddy。每个账号是一份独立的 session 文件，放在当前区域的 slot 目录下，
生效的那份是该区域的生效文件。

切换时**先把当前生效文件里最新的凭证存回它所属的 slot**，再写入目标 slot 的内容并重启服务，
所以来回切换不会丢 token。归属判定靠文件里的 `account.uid`，不依赖额外的标记文件——即使
切换过程中被中断也不会串写凭证。

**同一个区域内，反代同一时刻只服务一个账号**（它启动时把 session 读进内存，无法热切换）。
要让多个账号同时在线需要多开实例；本仓库只在国内版与国际版之间做了这种拆分（两个实例、
两个端口、两个 provider）。

两个区域的凭证不能互用：反代按 session 文件里的 `backend` 元数据隔离，拿国内版的文件去起
国际版实例会被直接拒绝。

细节见 [账号与凭证](accounts.md)。
