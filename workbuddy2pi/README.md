# WorkBuddy2Pi 一键接入

把 WorkBuddy 订阅额度接入 Pi Coding Agent：自动准备依赖、建立登录凭证、注册常驻服务，并把它注册成 pi 的 provider。完成后 pi 的请求消耗 WorkBuddy 额度。

支持两个互相独立的区域，可同时在线，互不影响：

| | 国内版 | 国际版 |
|---|---|---|
| pi provider | `workbuddy` | `workbuddy-global` |
| 端点 | `http://127.0.0.1:8787/v1` | `http://127.0.0.1:8788/v1` |
| 上游 | `copilot.tencent.com` | `www.workbuddy.ai` |
| 账号凭证 | 明文 JWT，可从桌面端导入 | 加密对象，只能浏览器登录 |
| 可用模型 | Hunyuan / GLM / Kimi / DeepSeek 等 | 与国际版客户端一致（Grok / GPT / Gemini 等），见下方「国际版能用哪些模型」 |

## 原理

```
pi（provider workbuddy，        baseUrl = http://127.0.0.1:8787/v1）
pi（provider workbuddy-global， baseUrl = http://127.0.0.1:8788/v1）
  ↓
两个独立的 codebuddy_proxy 实例（PyPI 包 workbuddy2api 提供）
  ↓  协议转换 + token 自动刷新
copilot.tencent.com（国内版） / www.workbuddy.ai（国际版）
```

两个区域必须分开：反代的上游端点与模型表都由启动参数决定（国际版要 `--global`），
且两边的 session 文件被反代按 backend 隔离，互相不通用。

反代由 `uv run --with <本仓库的 wheel> python -m codebuddy_proxy` 拉起，不需要预先 `pip install` 任何东西，也不会去 PyPI 取反代实现本身；本仓库只负责把依赖、凭证、服务和 pi 侧接入全部准备好。

| 组件 | 位置 | 作用 |
|---|---|---|
| `install-workbuddy2pi.sh` / `.ps1` | 本目录 | 一键安装 |
| `../assets/workbuddy2pi` | 安装到 `~/.local/bin/`（Windows 为 `~/.local/bin/workbuddy2pi.cmd`） | 日常运维命令 |
| `../assets/workbuddy.ts` | 安装到 `~/.pi/agent/extensions/` | 注册 pi 的 `workbuddy` provider 与模型目录 |
| `../assets/vendor/workbuddy2api-*.whl` | 部署到 `~/.workbuddy2api/vendor/` | 反代实现本体，由常驻服务的 `uv run --with <wheel>` 加载 |
| 常驻服务 | macOS `~/Library/LaunchAgents/com.<用户>.workbuddy2api.plist`<br>Linux `~/.config/systemd/user/workbuddy2api.service`<br>Windows 计划任务 `workbuddy2pi` | 开机/登录自动拉起，崩溃自动重启 |

## 一键安装

**macOS / Linux**（在仓库根目录执行）

```bash
# 只装国内版
./workbuddy2pi/install-workbuddy2pi.sh

# 同时装国际版（会引导浏览器登录）
./workbuddy2pi/install-workbuddy2pi.sh --global

# 只装接入，不注册常驻服务
./workbuddy2pi/install-workbuddy2pi.sh --no-service
```

**Windows**（在仓库根目录执行）

```powershell
powershell -ExecutionPolicy Bypass -File workbuddy2pi\install-workbuddy2pi.ps1

# 同时装国际版
powershell -ExecutionPolicy Bypass -File workbuddy2pi\install-workbuddy2pi.ps1 -Global

# 只装接入，不注册计划任务
.\workbuddy2pi\install-workbuddy2pi.ps1 -NoService
```

## 脚本运行

依次：检查/安装 Node.js 与 Pi → 检查/安装 uv → 安装运维命令 `workbuddy2pi` → 部署本仓库自带的依赖 → 安装 pi 扩展并补齐 `auth.json` 占位 key → 准备登录凭证 → 注册常驻服务并启动 → 自检。带 `--global` 时，在常驻服务之后额外做一遍国际版的登录与注册。

