# QodBuddy2Pi

把 Qoder 与 WorkBuddy 的订阅额度接进 pi coding agent，并提供一个统一的运维 TUI。

## Language

**Provider**:
pi 的一个模型来源，对应 pi 配置里的一段 provider 项。本项目的四个 provider 是 `qoder-cn`、`qoder`（Qoder 国际版）、`workbuddy`（WorkBuddy 国内版）、`workbuddy-global`（WorkBuddy 国际版）。
_Avoid_: 渠道、模型源、账号

**区域（Region）**:
同一家服务商在国内与国际两套独立端点上的部署。Qoder 与 WorkBuddy 各有国内版与国际版，两边的服务商接口、登录方式与可用模型都不同。区域是 provider 的属性，不是独立的 provider。
_Avoid_: 版本、站点、分站

**接入（Install）**:
把某个 provider 装进 pi 的全过程：部署扩展、准备凭证、注册服务、验证模型可见。一次接入的结果是 pi 里出现该 provider 的模型。
_Avoid_: 安装、配置、设置

**引导（Wizard）**:
接入过程中向用户逐条提问的纯文本阶段。它探测本机现状、按探测结果预选、收集用户的选择，然后把实际安装交给安装器执行。引导只在命令行发生，不在 TUI 里。
_Avoid_: 向导页、安装页面

**安装器（Installer）**:
执行接入的脚本，即 `install.sh` 与 `install.ps1`。它负责所有会改动本机的动作，包括调用 pi 的官方安装方式、部署运维命令、注册常驻服务。
_Avoid_: 安装脚本、setup、bootstrap

**运维命令（Ops command）**:
装到 `~/.local/bin` 的命令 `qodbuddy2pi` 及其别名，用于查看与操作已接入的 provider。它不改动本机，只读状态并触发运维动作。
_Avoid_: 管理工具、CLI 工具

**别名（Alias）**:
`qodbuddy2pi` 之外的名字，包括 `qodbuddy`、`workbuddy2pi`、`qoder2pi`。别名打开的是同一个完整总控界面，只是焦点预落在对应 provider 的页。别名不是第二套实现。
_Avoid_: 快捷方式、兼容命令

**反代（Proxy）**:
WorkBuddy 特有的一类本机常驻服务。它用 uv 拉起 `codebuddy_proxy`，在本机端口暴露一个与 OpenAI／Anthropic／Responses 兼容的端点，pi 的请求经它转成 WorkBuddy 的额度消耗。国内版与国际版各有一个独立实例。
_Avoid_: 中间层、网关、转发器

**凭证（Credential）**:
pi 或反代用来代表用户的登录状态。Qoder 的凭证落在 pi 的 `~/.pi/agent/auth.json`；WorkBuddy 的凭证落在 `~/.codebuddy-session.json`（国际版为 `~/.codebuddy-global-session.json`）。
_Avoid_: 登录信息、token、密钥

**账号槽位（Slot）**:
WorkBuddy 反代里一个可切换的凭证单元。同一区域可以存多个槽位，服务在任一时刻只用其中一个，用户可随时切换。
_Avoid_: 用户、配置文件

**总控（Console）**:
`qodbuddy2pi` 打开的全屏界面。它把每个 provider 收进一页，用页签切换。总控只做运维，不含接入动作。
_Avoid_: 仪表盘、主页、面板

## Relationships

- 一个 **区域** 属于一个服务商，一个 **provider** 对应一个区域。
- 一次 **接入** 产出一个或多个 provider 的可用性；**安装器** 执行接入，**引导** 只决定装什么。
- **运维命令** 是接入的产物，也是日常使用 **总控** 的入口；**别名** 是它的入口变体。
- **反代** 只存在于 WorkBuddy 的 provider 上；每个反代实例有自己的端口与 **账号槽位** 集合。
- Qoder 的 **凭证** 与 WorkBuddy 的 **凭证** 落在不同文件，互不影响。
