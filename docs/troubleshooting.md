# 排错

## 常见问题

**`pi` 里看不到 workbuddy 模型**：pi 在启动时加载扩展，装完需要重开 pi。再不行看
`workbuddy2pi doctor`。

**`pi` 里只有 workbuddy 没有 workbuddy-global**：多为 `auth.json` 缺 `workbuddy-global`
占位 key，或国际版实例没起。分别用 `workbuddy2pi ensure-auth-key` 与
在总控第 3 页里「安装服务」处理。

**端点健康检查失败**：`workbuddy2pi logs 200` 看反代日志；常见原因是端口 8787（国内版）
或 8788（国际版）被别的程序占用。

**自检提示「生效凭证含 expiresAt」未通过**：凭证是手工拼的或缺字段，重新执行安装脚本或
`workbuddy2pi account renew`。

**提示「环境变量登录未生效」**（Qoder）：改用 `pi` 里的 `/login qoder-cn` 或
`/login qoder` 手动登录。

**Windows 报 shell 相关错误**：pi 的 shell 工具在原生 Windows 上依赖 Git Bash。pi 的官方
安装器会引导安装，也可以自己装 [Git for Windows](https://git-scm.com/download/win)。

**Qoder 登录未生效**：运行 `pi`，输入 `/login qoder-cn`（国内版）或 `/login qoder`
（国际版），再运行 `qodbuddy2pi --check` 确认。

## 已知坑（都已在本仓库里规避）

### 不从桌面端落盘的凭证建档

国际版客户端把凭证落盘成 `{$wbEncrypted:1, envelope:…}` 加密对象。反代不会解密，它只会把
`auth.accessToken` 拼进 `Authorization` 头，于是用这种文件建出来的账号每个请求都是 401——
但 `status` 依然会显示「端点正常」（那只是反代本地的模型列表）。

国内版的桌面端文件是明文 JWT，技术上能导入，但为了两个区域一条路径、少一份要维护的
兼容逻辑，本仓库统一走浏览器登录建档，不提供「从桌面端文件导入」。

### 反代刷新 token 后不再主动刷新

服务端的刷新响应只返回相对的 `expiresIn`，没有绝对的 `expiresAt`；而反代会把整个 `auth`
对象替换成响应内容，于是 `expiresAt` 丢失（2.0.6 只在判断要不要刷新时**读**它，刷新完不
写回），它据此判断「永不过期」，此后再不刷新——国内版约一个月、国际版一年后 access_token
过期，所有请求 401。

因此：

- 本仓库这边，建档与续期时一律补算 `expiresAt` 与 `refreshExpiresAt`
  （`account add`/`login`、`renew` 都做）；
- 但反代**自己发起的那次刷新**仍会把 `expiresAt` 丢掉，这正是 `renew` 存在的理由：它用该
  slot 自己的 refresh token 续期并把绝对时间写回 slot。定期跑一次 `account renew`
  （国内版一个月、国际版一年一次即可），失败才回退到 wb-switch 的
  `~/.wb-switch/accounts.json`（后者只有国内版账号）。

### pi 会丢弃没有认证方式的 provider

注册 provider 时 pi 会校验存在认证方式，没有 key 的 provider 会被整块丢掉，它的模型一个
也不出现。因此 `auth.json` 里两个 provider 各需一个占位 key，由
`workbuddy2pi ensure-auth-key` 一并补齐。

### launchd 的 bootout 是异步的

紧接着 `bootout` 对同一标签执行 `bootstrap` 会报
`Bootstrap failed: 5: Input/output error`。运维命令会等标签真正消失后再注册。

## 界面相关

**界面没出来，只有一堆文字**：总控只在真终端里启用；管道或重定向时会退回纯文本，
这是有意为之，方便脚本调用。

**屏幕上有残留或错位**：终端宽度变化时界面会退回一次整屏重写。如果残留持续存在，
按 `r` 刷新一次。这类问题是行级差分渲染的典型故障，值得报出来。

**Windows 上窗口大小变化后不重绘**：`SIGWINCH` 在 Windows 上不可靠，那里只能按 `r` 手动刷新。
