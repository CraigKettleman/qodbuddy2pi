# 安装 pi 走官方安装器，不自己装 Node

本项目接入 pi，因此安装器必须先保证 pi 存在。四个旧安装脚本各自用
`npm install -g --ignore-scripts @earendil-works/pi-coding-agent` 装 pi，并各自用
Homebrew 或 winget 装 Node，只检查 Node 是否存在、不检查版本。

pi 官方提供了自己的安装方式：macOS / Linux 用 `curl -fsSL https://pi.dev/install.sh | sh`，
Windows 用 `powershell -c "irm https://pi.dev/install.ps1 | iex"`。官方安装器会装到
`~/.pi/agent/install`（Windows 为 `%USERPROFILE%\.pi\agent\install`），在 `~/.pi/agent/bin/pi`
放启动器，缺 Node 或低于 22.19 时自行安装 Node（Homebrew / apt / apk / 独立 tarball，
带校验），Windows 上还会在没有 `bash.exe` 时引导安装 Git Bash。npm 装法是官方列出的
备选，且不固定传递依赖。

因此决定：安装器调用官方安装方式，并删掉自己那套 Node 安装与版本校验逻辑。npm 装法只在
官方方式不可用时作为退路。

## Consequences

- 本项目不再需要维护 brew / winget 两条 Node 安装路径，也不必自己实现版本比较。
- pi 的安装位置与更新方式由官方掌管（`pi update`），本项目只依赖 `pi` 出现在 PATH 上。
- 检测到 Node 缺失或版本不足时，安装器停下来执行官方那一行，让它自己征询同意并交互式安装。
  这一点是必要的：官方安装器通过 `/dev/tty` 提问，而本项目的安装器可能正被 `curl | sh` 管道
  喂入，此时 stdin 不是终端。
