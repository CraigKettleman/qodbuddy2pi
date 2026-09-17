#!/usr/bin/env bash
# ============================================================
# install-workbuddy2pi.sh — 一键把 WorkBuddy 额度接入 Pi Coding Agent
#
# 原理：用 uv 拉起 PyPI 包 workbuddy2api 提供的 codebuddy_proxy，在本机
# 127.0.0.1:8787 暴露一个 OpenAI / Anthropic / Responses 兼容端点，
# 再把它注册成 pi 的 workbuddy provider，于是 pi 的请求消耗 WorkBuddy 额度。
#
# 依赖全部由本脚本自动准备：
#   Node.js → pi → uv → 运维命令 → pi 扩展 → 登录凭证 → 常驻服务 → 自检
#
# 用法:
#   ./install-workbuddy2pi.sh               自动准备全部依赖
#   ./install-workbuddy2pi.sh --no-service  只装接入，不注册常驻服务
#   ./install-workbuddy2pi.sh --help
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RES="$(cd "$HERE/../assets" && pwd)"
DATA_DIR="$HOME/.workbuddy2api"
VENDOR_SRC="$RES/vendor"
VENDOR_DST="$DATA_DIR/vendor"
LIVE="$HOME/.codebuddy-session.json"
BIN_DIR="$HOME/.local/bin"
EXT_DIR="$HOME/.pi/agent/extensions"
WITH_SERVICE=1
for arg in "$@"; do
  case "$arg" in
    --no-service) WITH_SERVICE=0 ;;
    -h|--help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "未知参数：$arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
step() { printf '\n\033[1;36m【%s】\033[0m %s\n' "$1" "$2"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m错误:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$RES/workbuddy2pi" ]] || fail "资源缺失：$RES/workbuddy2pi（请在完整仓库里运行本脚本）"

# ---------- 1. 平台 ----------
step 1 "检查平台"
case "$(uname -s)" in
  Darwin) PLATFORM=macos ;;
  Linux)  PLATFORM=linux ;;
  *) fail "本脚本只支持 macOS 与 Linux。Windows 请用 install-workbuddy2pi.ps1" ;;
esac
log "平台：$PLATFORM"

# ---------- 2. Node.js ----------
step 2 "检查 Node.js"
if ! command -v node >/dev/null 2>&1; then
  log "未检测到 Node.js"
  if [[ "$PLATFORM" == "macos" ]] && command -v brew >/dev/null 2>&1; then
    log "通过 Homebrew 安装 Node.js..."
    brew install node
  else
    fail "请先安装 Node.js 18+ (https://nodejs.org) 后重新运行"
  fi
fi
log "Node.js $(node --version)"

# ---------- 3. Pi ----------
step 3 "检查 Pi Coding Agent"
if ! command -v pi >/dev/null 2>&1; then
  log "安装 Pi Coding Agent..."
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
fi
log "Pi $(pi --version 2>/dev/null || echo '?')"

# ---------- 4. uv ----------
step 4 "检查 uv"
if command -v uv >/dev/null 2>&1; then
  UV_BIN="$(command -v uv)"
else
  log "安装 uv（反代由 PyPI 包 workbuddy2api 提供，靠 uv 拉起）..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$BIN_DIR:$PATH"
  UV_BIN="$(command -v uv || true)"
  [[ -n "$UV_BIN" ]] || fail "uv 安装后仍不在 PATH 上，请重开终端后重新运行"
fi
log "uv $("$UV_BIN" --version 2>/dev/null || echo '?')"

# ---------- 5. 运维命令 ----------
step 5 "安装运维命令 workbuddy2pi"
mkdir -p "$BIN_DIR"
install -m 755 "$RES/workbuddy2pi" "$BIN_DIR/workbuddy2pi"
log "已安装 $BIN_DIR/workbuddy2pi"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR 不在当前 PATH 上；把它加进 shell 配置后重开终端即可直接使用 workbuddy2pi" ;;
esac

# 上一版把账号切换做成了独立命令，这里改为指向同一个程序的入口，避免两套实现。
if [[ -e "$BIN_DIR/wb-account" && ! -L "$BIN_DIR/wb-account" ]]; then
  mv "$BIN_DIR/wb-account" "$BIN_DIR/wb-account.bak-$(date +%Y%m%d%H%M%S)"
  warn "已备份旧的 wb-account（现在由 workbuddy2pi 取代）"
fi
ln -sfn workbuddy2pi "$BIN_DIR/wb-account"
log "wb-account 已指向 workbuddy2pi（旧习惯的命令仍可用）"

