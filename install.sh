#!/usr/bin/env bash
# ============================================================
# install.sh — 把 Qoder 与 WorkBuddy 接入 pi coding agent（macOS / Linux）
#
# 这一份取代了原来的四份脚本（qoder2pi / workbuddy2pi 的 .sh 各一份）。
# Qoder 与 WorkBuddy 的接入是这里的一组函数，不再是各自的顶层流程；
# 两个平台各自只有一份脚本，差异只保留平台本身。
#
# 接入哪些 provider 由探测决定，探测拿出来给你确认；也可以用参数跳过提问：
#
#   ./install.sh                     探测本机现状，逐项问你要装哪些
#   ./install.sh --all               全装（四个 provider）
#   ./install.sh --only qoder-cn     只装指定的一些（可重复或用逗号分隔）
#   ./install.sh --no-service        只装接入，不注册常驻服务
#   ./install.sh --non-interactive   不提问，按探测结果装（供 curl|sh 与自动化）
#   ./install.sh --force-reinstall   即使已接入也重装一遍
#   ./install.sh --help
#
# provider 的取值：qoder-cn、qoder、workbuddy、workbuddy-global
#
# pi 本身用官方安装方式装（macOS / Linux 上就是 pi.dev 的那条 curl），
# 不再自己装 Node：官方安装器会按需安装 Node 并强制 22.19+。
#
# 从管道运行时（curl … | sh）：本脚本只负责下载与 exec，真正的安装器拿到
# 干净终端后再提问。见 docs/adr/0006。
# ============================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RES="$HERE/assets"
BIN_DIR="$HOME/.local/bin"
EXT_DIR="$HOME/.pi/agent/extensions"
WB_DATA="$HOME/.workbuddy2api"
WB_VENDOR="$WB_DATA/vendor"

WITH_SERVICE=1
NON_INTERACTIVE=0
FORCE=0
ALL=0
ONLY=()

# ------------------------------------------------------------ 平台

case "$(uname -s)" in
  Darwin) PLATFORM=macos ;;
  Linux)  PLATFORM=linux ;;
  *) echo "install.sh 只支持 macOS 与 Linux。Windows 请用 install.ps1" >&2; exit 2 ;;
esac

# ------------------------------------------------------------ 输出

if [ -t 1 ]; then
  C_OK=$'\033[1;32m'; C_INFO=$'\033[1;36m'; C_WARN=$'\033[1;33m'
  C_ERR=$'\033[1;31m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
else
  C_OK=''; C_INFO=''; C_WARN=''; C_ERR=''; C_DIM=''; C_RST=''
fi

step()  { printf '\n%s==>%s %s\n' "$C_INFO" "$C_RST" "$*"; }
ok()    { printf '%s✓%s %s\n' "$C_OK" "$C_RST" "$*"; }
warn()  { printf '%s!%s %s\n' "$C_WARN" "$C_RST" "$*"; }
note()  { printf '%s  %s%s\n' "$C_DIM" "$*" "$C_RST"; }
die()   { printf '%s错误:%s %s\n' "$C_ERR" "$C_RST" "$*" >&2; exit 1; }

# 有真终端才能提问。管道进来时 stdin 不是终端，任何提问都会立刻读到 EOF。
can_ask() { [ "$NON_INTERACTIVE" -eq 0 ] && [ -t 0 ]; }

