<#
.SYNOPSIS
  install.ps1 - 把 Qoder 与 WorkBuddy 接入 pi coding agent (Windows)

.DESCRIPTION
  对应 install.sh，逻辑一致；只有平台差异不同：

    install.sh              install.ps1
    ----------------------  ---------------------------
    brew / 官方 curl 装 pi   官方 irm 装 pi（会自己处理 Node 与 Git Bash）
    ~/.local/bin            %USERPROFILE%\.local\bin
    写 shell rc 文件         写 HKCU 的 User PATH
    launchd / systemd       登录触发的计划任务
    curl | sh               irm | iex

  接入哪些 provider 由探测决定，逐项确认；也可以用参数跳过提问。

  pi 本身用官方安装方式（irm https://pi.dev/install.ps1 | iex），不再自己装
  Node：官方安装器会按需安装 Node 并强制 22.19+，没有 bash.exe 时还会引导
  安装 Git Bash（pi 在原生 Windows 上要靠它执行 bash 命令）。

.PARAMETER All
  全装四个 provider，不提问。

.PARAMETER Only
  只装指定的 provider，逗号分隔。取值：qoder-cn, qoder, workbuddy, workbuddy-global

.PARAMETER NoService
  只装接入，不注册计划任务。之后可在总控界面里「安装服务」。

.PARAMETER NonInteractive
  不提问，按探测结果全装。供自动化使用。

.PARAMETER ForceReinstall
  即使已接入也重装一遍。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1

.EXAMPLE
  .\install.ps1 -Only qoder-cn

.EXAMPLE
  .\install.ps1 -All -NoService
#>
param(
  [switch]$All,
  [string]$Only = "",
  [switch]$NoService,
  [switch]$NonInteractive,
  [switch]$ForceReinstall
)

$ErrorActionPreference = "Stop"

# ------------------------------------------------------------ 一行安装引导
#
# Windows 的一行流是 irm ... | iex，脚本在 pwsh 会话里求值，终端还在（这点与
# bash 的 curl|sh 不同，不需要把 /dev/tty 抢回来）。但从 iex 跑时
# $MyInvocation.MyCommand.Path 是空的，旁边也没有 assets/，所以这里先下载
# 对应平台的 zip 解到临时目录，再用 -File 跑里面那份真正的安装器。
# 仓库内直接跑、release 包里的 start.cmd 都跳过这段。
$ScriptPath = $MyInvocation.MyCommand.Path
$NeedsBootstrap = $env:QODBUDDY_BOOTSTRAPPED -ne "1" -and (
  [string]::IsNullOrWhiteSpace($ScriptPath) -or
  -not (Test-Path (Join-Path (Split-Path -Parent $ScriptPath) "assets\tui.js"))
)

