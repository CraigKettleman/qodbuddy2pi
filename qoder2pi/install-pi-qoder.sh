#!/usr/bin/env bash
# ============================================================
# install-pi-qoder.sh — 一键把 Qoder 额度接入 Pi Coding Agent
#
# 原理:安装 pi-provider-qoder 扩展,由它负责 OAuth/PAT 登录、
# COSY 请求签名、token 自动刷新和模型目录拉取;
# 登录成功后 Pi 的请求走 Qoder 网关,消耗 Qoder 订阅额度。
#
# 用法:
#   ./install-pi-qoder.sh                 # 交互提示,登录走 pi 内 /login
#   ./install-pi-qoder.sh pt-xxxxxx      # 用 PAT 一步到位(国内版)
#   QODER_REGION=global ./install-pi-qoder.sh pt-xxxxxx   # 国际版
#
# PAT 获取地址:
#   国内版  https://qoder.com.cn/account/integrations
#   国际版  https://qoder.com/account/integrations
# ============================================================
set -euo pipefail

REGION="${QODER_REGION:-cn}"
PAT="${1:-${QODER_PAT:-}}"

if [[ "$REGION" == "cn" ]]; then
  PAT_ENV="QODERCN_API_KEY"
  PAT_PAGE="https://qoder.com.cn/account/integrations"
  PROVIDER="qoder-cn"
else
  PAT_ENV="QODER_API_KEY"
  PAT_PAGE="https://qoder.com/account/integrations"
  PROVIDER="qoder"
fi

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m错误:\033[0m %s\n' "$*" >&2; exit 1; }

# provider 扩展用本仓库 assets/vendor 下的副本安装，不再从 npm 拉取
VENDOR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../assets/vendor" && pwd)"
VENDOR_QODER="$VENDOR_DIR/pi-provider-qoder"

# ---------- 1. Node.js ----------
if ! command -v node >/dev/null 2>&1; then
  log "未检测到 Node.js"
  if [[ "$(uname)" == "Darwin" ]] && command -v brew >/dev/null 2>&1; then
    log "通过 Homebrew 安装 Node.js..."
    brew install node
  else
    fail "请先安装 Node.js 18+ (https://nodejs.org) 后重新运行"
  fi
fi
log "Node.js $(node --version)"

# ---------- 2. Pi 本体 ----------
if ! command -v pi >/dev/null 2>&1; then
  log "安装 Pi Coding Agent..."
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
fi
log "Pi $(pi --version 2>/dev/null || echo '?')"

# ---------- 3. qoder provider 扩展 ----------
# 本地路径安装时 `pi list` 显示的是该路径，而路径末段就是包名，所以下面的判定依然成立
[[ -f "$VENDOR_QODER/package.json" ]] \
  || fail "缺少本仓库自带的 qoder 扩展：$VENDOR_QODER（请在完整仓库里运行本脚本）"
if pi list 2>/dev/null | grep -qF "pi-provider-qoder"; then
  log "pi-provider-qoder 已安装,跳过"
else
  log "安装 pi-provider-qoder 扩展(来自本仓库 assets/vendor)..."
  pi install "$VENDOR_QODER"
fi

# ---------- 4. 登录 ----------
if [[ -s "$HOME/.pi/agent/auth.json" ]] \
   && grep -q "$PROVIDER" "$HOME/.pi/agent/auth.json" 2>/dev/null; then
  log "检测到已有的 $PROVIDER 登录凭据，跳过登录"
elif [[ -n "$PAT" ]]; then
  log "使用 PAT 启动 Pi 触发自动登录($REGION)..."
  # 扩展在启动时检测到 PAT 环境变量会自动兑换 token 并写入 auth.json
  if [[ "$REGION" == "cn" ]]; then
    QODERCN_API_KEY="$PAT" pi --provider "$PROVIDER" --list-models >/dev/null 2>&1 || true
  else
    QODER_API_KEY="$PAT" pi --provider "$PROVIDER" --list-models >/dev/null 2>&1 || true
  fi
  grep -q "qoder" "$HOME/.pi/agent/auth.json" 2>/dev/null \
    || log "环境变量登录未生效,请改用下方手动 /login 方式"
else
  log "需要登录,请完成以下手动步骤:"
  echo "  1. 打开 $PAT_PAGE 创建一个 PAT (pt- 开头)"
  echo "  2. 运行: pi"
  echo "  3. 输入: /login $PROVIDER"
  echo "     (cn 版粘贴 PAT;global 版会打开浏览器 OAuth)"
  echo "  4. 重新运行本脚本验证"
  exit 0
fi

# ---------- 5. 验证 ----------
log "验证模型列表..."
sleep 1
if pi --list-models 2>/dev/null | grep -q "^qoder"; then
  echo
  pi --list-models 2>/dev/null | grep "^qoder" | head -10
  echo
  log "完成!启动方式:"
  echo "  pi --provider $PROVIDER --model <模型ID>"
  echo "  或进入 pi 后用 /model 选择 qoder 下的模型"
else
  fail "qoder 模型未出现。请运行 pi 后输入 /login $PROVIDER 手动登录,再重试"
fi
