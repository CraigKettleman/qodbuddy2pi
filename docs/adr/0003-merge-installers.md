# 安装器从四份合并为每平台一份

旧结构有四份安装脚本：`qoder2pi/install-pi-qoder.{sh,ps1}` 与
`workbuddy2pi/install-workbuddy2pi.{sh,ps1}`。它们的步骤高度重叠，且重叠部分是逐字重复的：
四份都各自检查 Node、各自装 pi、各自把 `tui.js` 装到 `~/.local/bin`、各自在对方已装时
部署总控。两份 `.ps1` 与两份 `.sh` 也是同一套逻辑的语法翻译。

因此决定合并成 `install.sh` 与 `install.ps1`，内部把步骤拆成可复用函数，两份只保留
平台差异。Qoder 与 WorkBuddy 的接入作为函数被调用，不再各有独立的顶层流程。

## Considered Options

- **只留一个 POSIX 脚本，Windows 靠 Git Bash 跑。** 否决：Windows 上的常驻服务是计划任务、
  PATH 写在 HKCU、uv 用 `irm` 安装、pi 需要 Git Bash——这些在 Git Bash 里都做不干净。
- **保留四份，把公共步骤抽成被 `source` 的片段。** 否决：入口数没减少，用户仍需知道有四个脚本。

## Consequences

- 平台差异成为唯一的差异，不再有「同一件事在两个 provider 的脚本里写法不同」的问题。
- PowerShell 版目前是唯一会把 `~/.local/bin` 永久写入 PATH 的脚本，其余三份只警告。
  统一后两个平台都永久写入，但写入前展示将要修改的文件 / 注册表项并征求同意。
- 颜色与日志函数在 JS 侧收拢进 `tui.js` 的 `C`／`G`；shell 侧各脚本顶部留一组颜色变量。