if ($NeedsBootstrap) {
  Write-Host "==> QodBuddy2Pi 安装器"
  # 包是平台无关的（纯 JS/TS/JSON，没有编译产物），只有一种 zip，不按平台分档。
  $asset = "qodbuddy2pi.zip"
  $base = if ($env:QODBUDDY_RELEASE_URL) { $env:QODBUDDY_RELEASE_URL } else {
    "https://github.com/CraigKettleman/qoder2pi/releases/latest/download"
  }
  $url = "$base/$asset"

  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("qodbuddy2pi-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmp | Out-Null
  $zip = Join-Path $tmp "pkg.zip"

  Write-Host "==> 下载 $asset"
  try {
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
  } catch {
    Write-Host "错误: 下载失败：$url" -ForegroundColor Red
    Write-Host "      可能还没有对应平台的 release。也可以改用克隆仓库的方式：" -ForegroundColor Red
    Write-Host "        git clone https://github.com/CraigKettleman/qoder2pi; cd qoder2pi; .\install.ps1" -ForegroundColor Red
    exit 1
  }
  Expand-Archive -Path $zip -DestinationPath $tmp -Force

  $inner = Get-ChildItem -Path $tmp -Recurse -Filter "install.ps1" |
           Where-Object { $_.Directory.Name -like "qodbuddy2pi-*" } |
           Select-Object -First 1
  if (-not $inner) { Write-Host "错误: 压缩包里没找到 install.ps1" -ForegroundColor Red; exit 1 }

  Write-Host "==> 进入安装器（下面开始提问）"
  $env:QODBUDDY_BOOTSTRAPPED = "1"
  & pwsh -NoProfile -ExecutionPolicy Bypass -File $inner.FullName @args
  $code = $LASTEXITCODE
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  exit $code
}

$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$Res     = Join-Path $Here "assets"
$BinDir  = Join-Path $HOME ".local\bin"
$ExtDir  = Join-Path $HOME ".pi\agent\extensions"
$WbData  = Join-Path $HOME ".workbuddy2api"
$WbVendor = Join-Path $WbData "vendor"

$WithService = -not ($PSBoundParameters['NoService'] -eq $true)
$Force = $PSBoundParameters['ForceReinstall'] -eq $true
$AllFlag = $PSBoundParameters['All'] -eq $true
$NoAsk = $PSBoundParameters['NonInteractive'] -eq $true

# ------------------------------------------------------------ 输出

function Write-Step($m)    { Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok($m)      { Write-Host "OK  $m" -ForegroundColor Green }
function Write-Warn2($m)   { Write-Host "!   $m" -ForegroundColor Yellow }
function Write-Note($m)    { Write-Host "    $m" -ForegroundColor DarkGray }
function Write-Fail($m)    { Write-Host "错误: $m" -ForegroundColor Red; exit 1 }

# 有真终端才能提问
function Can-Ask { return (-not $NoAsk) -and (-not [Console]::IsInputRedirected) }

function Ask($q, $def = "n") {
  if (-not (Can-Ask)) { return ($def -eq "y") }
  $suffix = if ($def -eq "y") { " [Y/n] " } else { " [y/N] " }
  $ans = Read-Host "$q$suffix"
  if ([string]::IsNullOrWhiteSpace($ans)) { $ans = $def }
  return ($ans -match '^(y|yes|Y|YES)$')
}

# ------------------------------------------------------------ provider

$PROVIDERS = @("qoder-cn", "qoder", "workbuddy", "workbuddy-global")

function Get-ProviderTitle($p) {
  switch ($p) {
    "qoder-cn"         { "Qoder 国内版" }
    "qoder"            { "Qoder 国际版" }
    "workbuddy"        { "WorkBuddy 国内版" }
    "workbuddy-global" { "WorkBuddy 国际版" }
    default            { $p }
  }
}

# ------------------------------------------------------------ 资源检查

foreach ($f in @("tui.js", "qodbuddy2pi", "qoder2pi", "workbuddy2pi")) {
  if (-not (Test-Path (Join-Path $Res $f))) {
    Write-Fail "资源缺失: $(Join-Path $Res $f) (请在完整仓库里运行本脚本)"
  }
}

# ------------------------------------------------------------ 1. pi

function Install-Pi {
  Write-Step "安装 pi coding agent (官方安装器)"
  Write-Note "官方安装器可能会自行安装 Node.js (要求 22.19+) 与 Git Bash, 并询问是否写入 PATH。"
  # 官方 Windows 安装方式。不用管理员权限: PATH 写 HKCU, Node 放 %LOCALAPPDATA%。
  Invoke-RestMethod https://pi.dev/install.ps1 | Invoke-Expression
}

function Test-Pi {
  Write-Step "检查 pi"
  Refresh-Path
  if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
    Write-Warn2 "未找到 pi"
    Install-Pi
    Refresh-Path
    if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
      Write-Fail "pi 装好后仍不在 PATH 上, 请关闭终端重新打开再运行本脚本"
    }
  }
  Write-Ok "pi $(& pi --version 2>$null)"
}

# winget / 官方安装器装完 PATH 不一定刷新, 重新读一次 Machine + User
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User") + ";" +
              $env:Path
}

# ------------------------------------------------------------ 2. uv

# 只有 WorkBuddy 需要 uv (它用 uv 拉起 Python 写的反代)。Qoder 不需要。
function Test-Uv {
  Write-Step "检查 uv (WorkBuddy 反代需要)"
  $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
  if ($uvCmd) { Write-Ok "uv $(& $uvCmd.Source --version)"; return }

  $local = Join-Path $BinDir "uv.exe"
  if (Test-Path $local) { Write-Ok "uv $(& $local --version)"; return }

  Write-Note "安装 uv (反代由 PyPI 包 workbuddy2api 提供, 靠 uv 拉起)"
  Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression
  Refresh-Path
  $uvCmd = Get-Command uv -ErrorAction SilentlyContinue
  if ($uvCmd) { Write-Ok "uv $(& $uvCmd.Source --version)"; return }
  if (Test-Path $local) { Write-Ok "uv $(& $local --version)"; return }
  Write-Fail "uv 安装后仍找不到, 请重开终端后重新运行本脚本"
}

