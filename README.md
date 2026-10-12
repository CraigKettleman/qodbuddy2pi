# QodBuddy2Pi

把 **Qoder（qoderwork）** 与 **WorkBuddy（codebuddy）** 的积分额度接入 pi coding agent。
两个 provider 各自独立、互不干扰，想用哪个就跑哪一份脚本。

装好之后有一个总控界面 `qodbuddy2pi`，把三个 provider 收进一个 TUI 用页签切换：

```
 1 Qoder │ 2 WorkBuddy 国内版 │ 3 WorkBuddy 国际版
```

## 目录结构

```
qodbuddy2pi/
├── qodbuddy                            统一接入向导（在本仓库里运行）
├── qodbuddy.cmd                        Windows 上的入口
├── package.json                        npm 包定义（bin 暴露四个命令）
├── make-release.sh                     生成可分发压缩包（内容与 npm 包一致）
├── qoder2pi/                           Qoder 接入
│   ├── README.md
│   ├── install-pi-qoder.sh             macOS / Linux
│   └── install-pi-qoder.ps1            Windows
├── workbuddy2pi/                       WorkBuddy 接入
│   ├── README.md
│   ├── install-workbuddy2pi.sh         macOS / Linux
│   └── install-workbuddy2pi.ps1        Windows
├── assets/                             两个 provider 用到的依赖资源
│   ├── tui.js                          全屏界面工具箱 + PATH 查找（四个命令共用）
│   ├── qodbuddy2pi                     总控界面：三个 provider 用页签切
│   ├── qodbuddy2pi.cmd                 Windows 转发
│   ├── workbuddy2pi                    WorkBuddy 反代运维命令（国内版）
│   ├── workbuddy2pi.cmd                Windows 转发
│   ├── workbuddy2pi-global             国际版入口（复用同一份实现）
│   ├── workbuddy2pi-global.cmd         Windows 转发
│   ├── qoder2pi                        Qoder 运维命令
│   ├── qoder2pi.cmd                    Windows 转发
│   ├── wizard.js                       统一接入向导的实现
│   ├── workbuddy.ts                    注册 pi 的 workbuddy / workbuddy-global provider
│   └── vendor/                         第三方依赖副本（见下方「依赖」）
│       ├── workbuddy2api-2.0.6-py3-none-any.whl
│       ├── workbuddy2api-LICENSE
│       ├── pi-provider-qoder/          qoder provider 扩展
│       └── pi-provider-qoder-0.4.6.tgz
└── README.md
```

`assets/` 里的文件由安装脚本或 npm 部署到本机；从仓库里直接运行只有两个例外：
`qodbuddy`（统一向导）与 `assets/qodbuddy2pi`（总控）。

## 三种安装方式

**从仓库跑（最完整，推荐）**。用下面的安装脚本，它会处理依赖、登录、反代与常驻服务。

**npm**：

```bash
npm i -g qodbuddy2pi
qodbuddy2pi            # 首次运行会检查环境，并逐项问你要接入哪些 provider
```

npm 只提供命令，不自动改你的机器（不部署服务、不改 auth.json）。要装常驻服务与登录，
仍需跑仓库里的安装脚本；`qodbuddy2pi --check` 可以随时看还缺什么。

**GitHub Release**：下载对应平台的压缩包，解开后直接 `./start.sh`（Windows 用 `start.cmd`）。
内容与 npm 包完全一致，不需要装 npm。

> 若你不是 macOS / Windows 桌面环境（比如 VPS、只装 Qoder 不用 WorkBuddy 的场景），
> WorkBuddy 那份还需要 `uv`（用于拉起 Python 写的反代）；Qoder 不需要它。

## 快速开始

前置要求：**Node.js 18+**。WorkBuddy 那份还需要 `uv`（用于拉起反代）。如没有，***安装脚本会自动装！***

**交给 AI agent**（推荐✔）：把下面这句话和你要使用的提供商（如 qoder 或 workbuddy）发给它即可。

> 阅读https://github.com/CraigKettleman/qodbuddy 并按照 README.md 把我最后提供的 provider 接入本机的 pi（注意只接入我需要的 provider），严格按项目脚本完成依赖、登录、反代和服务配置，**不要手工安装依赖、不要绕过脚本、不要自行修改配置**。完成后运行项目自检，并执行 `pi --list-models`，把自检结果和新增模型列表汇报给我。

### Qoder2pi

MacOS / Linux:

```bash
# 国内版（默认），带 PAT 一步到位
./qoder2pi/install-pi-qoder.sh pt-xxxxxx

# 国际版
QODER_REGION=global ./qoder2pi/install-pi-qoder.sh pt-xxxxxx
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File qoder2pi\install-pi-qoder.ps1 pt-xxxxxx
```