ask() {
  # ask "<问题>" [默认 y|n]；返回 0 表示 yes
  local q="$1" def="${2:-n}" ans
  if ! can_ask; then
    [ "$def" = "y" ]
    return
  fi
  if [ "$def" = "y" ]; then
    printf '%s [Y/n] ' "$q"
  else
    printf '%s [y/N] ' "$q"
  fi
  read -r ans || ans=""
  ans="$(printf '%s' "$ans" | tr -d '[:space:]')"
  [ -z "$ans" ] && ans="$def"
  case "$ans" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# ------------------------------------------------------------ 参数

need_arg() {
  [ "$2" -ge 2 ] || die "参数 $1 后面要跟一个值"
}

# 参数解析：用认领指针逐个消费参数，而不是 for arg in "$@"。
# 后者会把「--only 的值」也当成一个独立参数再走一遍 case，于是 --only qoder-cn
# 会因为 qoder-cn 被当成未知参数而报错。
while [ $# -gt 0 ]; do
  case "$1" in
    --no-service)      WITH_SERVICE=0; shift ;;
    --non-interactive) NON_INTERACTIVE=1; shift ;;
    --force-reinstall) FORCE=1; shift ;;
    --all)             ALL=1; shift ;;
    --only)
      [ $# -ge 2 ] || die "--only 后面要跟 provider 名"
      IFS=',' read -r -a parts <<< "$2"
      for p in "${parts[@]}"; do ONLY+=("$p"); done
      shift 2
      ;;
    --only=*)
      IFS=',' read -r -a parts <<< "${1#--only=}"
      for p in "${parts[@]}"; do ONLY+=("$p"); done
      shift
      ;;
    -h|--help)
      sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "未知参数：$1（用 --help 看用法）" ;;
    *)
      # 位置参数：./install.sh qoder-cn 当作 --only qoder-cn
      ONLY+=("$1")
      shift
      ;;
  esac
done

PROVIDERS=(qoder-cn qoder workbuddy workbuddy-global)

provider_title() {
  case "$1" in
    qoder-cn)         echo "Qoder 国内版" ;;
    qoder)            echo "Qoder 国际版" ;;
    workbuddy)        echo "WorkBuddy 国内版" ;;
    workbuddy-global) echo "WorkBuddy 国际版" ;;
    *)                echo "$1" ;;
  esac
}

# ------------------------------------------------------------ 资源检查

[ -f "$RES/tui.js" ]         || die "资源缺失：$RES/tui.js（请在完整仓库里运行本脚本）"
[ -f "$RES/qodbuddy2pi" ]    || die "资源缺失：$RES/qodbuddy2pi"
[ -f "$RES/qoder2pi" ]       || die "资源缺失：$RES/qoder2pi"
[ -f "$RES/workbuddy2pi" ]   || die "资源缺失：$RES/workbuddy2pi"

# ------------------------------------------------------------ 1. pi

# pi 官方安装方式：装到 ~/.pi/agent/install 并在 PATH 目录放启动器，
# 缺 Node 或低于 22.19 时自己装 Node（会征询同意，所以必须给它真终端）。
install_pi() {
  step "安装 pi coding agent（官方安装器）"
  if can_ask; then
    note "官方安装器可能会自行安装 Node.js（要求 22.19+）并询问是否写入 shell 配置。"
    curl -fsSL https://pi.dev/install.sh | sh
  else
    # 没有终端时的退路：npm 装法不 pin 传递依赖，所以只在拿不到交互时用
    note "没有交互终端，改用 npm 安装（不 pin 传递依赖）"
    command -v npm >/dev/null 2>&1 || die "没有 npm 也没有交互终端，请先手动安装 pi：https://pi.dev"
    npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  fi
}

check_pi() {
  step "检查 pi"
  if ! command -v pi >/dev/null 2>&1; then
    warn "未找到 pi"
    install_pi
    # 官方安装器可能把它放进 ~/.pi/agent/bin 或 ~/.local/bin，刷新一次 PATH
    export PATH="$HOME/.pi/agent/bin:$BIN_DIR:$PATH"
    command -v pi >/dev/null 2>&1 || die "pi 装好后仍不在 PATH 上，请重开终端后重新运行本脚本"
  fi
  ok "pi $(pi --version 2>/dev/null || echo '?')"
}

# ------------------------------------------------------------ 2. uv

