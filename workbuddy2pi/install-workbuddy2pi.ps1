<#
.SYNOPSIS
  install-workbuddy2pi.ps1 - 一键把 WorkBuddy 额度接入 Pi Coding Agent (Windows 版)

.DESCRIPTION
  对应 bash 版 install-workbuddy2pi.sh, 逻辑一致:
  原理: 用 uv 拉起 PyPI 包 workbuddy2api 提供的 codebuddy_proxy, 在本机
  127.0.0.1:8787 暴露一个 OpenAI / Anthropic / Responses 兼容端点,
  再把它注册成 pi 的 workbuddy provider, 于是 pi 的请求消耗 WorkBuddy 额度。

  步骤:
  1. 检查/安装 Node.js 与 Pi 本体
  2. 检查/安装 uv
  3. 安装运维命令 workbuddy2pi
  4. 安装 pi provider 扩展并补齐占位 key
  5. 准备登录凭证 (已有则跳过 / 从桌面端登录文件导入 / 浏览器登录)
  6. 注册登录触发的计划任务并启动反代
  7. 自检

  前置: Windows 10/11。
  注意: Pi 在 Windows 上的 shell 工具依赖 Git Bash, 建议同时安装
        Git for Windows: https://git-scm.com/download/win

.PARAMETER NoService
  只装接入, 不注册计划任务。之后可运行 workbuddy2pi install-service 注册。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install-workbuddy2pi.ps1

.EXAMPLE
  .\install-workbuddy2pi.ps1 -NoService
#>
param(
  [switch]$NoService
)

$ErrorActionPreference = "Stop"

$Here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Res      = Join-Path (Split-Path -Parent $Here) "assets"
$Ops      = Join-Path $Res "workbuddy2pi"
$DataDir  = Join-Path $HOME ".workbuddy2api"
$VendorSrc = Join-Path $Res "vendor"
$VendorDst = Join-Path $DataDir "vendor"
$Live     = Join-Path $HOME ".codebuddy-session.json"
$BinDir   = Join-Path $HOME ".local\bin"
$ExtDir   = Join-Path $HOME ".pi\agent\extensions"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "! $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "错误: $msg" -ForegroundColor Red; exit 1 }
function Write-Section($msg) { Write-Host ""; Write-Host "【$msg】" -ForegroundColor Cyan }

if (-not (Test-Path $Ops)) {
  Write-Fail "资源缺失: $Ops (请在完整仓库里运行本脚本)"
}
# ---------- 1. 平台与 Node.js ----------
Write-Section "1 检查平台与 Node.js"
if (-not $IsWindows -and $env:OS -ne "Windows_NT") {
  Write-Fail "本脚本只支持 Windows。macOS / Linux 请用 install-workbuddy2pi.sh"
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Step "未检测到 Node.js, 尝试 winget 安装..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    winget install --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    # winget 装完 PATH 不一定刷新, 刷新当前会话的 PATH
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
Write-Section "2 检查 Pi Coding Agent"
if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
  Write-Step "安装 Pi Coding Agent..."
  npm install -g --ignore-scripts @earendil-works/pi-coding-agent
  if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
    Write-Fail "真奇怪，pi 安装后还是没找到，https://pi.dev/，手动到官网安装后再运行这个脚本"
  }
}
Write-Step "Pi $(pi --version 2>$null)"

# ---------- 3. uv ----------
Write-Section "3 检查 uv"
$uvCmd = Get-Command uv -ErrorAction SilentlyContinue
if ($uvCmd) {
  $Uv = $uvCmd.Source
} elseif (Test-Path (Join-Path $BinDir "uv.exe")) {
  $Uv = Join-Path $BinDir "uv.exe"
} else {
  Write-Step "安装 uv (反代由 PyPI 包 workbuddy2api 提供, 靠 uv 拉起)..."
  Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  $env:Path = "$BinDir;" + [Environment]::GetEnvironmentVariable("Path", "User") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "Machine")
  $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
  if ($uvCmd) {
    $Uv = $uvCmd.Source
  } elseif (Test-Path (Join-Path $BinDir "uv.exe")) {
    $Uv = Join-Path $BinDir "uv.exe"
  } else {
    Write-Fail "uv 安装后仍找不到, 请重开终端后重新运行本脚本"
  }
}
Write-Step "uv $(& $Uv --version)"

# ---------- 4. 运维命令 ----------
Write-Section "4 安装运维命令 workbuddy2pi"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
Copy-Item -Force $Ops (Join-Path $BinDir "workbuddy2pi")
Copy-Item -Force (Join-Path $Res "workbuddy2pi.cmd") (Join-Path $BinDir "workbuddy2pi.cmd")
Write-Step "已安装 $BinDir\workbuddy2pi.cmd"

$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
  $env:Path = "$BinDir;$env:Path"
  Write-Warn "已把 $BinDir 加入用户 PATH (当前会话已生效, 新终端也会生效)"
}

$OpsCmd = Join-Path $BinDir "workbuddy2pi.cmd"