# ------------------------------------------------------------ 3. 运维命令

# 一份清单驱动部署, 与 install.sh 及 npm 的 bin 字段保持一致。
# 早先每个命令各配一个手写的 .cmd, 内容几乎相同, 容易漂移。
$OPS_FILES = @(
  "qodbuddy2pi", "qodbuddy2pi.cmd",
  "qodbuddy", "qodbuddy.cmd",
  "qoder2pi", "qoder2pi.cmd",
  "workbuddy2pi", "workbuddy2pi.cmd",
  "tui.js"
)

function Install-OpsCommands {
  Write-Step "安装运维命令"
  New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
  foreach ($name in $OPS_FILES) {
    $src = Join-Path $Res $name
    if (-not (Test-Path $src)) { Write-Warn2 "缺少 $src, 跳过"; continue }
    Copy-Item -Force $src (Join-Path $BinDir $name)
  }
  # 版本号: 运维命令装在 ~\.local\bin, 那里没有 package.json,
  # 所以把版本写成同目录的 version.json, 界面用它显示在 banner 左上角。
  try {
    $ver = (Get-Content (Join-Path $Here "package.json") -Raw | ConvertFrom-Json).version
    if ($ver) {
      # 必须写无 BOM 的 UTF-8：PowerShell 5.1 的 `-Encoding UTF8` 会加 BOM，
      # 而 JSON.parse 遇到 BOM 直接抛，界面就读不到版本号了。
      $json = @{ version = $ver } | ConvertTo-Json
      [System.IO.File]::WriteAllText((Join-Path $BinDir "version.json"), $json,
        (New-Object System.Text.UTF8Encoding($false)))
    }
  } catch { }
  Write-Ok "已安装到 ${BinDir}: qodbuddy2pi 及别名 qodbuddy / qoder2pi / workbuddy2pi"
  Remove-StaleCommands
}

# 上一版留下的独立国际版入口。新版把它并进总控的页签, 这里清理掉,
# 否则 PATH 上会留一个指向已删文件的命令, 报错信息对用户毫无提示作用。
function Remove-StaleCommands {
  foreach ($name in @("workbuddy2pi-global", "workbuddy2pi-global.cmd")) {
    $f = Join-Path $BinDir $name
    if (-not (Test-Path $f)) { continue }
    $bak = "$f.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
    Move-Item -Force $f $bak
    Write-Warn2 "已清理旧命令 $name (国际版现在是总控里的一页, 用页签切)"
  }
}

# ------------------------------------------------------------ 4. PATH

# 把 %USERPROFILE%\.local\bin 写进 User PATH。先问一句, 并把要改的位置打印出来。
function Add-ToUserPath {
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($userPath -like "*$BinDir*") { return }

  Write-Step "把 $BinDir 加入 PATH"
  Write-Note "将要修改: HKCU\Environment 的 Path (用户级, 不需要管理员权限)"
  Write-Note "将要追加: $BinDir"
  if (-not (Ask "改吗? (不改的话每次要自己敲完整路径)" "y")) {
    Write-Warn2 "已跳过。手动生效: `$env:Path = `"$BinDir;`$env:Path`""
    return
  }

  [Environment]::SetEnvironmentVariable("Path", "$BinDir;$userPath", "User")
  $env:Path = "$BinDir;$env:Path"
  Write-Ok "已写入用户 PATH (当前会话已生效, 新终端也会生效)"
}

# ------------------------------------------------------------ 5. 探测

# 探测只此一份: 调运维命令的 probe 子命令 (它读 auth.json 与会话文件)。
function Get-ProbeJson {
  $ops = Join-Path $Res "qodbuddy2pi"
  if (-not (Test-Path $ops)) { return "{}" }
  try { return (& node $ops probe | Out-String) } catch { return "{}" }
}

