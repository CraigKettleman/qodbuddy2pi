#!/usr/bin/env bash
#
# make-release.sh — 生成可直接分发的压缩包。
#
# 内容与 npm 包完全一致（都来自 npm pack 的文件清单），所以不存在两套代码：
# 这里只是把包解出来，再附两个启动脚本，让不装 npm 的人也能用。
#
# 为什么只有一个包、而不是按平台分四个：
# 本项目的产物全是平台无关的（JS / TS / JSON / Markdown，加一个
# py3-none-any 的 wheel），没有编译出的二进制。按平台分出来的四份压缩包，
# 解出来逐字节完全相同——只有最外层目录名不同。分平台只会让人以为要挑对
# 版本，以及让附件列表膨胀成八项。
#
# 两种格式各出一份：
#   .tar.gz  Unix（tar 自带）
#   .zip     Windows（资源管理器自带解压；tar.gz 在 Windows 上要另装工具）
#
# 用法：
#   ./make-release.sh                生成两种格式
#   ./make-release.sh --help
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$REPO/release"
VERSION="$(node -p "require('$REPO/package.json').version")"
NAME="qodbuddy2pi-$VERSION"

case "${1:-}" in
  -h|--help)
    sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  '') ;;
  # 旧写法（--all、平台名）保留为兼容：本脚本不再需要平台参数，识别到时给个提示继续。
  --all|darwin-*|linux-*|win32-*)
    echo "提示：现在只出一个平台无关的包，$1 这个参数已不需要（忽略）。" >&2
    ;;
  *)
    echo "未知参数：$1（用 --help 看用法）" >&2
    exit 1
    ;;
esac

mkdir -p "$OUT"
echo "==> 打包 qodbuddy2pi ${VERSION}"

# 用 npm pack 得到与 npm 发布完全相同的文件集合，避免两边漂移
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
(cd "$REPO" && npm pack --pack-destination "$TMP" >/dev/null 2>&1)
TARBALL="$(ls "$TMP"/*.tgz | head -1)"

stage="$TMP/$NAME"
mkdir -p "$stage"
tar -xzf "$TARBALL" -C "$stage" --strip-components=1

# 不装 npm 的人拿到压缩包后，直接跑这个。
# 它调真正的安装器（而不是直接开 TUI）——解压后第一次用应该是「装好」，
# 而不是进一个什么都还没接入的界面。
cat > "$stage/start.sh" <<'SH'
#!/usr/bin/env bash
# 未通过 npm 安装时的入口：跑安装器。
# 装好之后日常用 qodbuddy2pi（总控界面）。
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$HERE/install.sh" "$@"
SH
chmod 755 "$stage/start.sh"

printf '@echo off\r\nrem 未通过 npm 安装时的入口: 跑安装器。\r\nrem 装好之后日常用 qodbuddy2pi (总控界面)。\r\nsetlocal\r\npowershell -ExecutionPolicy Bypass -File "%%~dp0install.ps1" %%*\r\nexit /b %%ERRORLEVEL%%\r\n' \
  > "$stage/start.cmd"

# 两种格式各一份。文件用「不带版本号」的固定名：一行安装要从
#   https://github.com/<repo>/releases/latest/download/<固定名>
# 下载，latest 才会永远指向最新版；带版本号的名字每次发版都变，URL 写不进文档。
tar -czf "$OUT/qodbuddy2pi.tar.gz" -C "$TMP" "$NAME"
(cd "$TMP" && zip -qr "$OUT/qodbuddy2pi.zip" "$NAME")

# 再留一份带版本号的，供需要锁定版本、或想核对来源的场景
cp "$OUT/qodbuddy2pi.tar.gz" "$OUT/$NAME.tar.gz"
cp "$OUT/qodbuddy2pi.zip"    "$OUT/$NAME.zip"

echo
echo "==> 完成，产物在 $OUT/"
ls -1 "$OUT" | sed 's/^/    /'
echo
echo "==> 校验值（随产物一起发布）"
(cd "$OUT" && shasum -a 256 ./*.tar.gz ./*.zip)
