# WorkBuddy2Pi 一键接入

把 WorkBuddy 订阅额度接入 Pi Coding Agent：自动准备依赖、建立登录凭证、注册常驻服务，并把它注册成 pi 的 `workbuddy` provider。完成后 pi 的请求消耗 WorkBuddy 额度。

## 原理

```
pi（workbuddy provider，baseUrl = http://127.0.0.1:8787/v1）
  ↓
codebuddy_proxy（本机常驻服务，PyPI 包 workbuddy2api 提供）
  ↓  协议转换 + token 自动刷新
copilot.tencent.com
```

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
./workbuddy2pi/install-workbuddy2pi.sh

# 只装接入，不注册常驻服务
./workbuddy2pi/install-workbuddy2pi.sh --no-service
```

**Windows**（在仓库根目录执行）

```powershell
powershell -ExecutionPolicy Bypass -File workbuddy2pi\install-workbuddy2pi.ps1

# 只装接入，不注册计划任务
.\workbuddy2pi\install-workbuddy2pi.ps1 -NoService
```

## 脚本运行

依次：检查/安装 Node.js 与 Pi → 检查/安装 uv → 安装运维命令 `workbuddy2pi` → 部署本仓库自带的依赖 → 安装 pi 扩展并补齐 `auth.json` 占位 key → 准备登录凭证 → 注册常驻服务并启动 → 自检。

**登录凭证**按以下顺序获取，全都自动判断：

1. `~/.codebuddy-session.json` 已有且未过期 → 直接跳过；
2. 本机能找到 WorkBuddy 桌面端的登录文件 → 转换导入（并补算 `expiresAt`，见下方「已知坑」）；
3. 都没有 → 启动临时实例走浏览器登录，最多等 5 分钟。

**脚本是幂等的**，可以反复运行：已有凭证、已有账号都不会被覆盖，只有与仓库版本不一致的扩展会先备份再替换。

## 日常使用

```bash
workbuddy2pi status                 # 服务、端点、凭证、账号一览
workbuddy2pi account                # 列出账号
workbuddy2pi account b              # 切到账号 b（重启服务，约 1–3 秒）
workbuddy2pi account renew          # 续期当前账号的凭证
workbuddy2pi account renew b        # 续期指定账号
workbuddy2pi restart                # 重启服务
workbuddy2pi logs 100                # 查看反代日志尾部
workbuddy2pi doctor                 # 依赖与接入自检
workbuddy2pi uninstall-service      # 移除常驻服务
```

## 多账号

每个账号是一份独立的 session 文件，放在 `~/.workbuddy2api/sessions/<key>.json`，生效的那份是 `~/.codebuddy-session.json`。

切换时会**先把当前生效文件里最新的凭证存回它所属的 slot**，再写入目标 slot 的内容并重启服务，所以来回切换不会丢 token。归属判定靠文件里的 `account.uid`，不依赖额外的标记文件——即使切换过程中被中断也不会串写凭证。

**反代同一时刻只服务一个账号**（它启动时把 session 读进内存，无法热切换）。要让两个账号同时在线，需要跑两个实例、两个端口、两个 provider，本仓库不这么做。

## 已知坑（都已在本仓库里规避）
**反代刷新 token 后不再主动刷新。** 服务端的刷新响应只返回相对的 `expiresIn`，没有绝对的 `expiresAt`；而反代会把整个 `auth` 对象替换成响应内容，于是 `expiresAt` 丢失，它据此判断「永不过期」，此后再不刷新，约 55 天后 access_token 过期、所有请求 401。因此：

- 建档/导入时一律补算 `expiresAt` 与 `refreshExpiresAt`（`import-session`、`renew` 都做）；
- 每个 access_token 周期需要执行一次 `workbuddy2pi account renew`。`renew` 先用该 slot 自己的 refresh token 续期（保持凭证链独立），失败才回退到 wb-switch 的 `~/.wb-switch/accounts.json`。

**launchd 的 bootout 是异步的。** 紧接着 `bootout` 对同一标签执行 `bootstrap` 会报 `Bootstrap failed: 5: Input/output error`，运维命令会等标签真正消失后再注册。

## 常见问题

- **自检提示「生效凭证含 expiresAt」未通过**：凭证是手工拼的或缺字段，重新执行安装脚本或 `workbuddy2pi account renew`。
- **`pi` 里看不到 workbuddy 模型**：扩展在 pi 启动时加载，装完需要重开 pi；再不行看 `workbuddy2pi doctor`。
- **端点健康检查失败**：`workbuddy2pi logs 200` 看反代日志；常见原因是端口 8787 被别的程序占用。
- **Windows 报 shell 相关错误**：Pi 的 shell 工具依赖 Git Bash，请安装 [Git for Windows](https://git-scm.com/download/win)。