**登录凭证**按以下顺序获取，全都自动判断：

1. `~/.codebuddy-session.json` 已有且未过期 → 直接跳过；
2. 本机能找到 WorkBuddy 桌面端的登录文件 → 转换导入（并补算 `expiresAt`，见下方「已知坑」）；
3. 都没有 → 启动临时实例走浏览器登录，最多等 5 分钟。

国际版不走上面这条路：它的桌面端登录文件里 token 是加密对象，导入出来也没法用，
所以必须先本地登录一次（见下方「国际版」）。

**脚本是幂等的**，可以反复运行：已有凭证、已有账号都不会被覆盖，只有与仓库版本不一致的扩展会先备份再替换。

## 交互界面

不需要写任何子命令：直接运行 `workbuddy2pi`（国内版）或 `workbuddy2pi-global`（国际版）
就直接进全屏界面。第一行标题下面那行小字说明这个界面管的是哪套反代：本机端口、
对应 pi 里的哪个 provider、上游是哪里。中间是服务状态与账号列表，底部是操作菜单，
方向键选择、Enter 执行、r 刷新、q 退出；日志与自检结果进独立页面，可上下滚动。

两个区域既然各有一个界面，就有走错的时候：菜单最下方的「切换到国际版/国内版界面」会直接
把终端交给另一个界面，在那个界面里按 q 退出就回到原来的，可以来回跳。

只有在真终端里才会启用；管道或重定向时会退回纯文本 `status`，所以脚本可以照旧用。
界面本体是 `assets/tui.js`，与 `qoder2pi`、安装向导共用同一套实现；它完全用 ANSI 序列手写，
没有引入任何依赖——这些脚本只用 Node 内建模块、拷几个文件就能跑，这一点比界面精致更值得保住。

> 顺便：不想记 `--global` 这类参数的话，在仓库根目录跑 `./qodbuddy`，它把本仓库四份安装脚本收进一个菜单。

## 国际版

国际版是一个完全独立的实例，也有自己的命令 `workbuddy2pi-global`，
子命令与交互界面跟国内版一一对应，只是端口、凭证、账号与日志都各用各的：

| | 国内版 | 国际版 |
|---|---|---|
| 命令 | `workbuddy2pi` | `workbuddy2pi-global` |
| 启动参数 | 无 | `--global --endpoint https://www.workbuddy.ai` |
| 端口 / provider | 8787 / `workbuddy` | 8788 / `workbuddy-global` |
| 生效凭证 | `~/.codebuddy-session.json` | `~/.codebuddy-global-session.json` |
| 账号 slot | `~/.workbuddy2api/sessions/` | `~/.workbuddy2api/sessions-global/` |
| 日志 | `~/.workbuddy2api/` | `~/.workbuddy2api/global/` |
| 常驻服务 | `workbuddy2api` | `workbuddy2api-global` |

两者是同一份实现，`workbuddy2pi-global` 只是把区域固定下来，因此不存在两套需要同步的代码；
`workbuddy2pi global <命令>` 与 `workbuddy2pi-global <命令>` 等价，前者保留给脚本。

端点必须显式写成 `www.workbuddy.ai`：反代 2.0.6 的国际版默认端点是 `www.codebuddy.ai`，
而账号自身的 domain 与登录接口都在 `workbuddy.ai` 下。

```bash
workbuddy2pi-global                         # 国际版交互界面
workbuddy2pi-global status                  # 服务、端点、账号（纯文本）
workbuddy2pi-global account add             # 添加账号（浏览器登录，可重复执行）
workbuddy2pi-global account a               # 切到账号 a
workbuddy2pi-global account remove a        # 删除账号 a
workbuddy2pi-global install-service         # 注册国际版常驻服务
```

首次接入建议直接用安装脚本：它会做完登录与注册，并给出国际版的自检结果。

```bash
./workbuddy2pi/install-workbuddy2pi.sh --global
```

### 国际版能用哪些模型

