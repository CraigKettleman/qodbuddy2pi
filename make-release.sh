#!/usr/bin/env bash
#
# make-release.sh — 生成可直接分发的压缩包。
#
# 内容与 npm 包完全一致（都来自 npm pack 的文件清单），所以不存在两套代码：
# 这里只是把包解出来，再附一个启动脚本，让不装 npm 的人也能用。
#
# 用法：
#   ./make-release.sh                为当前平台打包
#   ./make-release.sh --all          三个平台的包都生成
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$REPO/release"
VERSION="$(node -p "require('$REPO/package.json').version")"
NAME="qodbuddy2pi-$VERSION"

TARGETS=()
case "${1:-}" in
  --all) TARGETS=(darwin-arm64 darwin-x64 linux-x64 win32-x64) ;;
  '') 
    case "$(uname -s)" in
      Darwin) TARGETS=("darwin-$(uname -m)") ;;
      Linux)  TARGETS=("linux-$(uname -m)") ;;
      *)      TARGETS=(win32-x64) ;;
    esac
    ;;
  *) TARGETS=("$1") ;;
esac

mkdir -p "$OUT"
echo "==> 打包 ${NAME}（版本 ${VERSION}）"

# 用 npm pack 得到与 npm 发布完全相同的文件集合，避免两边漂移
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(cd "$REPO" && npm pack --pack-destination "$TMP" >/dev/null 2>&1)
TARBALL="$(ls "$TMP"/*.tgz | head -1)"

for target in "${TARGETS[@]}"; do
  stage="$TMP/$NAME-$target"
  mkdir -p "$stage"
  tar -xzf "$TARBALL" -C "$stage" --strip-components=1

  # 不装 npm 的人拿到压缩包后，直接跑这个
  cat > "$stage/start.sh" <<'SH'
#!/usr/bin/env bash
# 未通过 npm 安装时用它启动总控界面。
# 它只做一件事：把总控交给 node 跑（总控自己会检查 pi 等必备环境）。
set -euo pipefail
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/assets/qodbuddy2pi" "$@"
SH
  chmod 755 "$stage/start.sh"

  printf '@echo off\r\nrem 未通过 npm 安装时用它启动总控界面。\r\nsetlocal\r\nnode "%%~dp0assets\\qodbuddy2pi" %%*\r\nexit /b %%ERRORLEVEL%%\r\n' \
    > "$stage/start.cmd"

  case "$target" in
    win32-*) archive="$OUT/$NAME-$target.zip"
             (cd "$TMP" && zip -qr "$archive" "$NAME-$target") ;;
    *)       archive="$OUT/$NAME-$target.tar.gz"
             tar -czf "$archive" -C "$TMP" "$NAME-$target" ;;
  esac
  echo "    $archive  ($(du -h "$archive" | cut -f1))"
done

echo
echo "==> 完成，产物在 $OUT/"
echo "    校验值（随产物一起发布）："
# nullglob 避免没有 zip 时 glob 原样传给命令，导致同一个文件被列两次
(cd "$OUT" && shopt -s nullglob && shasum -a 256 ./*.tar.gz ./*.zip)