PAT 获取：[国内版](https://qoder.com.cn/account/integrations) / [国际版](https://qoder.com/account/integrations)。详细说明见 [qoder2pi/README.md](qoder2pi/README.md)。

### WorkBuddy2pi

MacOS / Linux:

```bash
# 国内版
./workbuddy2pi/install-workbuddy2pi.sh

# 同时接入国际版（会引导浏览器登录）
./workbuddy2pi/install-workbuddy2pi.sh --global
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File workbuddy2pi\install-workbuddy2pi.ps1

# 同时接入国际版
powershell -ExecutionPolicy Bypass -File workbuddy2pi\install-workbuddy2pi.ps1 -Global
```

装完后直接运行 `workbuddy2pi` 进入交互界面，或 `workbuddy2pi status` 看纯文本状态；国际版把命令换成 `workbuddy2pi-global`，参数完全一样。增删账号用 `account add` 与 `account remove <key>`。详细说明、多账号机制、国内版与国际版的差异、模型可用性差异与已知坑见 [workbuddy2pi/README.md](workbuddy2pi/README.md)。

## 日常使用

装完后最常用的就是总控界面，它把三个 provider 收在一起，用 `1/2/3` 或 `Tab` 切换：

```bash
qodbuddy2pi              # 总控：三个 provider 的界面都在这里
qodbuddy2pi --check      # 只看环境检查（纯文本，适合脚本）
```

也可以直接用某个 provider 自己的界面，功能和总控里的那一页一致：

```bash
workbuddy2pi             # WorkBuddy 国内版：服务、账号、日志
workbuddy2pi-global      # WorkBuddy 国际版：同上，独立实例
qoder2pi                 # Qoder：两个区域的登录状态与扩展
```

以上命令都不带参数时就是全屏交互界面（仅在真终端里；管道或重定向会退回纯文本，方便脚本调用）。

三个 provider 的形态并不对称，界面里看到的也就不一样：WorkBuddy 是「本机反代服务 + 多账号」，
所以有切换/增删账号、重启服务这些操作；Qoder 没有服务，凭证直接存在 pi 的 `auth.json`，
所以它管的是两个区域各自的登录状态。WorkBuddy 的两个独立界面之间可以直接互跳
（菜单里的「切换到国际版/国内版界面」），在总控里则用页签切。

想装的还没装，或者只想重新装一遍：在仓库根目录跑 `./qodbuddy`，它把四份安装脚本收进一个菜单，
不用记 `QODER_REGION=global`、`--global` 这些参数。

细分命令与已知坑见两份子 README，交互界面与 region 划分见 [workbuddy2pi/README.md](workbuddy2pi/README.md)。

## 依赖

两个 provider 的**实现本体都固定在本仓库**，为保证稳定，安装脚本不会从别的仓库拉取它们：

| 依赖 | 来源 | 是否在本仓库 |
|---|---|---|
| `workbuddy2api` 2.0.6（反代实现） | PyPI | ✅ `assets/vendor/workbuddy2api-*.whl` |
| `pi-provider-qoder` 0.4.6（qoder 扩展） | npm | ✅ `assets/vendor/pi-provider-qoder/` |
| `workbuddy.ts`（pi provider 扩展） | — | ✅ `assets/workbuddy.ts` |
| Node.js | brew / winget / nodejs.org | ❌ 二进制运行时 |
| pi 本体 | npm registry | ❌ 宿主程序 |
| uv | astral.sh 官方安装脚本 | ❌ 二进制（45MB） |
| Python 传递依赖（fastapi、uvicorn、httpx、requests 等） | PyPI | ❌ 通用基础库，由 uv 解析 |

- **本仓库不 clone 任何他人的 Git 仓库**，也不从 GitHub 拉取任何东西。
- 两份第三方制品的版本、官方校验值、许可与更新方法见 [assets/vendor/README.md](assets/vendor/README.md)。
- 上面标 ❌ 的三项是运行时前置（宿主程序与二进制），物理上无法放进仓库；标 ❌ 的第四项是通用基础库，不随上游项目变动。

## 启动使用

```bash
pi --provider qoder-cn --model <模型ID>       # Qoder 国内版
pi --provider qoder --model <模型ID>          # Qoder 国际版
pi --provider workbuddy --model <模型ID>      # WorkBuddy 国内版
pi --provider workbuddy-global --model <模型ID>  # WorkBuddy 国际版
```

两个 WorkBuddy provider 对应两个独立的反代实例（国内 8787、国际 8788），可以同时使用。

***或进入 pi 后用 `/model` 选择对应 provider 下的模型（一般都这么用吧）。***

## qoder2pi与workbuddy2pi的关系

- 完全独立：两套各自的扩展、凭证与（WorkBuddy 特有的）常驻服务，可以只装其一。
- 在 pi 里并列出现：同名模型靠 provider 前缀区分，例如 `qoder-cn/xxx` 与 `workbuddy/xxx`。
- 互不覆盖：安装脚本只写自己那几个文件，重装其中一份不会影响另一份。