function Test-ProbeHas($key, $json) {
  return $json -match "`"$([regex]::Escape($key))`":true"
}

# ------------------------------------------------------------ 6. 选择装什么

$Selected = @()

function Select-Providers {
  Write-Step "决定接入哪些 provider"

  if (-not [string]::IsNullOrWhiteSpace($Only)) {
    foreach ($p in ($Only -split ",")) {
      $t = $p.Trim()
      if ([string]::IsNullOrWhiteSpace($t)) { continue }
      if ($PROVIDERS -notcontains $t) {
        Write-Fail "未知 provider: $t (可选: $($PROVIDERS -join ', '))"
      }
      $script:Selected += $t
    }
    Write-Ok "按参数指定: $($Selected -join ' ')"
    return
  }

  if ($AllFlag) {
    $script:Selected = $PROVIDERS
    Write-Ok "全装四个 provider"
    return
  }

  $json = Get-ProbeJson
  $already = @()
  foreach ($p in $PROVIDERS) { if (Test-ProbeHas $p $json) { $already += $p } }
  if ($already.Count -eq 0) { Write-Note "本机还没有接入任何 provider" }
  else { Write-Note "本机已接入: $($already -join ' ')" }

  if (-not (Can-Ask)) {
    $script:Selected = $PROVIDERS
    Write-Note "没有交互终端, 按探测结果继续 (全部)"
    return
  }

  Write-Host ""
  Write-Note "下面逐项确认。回车表示采纳方括号里的默认值。"
  foreach ($p in $PROVIDERS) {
    $title = Get-ProviderTitle $p
    $hint = switch ($p) {
      "qoder-cn"         { "需要 PAT, 从 qoder.com.cn 获取" }
      "qoder"            { "需要 PAT, 从 qoder.com 获取" }
      "workbuddy"        { "端口 8787, 需要浏览器登录" }
      "workbuddy-global" { "端口 8788, 需要浏览器登录" }
    }
    $def = "y"
    if (Test-ProbeHas $p $json) {
      if ($Force) { $hint = "已接入, 将重装" }
      else { $hint = "已接入, 跳过"; $def = "n" }
    }
    if (Ask "  接入 $title ? ($hint)" $def) { $script:Selected += $p }
  }

  if ($Selected.Count -eq 0) { Write-Fail "什么都没选, 没有可做的事" }
}

# ------------------------------------------------------------ 7. 各 provider 的接入

# Qoder 的凭证落在 pi 的 auth.json, 由 pi-provider-qoder 扩展负责兑换。
# 它没有常驻服务、没有端口, 也不需要 uv。
function Install-Qoder($region, $title) {
  Write-Step "接入 $title"

  $vendor = Join-Path $Res "vendor\pi-provider-qoder"
  if (-not (Test-Path (Join-Path $vendor "package.json"))) {
    Write-Fail "缺少本仓库自带的 qoder 扩展: $vendor (请在完整仓库里运行本脚本)"
  }

  # 扩展先复制到 ~\.qoder2pi\vendor 再装: pi install 记录的是路径引用而不是副本,
  # 直接指向仓库或临时解压目录的话, 仓库挪走 / release 包解压目录被删之后 provider 就失效。
  $stable = Join-Path $HOME ".qoder2pi\vendor\pi-provider-qoder"
  New-Item -ItemType Directory -Force -Path (Join-Path $HOME ".qoder2pi\vendor") | Out-Null
  if (Test-Path $stable) { Remove-Item -Recurse -Force $stable }
  Copy-Item -Recurse -Force $vendor $stable

  $listed = & pi list 2>$null | Out-String
  if ($listed -match "pi-provider-qoder") {
    Write-Ok "pi-provider-qoder 已安装 (副本已刷新到 $stable)"
  } else {
    Write-Note "安装 pi-provider-qoder 扩展 (副本 $stable)"
    & pi install $stable
  }

  # 记下路径: 运维命令装到 ~\.local\bin 后不知道仓库在哪, 「更新扩展」要用。
  # vendorQoder 指向稳定副本而不是仓库, 这样仓库删了也能重装扩展。
  $cfgDir = Join-Path $HOME ".qoder2pi"
  New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
  $cfg = @{ repo = $Here; vendorQoder = $stable } | ConvertTo-Json
  [System.IO.File]::WriteAllText((Join-Path $cfgDir "config.json"), $cfg,
    (New-Object System.Text.UTF8Encoding($false)))

  if ($region -eq "cn") {
    $provider = "qoder-cn"; $patEnv = "QODERCN_API_KEY"; $page = "https://qoder.com.cn/account/integrations"
  } else {
    $provider = "qoder";    $patEnv = "QODER_API_KEY";   $page = "https://qoder.com/account/integrations"
  }

  $authFile = Join-Path $HOME ".pi\agent\auth.json"
  if (-not $Force -and (Test-Path $authFile)) {
    $auth = Get-Content $authFile -Raw
    if ($auth -match $provider) { Write-Ok "$title 已登录, 跳过"; return }
  }

  $pat = ""
  if (Can-Ask) {
    Write-Host ""
    Write-Note "$title 需要 PAT (以 pt- 开头)。"
    Write-Note "获取地址: $page"
    $pat = (Read-Host "  粘贴 PAT (直接回车则稍后用 pi 里的 /login $provider 登录)").Trim()
  }

  if (-not [string]::IsNullOrWhiteSpace($pat)) {
    Write-Note "用 PAT 触发自动登录..."
    # 扩展在启动时检测到 PAT 环境变量会自动兑换 token 并写进 auth.json。
    # 只设当前进程的环境变量: PAT 不该落在用户环境里。
    Set-Item -Path "env:$patEnv" -Value $pat
    & pi --provider $provider --list-models 2>$null | Out-Null
    Remove-Item -Path "env:$patEnv" -ErrorAction SilentlyContinue
    if ((Test-Path $authFile) -and ((Get-Content $authFile -Raw) -match $provider)) {
      Write-Ok "$title 已登录"
      return
    }
    Write-Warn2 "PAT 登录未生效"
  }

  Write-Warn2 "$title 尚未登录。手动完成:"
  Write-Host "    1. 打开 $page 创建一个 PAT (pt- 开头)"
  Write-Host "    2. 运行 pi, 输入: /login $provider"
  Write-Host "    3. 回来后运行 qodbuddy2pi 确认状态"
}

# WorkBuddy 的接入: 部署扩展、补占位 key、准备凭证、注册服务。
function Install-WorkBuddy($region, $title) {
  Write-Step "接入 $title"

  $ops = Join-Path $BinDir "workbuddy2pi"
  if (-not (Test-Path $ops)) { Write-Fail "运维命令未就绪: $ops" }
  $opsCmd = Join-Path $BinDir "workbuddy2pi.cmd"

  # ---------- 扩展
  New-Item -ItemType Directory -Force -Path $ExtDir | Out-Null
  $extSrc = Join-Path $Res "workbuddy.ts"
  $extDst = Join-Path $ExtDir "workbuddy.ts"
  if (-not (Test-Path $extSrc)) { Write-Fail "资源缺失: $extSrc" }
  if ((Test-Path $extDst) -and
      ((Get-FileHash $extDst).Hash -ne (Get-FileHash $extSrc).Hash)) {
    Copy-Item $extDst "$extDst.bak-$(Get-Date -Format 'yyyyMMddHHmmss')"
    Write-Warn2 "已备份原有的 workbuddy.ts"
  }
  Copy-Item -Force $extSrc $extDst
  Write-Ok "已安装 $extDst"

  # ---------- 占位 key (本地反代不校验 key, 但扩展要求 auth.json 里有这一项)
  $action = (& node (Join-Path $Res "workbuddy2pi") ensure-auth-key | Out-String).Trim()
  switch ($action) {
    "added"   { Write-Ok "已在 auth.json 写入占位 key (原文件已备份为 auth.json.bak)" }
    "present" { Write-Ok "auth.json 已有占位 key" }
    default   { Write-Fail "写入 auth.json 失败: $action" }
  }

  # ---------- 反代实现 (固定在仓库里, 不从 PyPI 拉)
  $vendorSrc = Join-Path $Res "vendor"
  if (-not (Test-Path $vendorSrc)) { Write-Fail "缺少 vendored 依赖目录: $vendorSrc" }
  $wheelSrc = Get-ChildItem (Join-Path $vendorSrc "workbuddy2api-*.whl") -ErrorAction SilentlyContinue |
              Sort-Object Name | Select-Object -Last 1
  if (-not $wheelSrc) { Write-Fail "缺少反代 wheel: $vendorSrc\workbuddy2api-*.whl" }
  New-Item -ItemType Directory -Force -Path $WbVendor | Out-Null
  Get-ChildItem (Join-Path $WbVendor "workbuddy2api-*.whl") -ErrorAction SilentlyContinue |
    Remove-Item -Force   # 清掉旧版本, 避免服务选错
  Copy-Item -Force $wheelSrc.FullName $WbVendor
  Write-Ok "已部署反代实现: $($wheelSrc.Name)"

  # ---------- 登录凭证
  $globalArgs = @()
  if ($region -eq "global") { $globalArgs = @("global") }
  New-Item -ItemType Directory -Force -Path $WbData | Out-Null

  & node (Join-Path $Res "workbuddy2pi") @globalArgs check-session 2>$null | Out-Null
  $hasSession = ($LASTEXITCODE -eq 0) -and (-not $Force)
  if ($hasSession) {
    Write-Ok "$title 已有有效凭证, 跳过登录"
  } else {
    # 两个区域都走浏览器登录: 桌面端落盘的凭证不通用 (国际版是 {$wbEncrypted:...}
    # 加密对象, 反代会把密文当明文拼进 Authorization 头, 每个请求都 401)。
    Write-Note "需要在浏览器里登录一个 ${title}账号"
    & node (Join-Path $Res "workbuddy2pi") @globalArgs login
    if ($LASTEXITCODE -ne 0) { Write-Fail "$title 登录未完成, 可在总控对应页里「添加账号」重试" }
  }

  # ---------- 常驻服务
  if ($WithService) {
    & $opsCmd @globalArgs install-service | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Fail "注册计划任务失败" }
    Write-Ok "已注册登录触发的计划任务"
  } else {
    Write-Warn2 "已按 -NoService 跳过; 之后可在界面里「安装服务」"
  }
}

# ------------------------------------------------------------ 8. 自检

function Invoke-SelfCheck {
  Write-Step "自检"
  Start-Sleep -Seconds 2
  $check = Join-Path $BinDir "qodbuddy2pi.cmd"
  & $check --check
  if ($LASTEXITCODE -eq 0) { Write-Ok "自检通过" }
  else { Write-Warn2 "自检有未通过项 (未接入的 provider 不算故障)" }
}

# ------------------------------------------------------------ 主流程

Write-Host ""
Write-Host "QODBUDDY2PI  ·  把 Qoder 与 WorkBuddy 接入 pi (Windows)" -ForegroundColor Cyan

Select-Providers
Test-Pi

# uv 只有 WorkBuddy 需要; 没选 WorkBuddy 就不折腾它
$needUv = $false
foreach ($p in $Selected) { if ($p -eq "workbuddy" -or $p -eq "workbuddy-global") { $needUv = $true } }
if ($needUv) { Test-Uv }

Install-OpsCommands
Add-ToUserPath

$didWb = $false
foreach ($p in $Selected) {
  switch ($p) {
    "qoder-cn"         { Install-Qoder "cn" "Qoder 国内版" }
    "qoder"            { Install-Qoder "global" "Qoder 国际版" }
    "workbuddy"        { Install-WorkBuddy "domestic" "WorkBuddy 国内版"; $didWb = $true }
    "workbuddy-global" { Install-WorkBuddy "global" "WorkBuddy 国际版"; $didWb = $true }
  }
}

# WorkBuddy 的凭证是后写好的, 服务要重启才会用上
if ($didWb -and $WithService) {
  & node (Join-Path $Res "workbuddy2pi") restart 2>$null | Out-Null
}

Invoke-SelfCheck

Write-Host ""
Write-Ok "完成。日常用:"
Write-Host "    qodbuddy2pi          总控界面 (1/2/3 或 Tab 切 provider)"
Write-Host "    qodbuddy2pi --check  只看环境检查"
Write-Host ""
Write-Host "  在 pi 里用 /model 选择模型, 例如:"
Write-Host "    pi --provider workbuddy --model deepseek-v4.1-flash"
Write-Host "    pi --provider qoder-cn  --model qwen3-coder-plus"