**不要用反代自带的国际版模型表。** 它的 `models_config.global.json` 列了
Claude-3.7/4.0、GPT-5、o4-mini、Gemini-2.5，但这些 id 在服务端根本不存在，
请求一律返回 `{"code":11102,"msg":"model [x] service info not found"}`。
这不是账号权限问题——是那张表本身就不对。

真实清单在国际版客户端自己落盘的产品配置里：`~/.workbuddy-ai/cache/acc-product-config-v3.json`
（与国内版 `~/.workbuddy/cache/` 同一机制）。`workbuddy.ts` 直接读它，
客户端里有什么模型，pi 里就有什么，客户端更新模型也不需要改代码。

两个实测结论：

- 27 个对话模型里 26 个可用（含 `grok-4.7`、GPT-5.4/5.5/5.6/6.x、`gemini-3.5-flash`），
  只有 `deep-model` 返回 11102，已放进 `GLOBAL_UNSERVABLE_MODEL_IDS` 排除；
- 多数模型对 `max_tokens` 有下限，太小的值会被上游以 `integer_below_min_value` 拒绝。
  pi 按模型配置发送正常大小，日常使用不受影响；手工 curl 测试时别用 8 这种极小值。

另外工具调用在 GPT 与 Grok 上都实测正常，pi 可以正常使用。

## 日常使用

```bash
workbuddy2pi                         # 交互界面（日常用这个）
workbuddy2pi status                  # 服务、端点、凭证、账号一览（纯文本）
workbuddy2pi account                 # 列出账号
workbuddy2pi account b               # 切到账号 b（重启服务，约 1–3 秒）
workbuddy2pi account add             # 添加账号（国际版走浏览器登录，国内版导入桌面端文件）
workbuddy2pi account remove b        # 删除账号 b
workbuddy2pi account renew           # 续期当前账号的凭证
workbuddy2pi account renew b         # 续期指定账号
workbuddy2pi login                   # 浏览器登录（国内版一般用不着）
workbuddy2pi restart                 # 重启服务
workbuddy2pi logs 100                # 查看反代日志尾部
workbuddy2pi doctor                  # 依赖与接入自检
workbuddy2pi uninstall-service       # 移除常驻服务
```

国际版把命令换成 `workbuddy2pi-global`，参数完全一样。
两个区域的账号 key 各自编号，互不影响。

## 多账号

每个账号是一份独立的 session 文件，放在当前区域的 slot 目录下（国内版 `~/.workbuddy2api/sessions/<key>.json`，国际版 `~/.workbuddy2api/sessions-global/<key>.json`），生效的那份是该区域的生效文件。

切换时会**先把当前生效文件里最新的凭证存回它所属的 slot**，再写入目标 slot 的内容并重启服务，所以来回切换不会丢 token。归属判定靠文件里的 `account.uid`，不依赖额外的标记文件——即使切换过程中被中断也不会串写凭证。

**同一个区域内，反代同一时刻只服务一个账号**（它启动时把 session 读进内存，无法热切换）。要让多个账号同时在线，需要多开实例；本仓库只在国内版与国际版之间做了这种拆分（两个实例、两个端口、两个 provider）。

两个区域的凭证不能互用：反代按 session 文件里的 `backend` 元数据隔离，拿国内版的文件去起国际版实例会被直接拒绝。

### 增删账号

```bash
workbuddy2pi account add            # 国内版：从桌面端登录文件导入
workbuddy2pi global account add     # 国际版：浏览器登录
workbuddy2pi account remove b       # 删除账号 b
```

`account add` 按区域选建档方式：国际版走浏览器登录（桌面端文件里的 token 是加密的，导入没用），
国内版从桌面端登录文件导入。同一账号重复添加会更新它已有的 slot，不会新建一个重复项。

`account remove` 不真删文件，而是改名成 `<key>-removed-<日期>.json` 留档（不在账号列表里显示），
删错了改回名字即可恢复；确认不需要再自己删掉。当前生效的账号不能直接删，
先 `account <其他key>` 切走再删。

### 凭证有效期怎么读

