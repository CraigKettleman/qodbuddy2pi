# assets/vendor — 本仓库自带的第三方依赖

这里存放原本要从远端仓库/包仓库拉取的两份第三方制品，让安装脚本不再依赖上游的发版节奏、可用性或内容变更。**仓库是这些文件的唯一来源**，安装脚本只把它们复制到本机，不会再去远端取。

拉取时间：2026-09-17

| 文件 | 版本 | 来源 | 许可 | SHA-256 |
|---|---|---|---|---|
| `workbuddy2api-2.0.4-py3-none-any.whl` | 2.0.4 | PyPI 包 `workbuddy2api` | MIT，见 `workbuddy2api-LICENSE` | `8e6d5028da88978fc536eb03b62aede8d9619f89736ca9dd4f324df954173a35` |
| `workbuddy2api-LICENSE` | — | 从 wheel 内 `workbuddy2api-2.0.4.dist-info/licenses/LICENSE` 导出 | MIT © 2026 Mayer | — |
| `pi-provider-qoder/` | 0.4.5 | npm 包 `pi-provider-qoder` 解包（`dist/` + `package.json` + `README.md`） | MIT | 见下方 tarball |
| `pi-provider-qoder-0.4.5.tgz` | 0.4.5 | npm 原始 tarball，仅用于完整性复核 | MIT | `1f27a25c4f248471ecbfda3fc857faf6f833f23eaf2c6a9c72ae7578c90e7f6a` |

npm 原始 integrity（sha512）：`hGSkoUX1XqSIHqPKaJvxlNDOHXcfP7DwlsmOjL32mltQUpHaeaM73q8BwCrrmAjuPz1dusxiPX6CceYRs79SWQ==`

两个包的上游仓库分别是 PyPI 上的 `workbuddy2api`（版权人 Mayer）与 `github.com/simonsmh/pi-provider-qoder`。注意：前者**不是** GitHub 上的 `Tom6814/WorkBuddy2API`——那个仓库是同名的另一套实现，本仓库没有使用它。

## 安装脚本如何使用

| 制品 | 部署到 | 谁使用 |
|---|---|---|
| `workbuddy2api-*.whl` | `~/.workbuddy2api/vendor/` | 常驻服务的 `uv run --with <wheel>`，由 `assets/workbuddy2pi` 生成服务定义时引用 |
| `pi-provider-qoder/` | 通过 `pi install <该目录>` 登记（不复制） | pi 按包内 `package.json` 的 `pi.extensions` 加载 `./dist/index.js` |

`pi-provider-qoder` 的 `dist/index.js` 只 import `node:*` 内建模块与 pi 自身提供的 `@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent`，没有其它运行时依赖，因此直接可用、不需要 `npm install`。

## 这份 vendor **不**包含什么

以下三类无法放进仓库，仍需本机或远端提供，安装脚本会自动处理：

1. **运行时前置**：Node.js、pi 本体（`@earendil-works/pi-coding-agent`）、`uv`。它们是宿主程序与二进制运行时，无法 vendor。
2. **Python 传递依赖**：`workbuddy2api` 声明的 `fastapi>=0.104.0`、`uvicorn>=0.24.0`、`httpx[socks]>=0.25.0`、`requests>=2.31.0` 及其子依赖（starlette、pydantic、anyio 等），**仍由 `uv` 从 PyPI 解析**。这些是通用基础库，不随上游项目变动；如果你要求连它们也冻结，需要按平台分别 vendor 一批 wheel（含 pydantic-core 这类平台相关的编译产物），体积和复杂度都会上一个量级。
3. **Node.js 本身**：由 brew / winget / nodejs.org 提供。

## 如何在需要时更新

替换版本时请同时更新上表的版本号、SHA-256 与本文件的拉取时间。

```bash
# workbuddy2api：查最新版与其官方 sha256
curl -s https://pypi.org/pypi/workbuddy2api/json | python3 -c "
import sys,json; d=json.load(sys.stdin)
ver=d['info']['version']
for f in d['urls']:
    if f['filename'].endswith('.whl'): print(ver, f['url'], f['digests']['sha256'])
"

# 下载并导出 LICENSE（把 URL 换成上面查到的）
curl -sSLO <wheel-url>
python3 -c "
import zipfile,glob,pathlib
w=glob.glob('workbuddy2api-*.whl')[0]
ver=w.split('-')[1]
pathlib.Path('workbuddy2api-LICENSE').write_bytes(
  zipfile.ZipFile(w).read(f'workbuddy2api-{ver}.dist-info/licenses/LICENSE'))
"

# pi-provider-qoder：从 registry 取 tarball 与 integrity
curl -s https://registry.npmjs.org/pi-provider-qoder/latest | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(d['version'], d['dist']['tarball'], d['dist']['integrity'])
"
curl -sSLO <tarball-url>
tar -xzf pi-provider-qoder-<version>.tgz
rm -rf pi-provider-qoder && mkdir pi-provider-qoder
cp -R package/dist package/package.json package/README.md pi-provider-qoder/
```

更新后必须重跑对应的安装脚本，让本机部署同步到新版本。
