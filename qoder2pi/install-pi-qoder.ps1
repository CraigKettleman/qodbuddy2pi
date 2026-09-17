<#
.SYNOPSIS
  install-pi-qoder.ps1 - 一键把 Qoder 额度接入 Pi Coding Agent (Windows 版)

.DESCRIPTION
  对应 bash 版 install-pi-qoder.sh, 逻辑一致:
  1. 检查/安装 Node.js 与 Pi 本体
  2. 安装 pi-provider-qoder 扩展 (来自本仓库 assets/vendor，不连 npm)
  3. 用 PAT 自动登录或提示手动 /login
  4. 验证模型列表

  前置: Node.js 18+。
  注意: Pi 在 Windows 上的 shell 工具依赖 Git Bash, 建议同时安装
        Git for Windows: https://git-scm.com/download/win

.PARAMETER Pat
  Qoder 的 PAT (pt- 开头)。获取地址:
    国内版  https://qoder.com.cn/account/integrations
    国际版  https://qoder.com/account/integrations

.EXAMPLE
  .\install-pi-qoder.ps1 pt-xxxxxx

.EXAMPLE
  .\install-pi-qoder.ps1 pt-xxxxxx -Region global

.EXAMPLE
  # 在 cmd 里运行:
  powershell -ExecutionPolicy Bypass -File install-pi-qoder.ps1 pt-xxxxxx

.EXAMPLE
  # 不带 PAT 运行 -> 脚本会打印手动登录步骤
  .\install-pi-qoder.ps1
#>
param(
  [string]$Pat = "",
  [ValidateSet("cn", "global")]
  [string]$Region = $(if ($env:QODER_REGION) { $env:QODER_REGION } else { "cn" })
)

$ErrorActionPreference = "Stop"

function Write-Step($msg)  { Write-Host "==> $msg" -ForegroundColor Green }
function Write-Fail($msg)  { Write-Host "错误: $msg" -ForegroundColor Red; exit 1 }

# ---------- 区域配置 ----------
if ($Region -eq "cn") {
  $PatEnv   = "QODERCN_API_KEY"
  $PatPage  = "https://qoder.com.cn/account/integrations"
  $Provider = "qoder-cn"
} else {
  $PatEnv   = "QODER_API_KEY"
  $PatPage  = "https://qoder.com/account/integrations"
  $Provider = "qoder"
}

# ---------- 1. Node.js ----------
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Step "未检测到 Node.js, 尝试 winget 安装..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    # winget 装完 PATH 不一定刷新, 刷新当前会话的机器 PATH
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User")
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
      Write-Fail "winget 安装后仍未找到 node, 请关闭终端重新打开再运行本脚本"
    }
  } else {
    Write-Fail "请先安装 Node.js 18+ (https://nodejs.org) 后重新运行"
  }
}
Write-Step "Node.js $((node --version))"

# ---------- 2. Pi 本体 ----------
$pi = Get-Command pi -ErrorAction SilentlyContinue
if (-not $pi) {
  Write-Step "安装 Pi Coding Agent..."
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  $pi = Get-Command pi -ErrorAction SilentlyContinue
  if (-not $pi) { Write-Fail "pi 安装后未找到, 请关闭终端重新打开再试" }
}
Write-Step "Pi $(pi --version 2>$null)"

# ---------- 3. qoder provider 扩展 ----------
# provider 扩展用本仓库 assets/vendor 下的副本安装，不再从 npm 拉取
$VendorQoder = Join-Path (Split-Path -Parent $PSScriptRoot) "assets\vendor\pi-provider-qoder"
if (-not (Test-Path (Join-Path $VendorQoder "package.json"))) {
  Write-Fail "缺少本仓库自带的 qoder 扩展: $VendorQoder (请在完整仓库里运行本脚本)"
}
$piList = (pi list 2>$null | Out-String)
if ($piList -match "pi-provider-qoder") {
  Write-Step "pi-provider-qoder 已安装, 跳过"
} else {
  Write-Step "安装 pi-provider-qoder 扩展 (来自本仓库 assets\vendor)..."
  pi install $VendorQoder
}

# ---------- 4. 登录 ----------
$authFile = Join-Path $HOME ".pi\agent\auth.json"
$hasAuth  = (Test-Path $authFile) -and ((Get-Content $authFile -Raw -ErrorAction SilentlyContinue) -match "qoder")

if ($hasAuth) {
  Write-Step "检测到已有的 qoder 登录凭据, 跳过登录"
} elseif ($Pat -ne "") {
  Write-Step "使用 PAT 启动 Pi 触发自动登录 ($Region)..."
  # 扩展在启动时检测到 PAT 环境变量会自动兑换 token 并写入 auth.json
  Set-Item -Path "env:$PatEnv" -Value $Pat
  pi --provider $Provider --list-models 2>$null | Out-Null
  if (-not ((Test-Path $authFile) -and ((Get-Content $authFile -Raw) -match "qoder"))) {
    Write-Host "提示: 环境变量登录未生效, 请改用下方手动 /login 方式" -ForegroundColor Yellow
  }
} else {
  Write-Step "需要登录, 请完成以下手动步骤:"
  Write-Host "  1. 打开 $PatPage 创建一个 PAT (pt- 开头)"
  Write-Host "  2. 运行: pi"
  Write-Host "  3. 输入: /login $Provider"
  Write-Host "     (cn 版粘贴 PAT; global 版会打开浏览器 OAuth)"
  Write-Host "  4. 重新运行本脚本验证"
  exit 0
}

# ---------- 5. 验证 ----------
Write-Step "验证模型列表..."
Start-Sleep -Seconds 1
$models = (pi --list-models 2>$null | Out-String)
$lines  = ($models -split "`n") | Where-Object { $_ -match "^qoder" }

if ($lines.Count -gt 0) {
  Write-Host ""
  $lines | Select-Object -First 10 | ForEach-Object { Write-Host $_ }
  Write-Host ""
  Write-Step "完成! 启动方式:"
  Write-Host "  pi --provider $Provider --model <模型ID>"
  Write-Host "  或进入 pi 后用 /model 选择 qoder 下的模型"
} else {
  Write-Fail "qoder 模型未出现。请运行 pi 后输入 /login $Provider 手动登录, 再重试"
}