# 上一版把账号切换做成了独立命令, 这里改为同一个程序的转发入口, 避免两套实现。
# 用 .cmd 转发而不是符号链接: 创建符号链接需要管理员权限或开发者模式。
$WbAccount = Join-Path $BinDir "wb-account.cmd"
if ((Test-Path $WbAccount) -and ((Get-Content $WbAccount -Raw) -notmatch "workbuddy2pi")) {
  Move-Item $WbAccount "$WbAccount.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
  Write-Warn "已备份旧的 wb-account.cmd"
}
"@echo off`r`n`"%~dp0workbuddy2pi.cmd`" %*`r`n" | Set-Content -Path $WbAccount -Encoding ASCII
Write-Step "wb-account.cmd 已转发到 workbuddy2pi (旧习惯的命令仍可用)"

# ---------- 5. vendored 依赖 ----------
Write-Section "5 部署本仓库自带的依赖"
if (-not (Test-Path $VendorSrc)) { Write-Fail "缺少 vendored 依赖目录: $VendorSrc" }
$wheelSrc = Get-ChildItem (Join-Path $VendorSrc "workbuddy2api-*.whl") -ErrorAction SilentlyContinue |
            Sort-Object Name | Select-Object -Last 1
if (-not $wheelSrc) { Write-Fail "缺少反代 wheel: $VendorSrc\workbuddy2api-*.whl" }
New-Item -ItemType Directory -Force -Path $VendorDst | Out-Null
# 清掉旧版本, 避免同时残留多份 wheel 让服务选错
Remove-Item (Join-Path $VendorDst "workbuddy2api-*.whl") -Force -ErrorAction SilentlyContinue
Copy-Item $wheelSrc.FullName $VendorDst -Force
$Wheel = Join-Path $VendorDst $wheelSrc.Name
Write-Step "已部署反代实现: $($wheelSrc.Name)"
Write-Step "(反代实现固定在 assets\vendor\, 不再从 PyPI 拉; 其依赖如 fastapi/uvicorn 仍由 uv 从 PyPI 解析)"

# ---------- 6. pi 扩展 ----------
Write-Section "6 安装 pi provider 扩展"
New-Item -ItemType Directory -Force -Path $ExtDir | Out-Null
$ExtTarget = Join-Path $ExtDir "workbuddy.ts"
$ExtSource = Join-Path $Res "workbuddy.ts"
if ((Test-Path $ExtTarget) -and
    ((Get-FileHash $ExtTarget).Hash -ne (Get-FileHash $ExtSource).Hash)) {
  Copy-Item $ExtTarget "$ExtTarget.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
  Write-Warn "已备份原有的 workbuddy.ts"
}
Copy-Item -Force $ExtSource $ExtTarget
Write-Step "已安装 $ExtTarget"

$authAction = & node $Ops ensure-auth-key
switch ($authAction) {
  "added"   { Write-Step "已在 auth.json 写入 workbuddy 占位 key (原文件已备份为 auth.json.bak)" }
  "present" { Write-Step "auth.json 已有 workbuddy key" }
  default   { Write-Fail "写入 auth.json 失败: $authAction" }
}

# ---------- 7. 登录凭证 ----------
Write-Section "7 准备登录凭证"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

node $Ops check-session
if ($LASTEXITCODE -eq 0) {
  Write-Step "已有有效的 WorkBuddy 凭证, 跳过登录"
} else {
  Write-Step "未发现有效凭证, 尝试从 WorkBuddy 桌面端登录文件导入..."
  node $Ops import-session 2>$null | Out-Null
  node $Ops check-session
  if ($LASTEXITCODE -eq 0) {
    Write-Step "导入成功"
  } else {
    Write-Warn "本机没有可直接导入的 WorkBuddy 桌面端登录文件, 改用浏览器登录"
    $argLine = "run --with `"$Wheel`" python -m codebuddy_proxy " +
               "--host 127.0.0.1 --port 8790 --login " +
               "--log-file `"$DataDir\bootstrap-login.jsonl`""
    $boot = Start-Process -FilePath $Uv -ArgumentList $argLine -PassThru -WindowStyle Hidden
    Write-Step "请在浏览器中完成 WorkBuddy 登录 (最多等待 5 分钟)..."
    $waited = 0
    while ($waited -lt 300) {
      Start-Sleep -Seconds 3
      $waited += 3
      node $Ops check-session
      if ($LASTEXITCODE -eq 0) { break }
    }
    taskkill /PID $boot.Id /T /F 2>$null | Out-Null
    node $Ops check-session
    if ($LASTEXITCODE -ne 0) {
      Write-Fail "登录未完成或超时。请重新运行本脚本, 或手动执行:`n      $Uv run --with `"$Wheel`" python -m codebuddy_proxy --login"
    }
    Write-Step "登录完成, 凭证已写入 $Live"
  }
}

# ---------- 8. 常驻服务 ----------
Write-Section "8 注册常驻服务"
if ($NoService) {
  Write-Warn "已按 -NoService 跳过; 之后可执行 workbuddy2pi install-service 注册"
} else {
  # 服务由运维命令统一注册, 与 bash 版共用同一套平台逻辑
  & $OpsCmd install-service
  if ($LASTEXITCODE -ne 0) { Write-Fail "注册计划任务失败" }
}

# ---------- 9. 自检 ----------
Write-Section "9 自检"
Start-Sleep -Seconds 3
& $OpsCmd doctor
if ($LASTEXITCODE -ne 0) { Write-Fail "自检未通过, 请按上面的提示逐项处理" }

Write-Host ""
Write-Step "完成! 在 pi 里用 /model 选择 workbuddy 下的模型, 或:"
Write-Host "  pi --provider workbuddy --model deepseek-v4.1-flash"
Write-Host ""
Write-Host "日常维护:"
Write-Host "  workbuddy2pi status            查看服务与账号"
Write-Host "  workbuddy2pi account b         切换到第二个账号"
Write-Host "  workbuddy2pi account renew     续期凭证"
Write-Host "  workbuddy2pi logs              查看反代日志"