# ---------- 6. vendored 依赖 ----------
step 6 "部署本仓库自带的依赖"
[[ -d "$VENDOR_SRC" ]] || fail "缺少 vendored 依赖目录：$VENDOR_SRC"
WHEEL_SRC="$(ls -1 "$VENDOR_SRC"/workbuddy2api-*.whl 2>/dev/null | tail -1 || true)"
[[ -n "$WHEEL_SRC" ]] || fail "缺少反代 wheel：$VENDOR_SRC/workbuddy2api-*.whl"
mkdir -p "$VENDOR_DST"
# 清掉旧版本，避免同时残留多份 wheel 让服务选错
rm -f "$VENDOR_DST"/workbuddy2api-*.whl
cp -p "$WHEEL_SRC" "$VENDOR_DST/"
WHEEL_PATH="$VENDOR_DST/$(basename "$WHEEL_SRC")"
log "已部署反代实现：$(basename "$WHEEL_PATH")"
log "（反代实现固定在 assets/vendor/，不再从 PyPI 拉；其依赖如 fastapi/uvicorn 仍由 uv 从 PyPI 解析）"

# ---------- 7. pi 扩展 ----------
step 7 "安装 pi provider 扩展"
mkdir -p "$EXT_DIR"
TARGET="$EXT_DIR/workbuddy.ts"
if [[ -f "$TARGET" ]] && ! cmp -s "$TARGET" "$RES/workbuddy.ts"; then
  cp -p "$TARGET" "$TARGET.bak-$(date +%Y%m%d%H%M%S)"
  warn "已备份原有的 workbuddy.ts"
fi
install -m 644 "$RES/workbuddy.ts" "$TARGET"
log "已安装 $TARGET"

# 扩展注册的 provider 需要 auth.json 里有一个占位 key（本地反代不校验 key）
ACTION="$(node "$RES/workbuddy2pi" ensure-auth-key)"
case "$ACTION" in
  added)   log "已在 auth.json 写入 workbuddy 占位 key（原文件已备份为 auth.json.bak）" ;;
  present) log "auth.json 已有 workbuddy key" ;;
  *)       fail "写入 auth.json 失败：$ACTION" ;;
esac

# ---------- 8. 登录凭证 ----------
step 8 "准备登录凭证"
mkdir -p "$DATA_DIR"
if node "$RES/workbuddy2pi" check-session; then
  log "已有有效的 WorkBuddy 凭证，跳过登录"
else
  log "未发现有效凭证，尝试从 WorkBuddy 桌面端登录文件导入..."
  if node "$RES/workbuddy2pi" import-session 2>/dev/null \
     && node "$RES/workbuddy2pi" check-session; then
    log "导入成功"
  else
    warn "本机没有可直接导入的 WorkBuddy 桌面端登录文件，改用浏览器登录"
    BOOT_PORT=8790
    "$UV_BIN" run --with "$WHEEL_PATH" python -m codebuddy_proxy \
      --host 127.0.0.1 --port "$BOOT_PORT" --login \
      --log-file "$DATA_DIR/bootstrap-login.jsonl" &
    BOOT_PID=$!
    log "请在浏览器中完成 WorkBuddy 登录（最多等待 5 分钟）..."
    waited=0
    while (( waited < 300 )); do
      sleep 3
      waited=$((waited + 3))
      if node "$RES/workbuddy2pi" check-session; then break; fi
    done
    kill "$BOOT_PID" 2>/dev/null || true
    wait "$BOOT_PID" 2>/dev/null || true
    node "$RES/workbuddy2pi" check-session || fail "登录未完成或超时。请重新运行本脚本，或手动执行：
      uv run --with \"$WHEEL_PATH\" python -m codebuddy_proxy --login"
    log "登录完成，凭证已写入 $LIVE"
  fi
fi

# ---------- 9. 常驻服务 ----------
step 9 "注册常驻服务"
if (( WITH_SERVICE )); then
  # 服务由运维命令统一注册，脚本与命令共用同一套平台逻辑，避免两份实现漂移
  "$BIN_DIR/workbuddy2pi" install-service
else
  warn "已按 --no-service 跳过；之后可执行 workbuddy2pi install-service 注册"
fi

# ---------- 10. 自检 ----------
step 10 "自检"
sleep 3
if "$BIN_DIR/workbuddy2pi" doctor; then
  echo
  log "完成！在 pi 里用 /model 选择 workbuddy 下的模型，或："
  echo "  pi --provider workbuddy --model deepseek-v4.1-flash"
  echo
  echo "日常维护："
  echo "  workbuddy2pi status              查看服务与账号"
  echo "  workbuddy2pi account b           切换到第二个账号"
  echo "  workbuddy2pi account renew       续期凭证"
  echo "  workbuddy2pi logs                查看反代日志"
else
  fail "自检未通过，请按上面的提示逐项处理"
fi
