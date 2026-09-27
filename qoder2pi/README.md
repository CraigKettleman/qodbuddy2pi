# Qoder2Pi 一键接入

把 Qoder 订阅额度接入 Pi Coding Agent：自动安装 Pi 与 qoder provider 扩展并登录，完成后即可用 Qoder 模型。

前置要求：**Node.js 18+**。

## 1. 获取 PAT

- 国内版：https://qoder.com.cn/account/integrations
- 国际版：https://qoder.com/account/integrations

创建后得到一个 `pt-` 开头的令牌。

## 2. 一键安装

**macOS / Linux**（bash）：

```bash
# 国内版（默认），带 PAT 一步到位
./install-pi-qoder.sh pt-xxxxxx

# 国际版
QODER_REGION=global ./install-pi-qoder.sh pt-xxxxxx

# 不带 PAT：脚本会打印手动登录步骤
./install-pi-qoder.sh
```

**Windows**（PowerShell）：

```powershell
# 国内版（默认）
powershell -ExecutionPolicy Bypass -File install-pi-qoder.ps1 pt-xxxxxx

# 国际版
powershell -ExecutionPolicy Bypass -File install-pi-qoder.ps1 pt-xxxxxx -Region global
```

## 脚本会做什么

依次：检查/安装 Node.js → 安装 Pi → 安装 `pi-provider-qoder` 扩展 → 登录（已有凭据自动跳过 / PAT 自动登录 / 打印手动步骤）→ 验证模型列表出现 `qoder` 模型。

扩展从**本仓库自带的副本**安装（`../assets/vendor/pi-provider-qoder`），不再从 npm 拉取，因此不受上游发版或下架影响。该副本的版本、校验值与许可见 [../assets/vendor/README.md](../assets/vendor/README.md)。

> 版本说明：0.4.6 修复了与 pi ≥ 0.86 的上下文兼容问题——旧版读不到折叠进首条 system 消息的系统提示词与工具声明，导致请求丢失上下文、模型表现为“没有工具/不能联网”。请确保副本不低于该版本。

## 登录未生效怎么办

运行 `pi`，输入 `/login qoder-cn`（国内版）或 `/login qoder`（国际版）完成登录，再重跑脚本验证。

## 启动使用

```bash
pi --provider qoder-cn --model <模型ID>   # 国内版
pi --provider qoder --model <模型ID>      # 国际版
```

或进入 pi 后用 `/model` 选择 qoder 下的模型。

## 常见问题

- **Windows 报 shell 相关错误**：Pi 的 shell 工具依赖 Git Bash，请安装 [Git for Windows](https://git-scm.com/download/win)。
- **提示「环境变量登录未生效」**：改用上面的手动 `/login` 方式即可。
