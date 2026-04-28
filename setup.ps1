# ============================================================
# 舞拍 DancePulse · Windows 一次性安装脚本
# 解压后, 在 PowerShell 里执行:
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\setup.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

function New-JunctionSafe {
    param(
        [Parameter(Mandatory=$true)][string]$Link,
        [Parameter(Mandatory=$true)][string]$Target
    )

    $linkParent = Split-Path -Parent $Link
    if (-not (Test-Path -LiteralPath $linkParent)) {
        New-Item -ItemType Directory -Path $linkParent | Out-Null
    }

    $existing = Get-Item -LiteralPath $Link -Force -ErrorAction SilentlyContinue
    if ($existing) {
        $isLink = ($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
        if (-not $isLink) {
            throw "Refusing to delete existing non-link path: $Link"
        }
        Remove-Item -LiteralPath $Link -Force
    }

    $resolvedTarget = [System.IO.Path]::GetFullPath($Target)
    if (-not (Test-Path -LiteralPath $resolvedTarget)) {
        New-Item -ItemType Directory -Path $resolvedTarget | Out-Null
    }

    New-Item -ItemType Junction -Path $Link -Target $resolvedTarget | Out-Null
    Write-Host "  $Link -> $resolvedTarget" -ForegroundColor Green
}

Write-Host "==> 安装目录: $ROOT" -ForegroundColor Cyan
Write-Host "==> 检查依赖..." -ForegroundColor Cyan
foreach ($cmd in @("python", "node", "npm", "ffmpeg")) {
    $found = Get-Command $cmd -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Warning "$cmd 未安装. 请先安装 (建议: Python 3.11+, Node 18+, FFmpeg)."
    } else {
        Write-Host "  $cmd OK" -ForegroundColor Green
    }
}

# 1. Python venv (在 dancepulse/ 下), pipeline + backend 共享一份依赖
Write-Host "`n==> 创建 Python venv (.venv)..." -ForegroundColor Cyan
$dancepulseRoot = Join-Path $ROOT "dancepulse"
Push-Location $dancepulseRoot
try {
    if (-not (Test-Path -LiteralPath ".venv")) {
        python -m venv .venv
    }
    & .\.venv\Scripts\python.exe -m pip install --upgrade pip
    & .\.venv\Scripts\python.exe -m pip install -r pipeline\requirements.txt
    & .\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
    if (Test-Path -LiteralPath teaching\requirements.txt) {
        & .\.venv\Scripts\python.exe -m pip install -r teaching\requirements.txt
    }
} finally {
    Pop-Location
}

# 2. 给 mobile / desktop 建 .venv 链接 (junction), 共享 dancepulse 的 venv
Write-Host "`n==> 链接 venv 到 mobile/ 和 desktop/..." -ForegroundColor Cyan
$venvTarget = Join-Path $ROOT "dancepulse\.venv"
foreach ($side in @("mobile", "desktop")) {
    New-JunctionSafe -Link (Join-Path $ROOT "$side\.venv") -Target $venvTarget
}

# 3. mobile / desktop 共享 dancepulse 的 backend/data + pipeline/models + rvm_weights
Write-Host "`n==> 链接共享数据 (backend/data, pipeline/models, rvm_weights)..." -ForegroundColor Cyan
foreach ($side in @("mobile", "desktop")) {
    New-JunctionSafe -Link (Join-Path $ROOT "$side\backend\data") -Target (Join-Path $ROOT "dancepulse\backend\data")
    New-JunctionSafe -Link (Join-Path $ROOT "$side\pipeline\models") -Target (Join-Path $ROOT "dancepulse\pipeline\models")
    New-JunctionSafe -Link (Join-Path $ROOT "$side\pipeline\rvm_weights") -Target (Join-Path $ROOT "dancepulse\pipeline\rvm_weights")
}

# 4. npm install (dancepulse), mobile/desktop 共享 node_modules
Write-Host "`n==> 安装前端依赖..." -ForegroundColor Cyan
Push-Location (Join-Path $ROOT "dancepulse\frontend")
try {
    npm install
} finally {
    Pop-Location
}
$nodeModulesTarget = Join-Path $ROOT "dancepulse\frontend\node_modules"
foreach ($side in @("mobile", "desktop")) {
    New-JunctionSafe -Link (Join-Path $ROOT "$side\frontend\node_modules") -Target $nodeModulesTarget
}

# 5. 处理 .env (复制 .env.example 如果还没 .env)
foreach ($side in @("dancepulse", "mobile", "desktop")) {
    $envPath = Join-Path $ROOT "$side\.env"
    $examplePath = Join-Path $ROOT "$side\.env.example"
    if (-not (Test-Path -LiteralPath $envPath) -and (Test-Path -LiteralPath $examplePath)) {
        Copy-Item -LiteralPath $examplePath -Destination $envPath
        Write-Host "  $side\.env 已生成 (从 .env.example)" -ForegroundColor Yellow
    }
}

Write-Host "`n安装完成! 启动:" -ForegroundColor Green
Write-Host "  .\start-all.ps1     (同时起 mobile + desktop 两套)"
Write-Host "  .\start-mobile.ps1  (只起 PE/手机端 :3100/:8100)"
Write-Host "  .\start-desktop.ps1 (只起 PC 端 :3200/:8200)"
