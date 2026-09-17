# QodBuddy2Pi

这是一个把 **Qoder（qoderwork）** 或 **WorkBuddy（codebuddy）**的积分额度接入 Pi 的脚本集合，运行脚本即可**自动**完成配置。两个 provider 各自独立、互不干扰，想用哪个就跑哪一份脚本。

## 目录结构

```
qodbuddy2pi/
├── qoder2pi/                           Qoder 接入
│   ├── README.md
│   ├── install-pi-qoder.sh             macOS / Linux
│   └── install-pi-qoder.ps1            Windows
├── workbuddy2pi/                       WorkBuddy 接入
│   ├── README.md
│   ├── install-workbuddy2pi.sh         macOS / Linux
│   └── install-workbuddy2pi.ps1        Windows
├── assets/                             两个 provider 用到的依赖资源
│   ├── workbuddy2pi                    WorkBuddy 反代运维命令（Node）
│   ├── workbuddy2pi.cmd                Windows 转发
│   ├── workbuddy.ts                    注册 pi 的 workbuddy provider
│   └── vendor/                         第三方依赖副本（见下方「依赖」）
│       ├── workbuddy2api-2.0.4-py3-none-any.whl
│       ├── workbuddy2api-LICENSE
│       ├── pi-provider-qoder/          qoder provider 扩展
│       └── pi-provider-qoder-0.4.5.tgz
└── README.md
```

`assets/` 里的文件由安装脚本部署到本机，不要在仓库里手工执行它们！

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
./workbuddy2pi/install-workbuddy2pi.sh
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File workbuddy2pi\install-workbuddy2pi.ps1
```

装完后用 `workbuddy2pi status` 看状态，`workbuddy2pi account b` 切账号。详细说明、多账号机制与已知坑见 [workbuddy2pi/README.md](workbuddy2pi/README.md)。

## 依赖

两个 provider 的**实现本体都固定在本仓库**，为保证稳定，安装脚本不会从别的仓库拉取它们：

| 依赖 | 来源 | 是否在本仓库 |
|---|---|---|
| `workbuddy2api` 2.0.4（反代实现） | PyPI | ✅ `assets/vendor/workbuddy2api-*.whl` |
| `pi-provider-qoder` 0.4.5（qoder 扩展） | npm | ✅ `assets/vendor/pi-provider-qoder/` |
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
pi --provider workbuddy --model <模型ID> 
```

***或进入 pi 后用 `/model` 选择对应 provider 下的模型（一般都这么用吧）。***

## qoder2pi与workbuddy2pi的关系

- 完全独立：两套各自的扩展、凭证与（WorkBuddy 特有的）常驻服务，可以只装其一。
- 在 pi 里并列出现：同名模型靠 provider 前缀区分，例如 `qoder-cn/xxx` 与 `workbuddy/xxx`。
- 互不覆盖：安装脚本只写自己那几个文件，重装其中一份不会影响另一份。