账号后面那句「剩 N 天（至 某日某分）」说的是 **access_token** 的有效期，不是登录时间：

- 国际版签发的 token 有效期正好是 365 天，所以到期时间看起来像「登录时间加一年」——
  那是服务端就这么签的，不是把登录时间标成了到期；
- access_token 到期前反代会自动用 refresh_token 续期（每次请求前检查，剩 60 秒内就刷），
  所以「剩 N 天」归零不代表账号失效；真正需要重新登录的时刻是 refresh_token 也到期的时候，
  纯文本 `status` 里两项都列了出来；
- 国内版两项相差几天，国际版两项相同。

这个「剩 N 天」能不能算准，取决于 session 里有没有绝对的 `expiresAt`：反代只认它，
缺了就会把凭证当成永不过期、从此不再刷新。所以不管是导入还是浏览器登录，写盘前都会补算，
详见下方已知坑。

## 已知坑（都已在本仓库里规避）
**国际版落盘的 token 是加密的，不能导入。** 国内版在桌面端登录文件里存明文 JWT，国际版存的是 `{$wbEncrypted:1, envelope:…}` 加密对象。反代不会解密，它只会把 `auth.accessToken` 拼进 `Authorization` 头，于是用这种文件建出来的账号每个请求都是 401——但 `status` 依然会显示「端点正常」（那只是反代本地的模型列表）。所以国际版一律走浏览器登录（`workbuddy2pi-global account add`），`import-session` 也会直接拦下这类文件而不是建一个看似成功的坏 slot。

**反代刷新 token 后不再主动刷新。** 服务端的刷新响应只返回相对的 `expiresIn`，没有绝对的 `expiresAt`；而反代会把整个 `auth` 对象替换成响应内容，于是 `expiresAt` 丢失（2.0.6 只在判断要不要刷新时**读**它，刷新完不写回），它据此判断「永不过期」，此后再不刷新——国内版约一个月、国际版一年后 access_token 过期，所有请求 401。因此：

- 本仓库这边，建档/导入/续期时一律补算 `expiresAt` 与 `refreshExpiresAt`（`import-session`、`account add`/`login`、`renew` 都做）；
- 但反代**自己发起的那次刷新**仍会把 expiresAt 丢掉，这正是 `renew` 存在的理由：它用该 slot 自己的 refresh token 续期并把绝对时间写回 slot。定期跑一次 `account renew`（国内版一个月、国际版一年一次即可），失败才回退到 wb-switch 的 `~/.wb-switch/accounts.json`（后者只有国内版账号）。

**pi 会丢弃没有认证方式的 provider。** 注册 provider 时 pi 会校验存在认证方式，没有 key 的 provider 会被整块丢掉，它的模型一个也不出现。因此 `auth.json` 里两个 provider 各需一个占位 key，由 `workbuddy2pi ensure-auth-key` 一并补齐。

**launchd 的 bootout 是异步的。** 紧接着 `bootout` 对同一标签执行 `bootstrap` 会报 `Bootstrap failed: 5: Input/output error`，运维命令会等标签真正消失后再注册。

## 常见问题

- **自检提示「生效凭证含 expiresAt」未通过**：凭证是手工拼的或缺字段，重新执行安装脚本或 `workbuddy2pi account renew`。
- **`pi` 里看不到 workbuddy 模型**：扩展在 pi 启动时加载，装完需要重开 pi；再不行看 `workbuddy2pi doctor`。
- **`pi` 里只有 workbuddy 没有 workbuddy-global**：多为 `auth.json` 缺 `workbuddy-global` 占位 key，或国际版实例没起。分别用 `workbuddy2pi ensure-auth-key` 与 `workbuddy2pi global install-service` 处理。
- **端点健康检查失败**：`workbuddy2pi logs 200` 看反代日志；常见原因是端口 8787（国内版）或 8788（国际版）被别的程序占用。
- **Windows 报 shell 相关错误**：Pi 的 shell 工具依赖 Git Bash，请安装 [Git for Windows](https://git-scm.com/download/win)。