# 只有 WorkBuddy 需要 uv（它用 uv 拉起 Python 写的反代）。Qoder 不需要。
check_uv() {
  step "检查 uv（WorkBuddy 反代需要）"
  if command -v uv >/dev/null 2>&1; then
    ok "uv $(uv --version 2>/dev/null || echo '?')"
    return
  fi
  note "安装 uv（反代由 PyPI 包 workbuddy2api 提供，靠 uv 拉起）"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$BIN_DIR:$PATH"
  command -v uv >/dev/null 2>&1 || die "uv 安装后仍不在 PATH 上，请重开终端后重新运行本脚本"
  ok "uv $(uv --version 2>/dev/null || echo '?')"
}

# ------------------------------------------------------------ 3. 运维命令

# 目标文件 → 权限。同一个清单给安装器与 npm 用，避免两边漂移。
OPS_FILES=(
  "qodbuddy2pi:755"
  "qodbuddy2pi.cmd:644"
  "qodbuddy:755"
  "qodbuddy.cmd:644"
  "qoder2pi:755"
  "qoder2pi.cmd:644"
  "workbuddy2pi:755"
  "workbuddy2pi.cmd:644"
  "tui.js:644"
)

install_ops_commands() {
  step "安装运维命令"
  mkdir -p "$BIN_DIR"
  for entry in "${OPS_FILES[@]}"; do
    name="${entry%%:*}"; mode="${entry##*:}"
    [ -f "$RES/$name" ] || { warn "缺少 $RES/${name}，跳过"; continue; }
    install -m "$mode" "$RES/$name" "$BIN_DIR/$name"
  done
  # 版本号：运维命令装在 ~/.local/bin，那里没有 package.json，
  # 所以把版本写成同目录的 version.json，界面用它显示在 banner 左上角。
  local ver
  ver="$(node -p "require('$HERE/package.json').version" 2>/dev/null || true)"
  if [ -n "$ver" ]; then
    printf '{\n  "version": "%s"\n}\n' "$ver" > "$BIN_DIR/version.json"
  fi
  ok "已安装到 ${BIN_DIR}：qodbuddy2pi 及别名 qodbuddy / qoder2pi / workbuddy2pi"

  # 上一版留下的独立国际版入口。新版把它并进总控的页签，这里清理掉，
  # 否则 PATH 上会留一个指向已删文件的命令，报错信息对用户毫无提示作用。
  cleanup_old_commands
}

cleanup_old_commands() {
  local stale=("$BIN_DIR/workbuddy2pi-global" "$BIN_DIR/workbuddy2pi-global.cmd")
  for f in "${stale[@]}"; do
    [ -e "$f" ] || continue
    if [ -L "$f" ]; then
      rm -f "$f"
    else
      mv "$f" "$f.bak-$(date +%Y%m%d%H%M%S)"
    fi
    warn "已清理旧命令 $(basename "$f")（国际版现在是总控里的一页，用页签切）"
  done
}

# ------------------------------------------------------------ 4. PATH

# 把 ~/.local/bin 写进登录 shell 的配置。先问一句，并把要改的文件打印出来。
ensure_path() {
  case ":$PATH:" in
    *":$BIN_DIR:"*) return ;;
  esac

  # 按用户的登录 shell 决定改哪个文件（和 pi 官方安装器的判定一致）
  local shell_name rc=""
  shell_name="$(basename "${SHELL:-}")"
  case "$shell_name" in
    zsh)  rc="${ZDOTDIR:-$HOME}/.zshrc" ;;
    bash) rc="$HOME/.bashrc"; [ -f "$HOME/.bash_profile" ] && rc="$HOME/.bash_profile" ;;
    fish) rc="${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish" ;;
    *)    rc="$HOME/.profile" ;;
  esac

  step "把 $BIN_DIR 加入 PATH"
  note "将要修改：$rc"
  note "将要追加：export PATH=\"$BIN_DIR:\$PATH\""
  if ! ask "改吗？（不改的话每次要自己敲完整路径）" y; then
    warn "已跳过。手动生效请执行：export PATH=\"$BIN_DIR:\$PATH\""
    return
  fi

  mkdir -p "$(dirname "$rc")"
  touch "$rc"
  if grep -qF "$BIN_DIR" "$rc" 2>/dev/null; then
    ok "$rc 里已经有 $BIN_DIR"
  elif [ "$shell_name" = "fish" ]; then
    printf '\n# qodbuddy2pi\nfish_add_path %s\n' "$BIN_DIR" >> "$rc"
    ok "已写入 $rc"
  else
    printf '\n# qodbuddy2pi\nexport PATH="%s:$PATH"\n' "$BIN_DIR" >> "$rc"
    ok "已写入 ${rc}（重开终端后生效）"
  fi
}

