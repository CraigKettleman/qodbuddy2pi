# 主命令 qodbuddy2pi，别名打开同一个总控

旧结构有四个命令：`qodbuddy2pi`（总控）、`qoder2pi`、`workbuddy2pi`、`workbuddy2pi-global`。
后三个各自打开一个独立界面，与总控里的对应页是两套入口。

新设计要「不区分两种脚本」「TUI 集一体」，但直接删掉旧命令会断掉已有用户和 README 里
所有用法。因此决定：主命令为 `qodbuddy2pi`，`qodbuddy`、`workbuddy2pi`、`qoder2pi` 作为
别名保留。别名打开的是同一个完整总控，只是焦点预落在对应 provider 的页。

## Consequences

- 别名不是第二套实现，只是入口变体，与现有 `workbuddy2pi-global` 复用同一份实现的做法一致。
- 别名是一个独立的小入口文件（设环境变量后 require 主程序），不靠软链也不靠 `argv[0]`：
  Windows 上创建软链需要开发者模式或管理员权限，`.cmd` 转发层还会把程序名吃掉。
- 落到哪一页：`qodbuddy` → 第一页，`qoder2pi` → Qoder 页，`workbuddy2pi` → 国内版页。
- `workbuddy2pi-global` 删除，这是破坏性变更：国际版用户改用主命令后切页签（`3` 或 Tab）。
  旧命令不再存在，因此不会静默地变成别的行为。
- 仓库根目录原有的包装脚本 `./qodbuddy` 与新别名 `qodbuddy` 同名，因此改名为 `./dev.sh`
  （Windows 为 `dev.cmd`），定位为开发模式入口：直接用仓库里的代码跑 TUI，不安装。
  改完 `assets/tui.js` 可以立刻看到效果。
- npm 包名与仓库名保持 `qodbuddy2pi`，不改。
- 运维命令继续装到 `~/.local/bin`。pi 的官方安装器也会把启动器软链到第一个可写的 PATH
  目录，候选里包括 `~/.local/bin`，两者不冲突。
