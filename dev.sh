#!/usr/bin/env bash
# dev.sh — 开发模式入口：直接用仓库里的代码跑总控，不安装。
#
# 用途是迭代：改完 assets/tui.js 立刻 ./dev.sh 就能看到效果，不用重装。
# 它不部署任何东西，所以跑之前得先装过一次（至少让 pi 可用）。
#
# 普通用户不需要它——装完之后日常用的是：
#   qodbuddy2pi          总控界面
#   ./install.sh         安装/重新安装
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec node "$HERE/assets/qodbuddy2pi" "$@"