# ------------------------------------------------------------ 5. 探测

# 探测只此一份：调运维命令的 probe 子命令（它读 auth.json 与会话文件）。
probe_state() {
  if command -v node >/dev/null 2>&1 && [ -f "$RES/qodbuddy2pi" ]; then
    node "$RES/qodbuddy2pi" probe 2>/dev/null || echo '{}'
  else
    echo '{}'
  fi
}

# 某个 provider 是否已接入（从 probe 的 JSON 里读一个布尔值）。
probe_has() {
  local key="$1" json="$2"
  case "$json" in
    *"\"$key\":true"*) return 0 ;;
    *) return 1 ;;
  esac
}

# ------------------------------------------------------------ 6. 选择装什么

SELECTED=()

choose_providers() {
  step "决定接入哪些 provider"

  if [ "${#ONLY[@]}" -gt 0 ]; then
    for p in "${ONLY[@]}"; do
      case "$p" in
        qoder-cn|qoder|workbuddy|workbuddy-global) SELECTED+=("$p") ;;
        *) die "未知 provider：${p}（可选：${PROVIDERS[*]}）" ;;
      esac
    done
    ok "按参数指定：$(printf '%s ' "${SELECTED[@]}")"
    return
  fi

  if [ "$ALL" -eq 1 ]; then
    SELECTED=("${PROVIDERS[@]}")
    ok "全装四个 provider"
    return
  fi

  # 探测：已接入的预勾选（除非 --force-reinstall）
  local json; json="$(probe_state)"
  local already=()
  for p in "${PROVIDERS[@]}"; do
    probe_has "$p" "$json" && already+=("$p")
  done
  if [ "${#already[@]}" -eq 0 ]; then
    note "本机还没有接入任何 provider"
  else
    note "本机已接入：$(printf '%s ' "${already[@]}")"
  fi

  # 没有终端可问时按探测结果：已接入的就重装并保持，未接入的全装
  if ! can_ask; then
    SELECTED=("${PROVIDERS[@]}")
    note "没有交互终端，按探测结果继续（全部）"
    return
  fi

  echo
  note "下面逐项确认。回车表示采纳方括号里的默认值。"
  for p in "${PROVIDERS[@]}"; do
    local title; title="$(provider_title "$p")"
    local hint="" def="y"
    case "$p" in
      qoder-cn|qoder)   hint="需要 PAT，从 qoder.com${p#qoder-cn} 获取" ;;
      workbuddy)        hint="端口 8787，需要浏览器登录" ;;
      workbuddy-global) hint="端口 8788，需要浏览器登录" ;;
    esac
    if probe_has "$p" "$json"; then
      if [ "$FORCE" -eq 1 ]; then
        hint="已接入，将重装"
      else
        hint="已接入，跳过"
        def="n"
      fi
    fi
    if ask "  接入 ${title}？（${hint}）" "$def"; then
      SELECTED+=("$p")
    fi
  done

  [ "${#SELECTED[@]}" -gt 0 ] || die "什么都没选，没有可做的事"
}

# ------------------------------------------------------------ 7. 各 provider 的接入

# Qoder 的凭证落在 pi 的 auth.json，由 pi-provider-qoder 扩展负责兑换。
# 它没有常驻服务、没有端口，也不需要 uv。
install_qoder() {
  local region="$1" title="$2"
  step "接入 $title"

  local vendor="$RES/vendor/pi-provider-qoder"
  [ -f "$vendor/package.json" ] \
    || die "缺少本仓库自带的 qoder 扩展：${vendor}（请在完整仓库里运行本脚本）"

  if pi list 2>/dev/null | grep -qF 'pi-provider-qoder'; then
    ok "pi-provider-qoder 已安装，跳过"
  else
    note "安装 pi-provider-qoder 扩展（来自本仓库 assets/vendor）"
    pi install "$vendor"
  fi

  # 记下仓库路径：运维命令装到 ~/.local/bin 后不知道仓库在哪，「更新扩展」要用
  mkdir -p "$HOME/.qoder2pi"
  cat > "$HOME/.qoder2pi/config.json" <<JSON
{
  "repo": "$HERE",
  "vendorQoder": "$vendor"
}
JSON

  local provider pat_env page
  if [ "$region" = "cn" ]; then
    provider="qoder-cn"; pat_env="QODERCN_API_KEY"; page="https://qoder.com.cn/account/integrations"
  else
    provider="qoder";    pat_env="QODER_API_KEY";   page="https://qoder.com/account/integrations"
  fi

  if [ "$FORCE" -eq 0 ] && grep -q "$provider" "$HOME/.pi/agent/auth.json" 2>/dev/null; then
    ok "$title 已登录，跳过"
    return
  fi

  local pat=""
  if can_ask; then
    echo
    note "$title 需要 PAT（以 pt- 开头）。"
    note "获取地址：$page"
    printf '  粘贴 PAT（直接回车则稍后用 pi 里的 /login %s 登录）：' "$provider"
    read -r pat || pat=""
    pat="$(printf '%s' "$pat" | tr -d '[:space:]')"
  fi

  if [ -n "$pat" ]; then
    note "用 PAT 触发自动登录…"
    # 扩展在启动时检测到 PAT 环境变量会自动兑换 token 并写进 auth.json
    env "$pat_env=$pat" pi --provider "$provider" --list-models >/dev/null 2>&1 || true
    if grep -q "$provider" "$HOME/.pi/agent/auth.json" 2>/dev/null; then
      ok "$title 已登录"
      return
    fi
    warn "PAT 登录未生效"
  fi

  warn "$title 尚未登录。手动完成："
  echo "    1. 打开 $page 创建一个 PAT（pt- 开头）"
  echo "    2. 运行 pi，输入：/login $provider"
  echo "    3. 回来后运行 qodbuddy2pi 确认状态"
}

# WorkBuddy 的接入：部署扩展、补占位 key、准备凭证、注册服务。
install_workbuddy() {
  local region="$1" title="$2"
  step "接入 $title"

  local ops="$BIN_DIR/workbuddy2pi"
  [ -x "$ops" ] || die "运维命令未就绪：$ops"

  # ---------- 扩展
  mkdir -p "$EXT_DIR"
  local target="$EXT_DIR/workbuddy.ts"
  [ -f "$RES/workbuddy.ts" ] || die "资源缺失：$RES/workbuddy.ts"
  if [ -f "$target" ] && ! cmp -s "$target" "$RES/workbuddy.ts"; then
    cp -p "$target" "$target.bak-$(date +%Y%m%d%H%M%S)"
    warn "已备份原有的 workbuddy.ts"
  fi
  install -m 644 "$RES/workbuddy.ts" "$target"
  ok "已安装 $target"

  # ---------- 占位 key（本地反代不校验 key，但扩展要求 auth.json 里有这一项）
  local action; action="$(node "$RES/workbuddy2pi" ensure-auth-key)"
  case "$action" in
    added)   ok "已在 auth.json 写入占位 key（原文件已备份为 auth.json.bak）" ;;
    present) ok "auth.json 已有占位 key" ;;
    *)       die "写入 auth.json 失败：$action" ;;
  esac

  # ---------- 反代实现（固定在仓库里，不从 PyPI 拉）
  [ -d "$RES/vendor" ] || die "缺少 vendored 依赖目录：$RES/vendor"
  local wheel_src; wheel_src="$(ls -1 "$RES"/vendor/workbuddy2api-*.whl 2>/dev/null | tail -1 || true)"
  [ -n "$wheel_src" ] || die "缺少反代 wheel：$RES/vendor/workbuddy2api-*.whl"
  mkdir -p "$WB_VENDOR"
  rm -f "$WB_VENDOR"/workbuddy2api-*.whl   # 清掉旧版本，避免服务选错
  cp -p "$wheel_src" "$WB_VENDOR/"
  ok "已部署反代实现：$(basename "$wheel_src")"

  # ---------- 登录凭证
  local global_flag=()
  [ "$region" = "global" ] && global_flag=(global)
  mkdir -p "$WB_DATA"

  if [ "$FORCE" -eq 0 ] && node "$RES/workbuddy2pi" "${global_flag[@]}" check-session >/dev/null 2>&1; then
    ok "$title 已有有效凭证，跳过登录"
  else
    # 两个区域都走浏览器登录：桌面端落盘的凭证不通用（国际版是加密对象，
    # 反代会把密文当明文拼进 Authorization 头，每个请求都 401）。
    note "需要在浏览器里登录一个 ${title}账号"
    node "$RES/workbuddy2pi" "${global_flag[@]}" login \
      || die "${title}登录未完成，可重试：workbuddy2pi（切到对应页后「添加账号」）"
  fi

  # ---------- 常驻服务
  if [ "$WITH_SERVICE" -eq 1 ]; then
    node "$RES/workbuddy2pi" "${global_flag[@]}" install-service >/dev/null
    ok "已注册常驻服务"
  else
    warn "已按 --no-service 跳过；之后可在界面里「安装服务」"
  fi
}

# ------------------------------------------------------------ 8. 自检

self_check() {
  step "自检"
  sleep 2
  local bad=0
  if command -v node >/dev/null 2>&1; then
    node "$BIN_DIR/qodbuddy2pi" --check || bad=1
  else
    warn "没有 node，跳过自检"
  fi
  if [ "$bad" -eq 0 ]; then
    ok "自检通过"
  else
    warn "自检有未通过项（未接入的 provider 不算故障）"
  fi
}

# ------------------------------------------------------------ 主流程

main() {
  echo
  printf '%sQODBUDDY2PI%s  ·  把 Qoder 与 WorkBuddy 接入 pi（%s）\n' "$C_INFO" "$C_RST" "$PLATFORM"

  choose_providers

  check_pi

  # uv 只有 WorkBuddy 需要；没选 WorkBuddy 就不折腾它
  local need_uv=0
  for p in "${SELECTED[@]}"; do
    case "$p" in workbuddy|workbuddy-global) need_uv=1 ;; esac
  done
  [ "$need_uv" -eq 1 ] && check_uv

  install_ops_commands
  ensure_path

  local did_wb=0
  for p in "${SELECTED[@]}"; do
    case "$p" in
      qoder-cn)         install_qoder cn "Qoder 国内版" ;;
      qoder)            install_qoder global "Qoder 国际版" ;;
      workbuddy)        install_workbuddy domestic "WorkBuddy 国内版"; did_wb=1 ;;
      workbuddy-global) install_workbuddy global "WorkBuddy 国际版"; did_wb=1 ;;
    esac
  done

  # WorkBuddy 的凭证是后写好的，服务要重启才会用上
  if [ "$did_wb" -eq 1 ] && [ "$WITH_SERVICE" -eq 1 ]; then
    node "$RES/workbuddy2pi" restart >/dev/null 2>&1 || true
  fi

  self_check

  echo
  ok "完成。日常用："
  echo "    qodbuddy2pi          总控界面（1/2/3 或 Tab 切 provider）"
  echo "    qodbuddy2pi --check  只看环境检查"
  echo
  echo "  在 pi 里用 /model 选择模型，例如："
  echo "    pi --provider workbuddy --model deepseek-v4.1-flash"
  echo "    pi --provider qoder-cn  --model qwen3-coder-plus"
}

main
