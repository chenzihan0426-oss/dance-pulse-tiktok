# 同时启动 mobile + desktop 两套 (4 个 PowerShell 窗口)
$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

& "$ROOT\start-mobile.ps1"
Start-Sleep -Seconds 1
& "$ROOT\start-desktop.ps1"

Write-Host ""
Write-Host "全部启动:" -ForegroundColor Green
Write-Host "  Mobile:  http://127.0.0.1:3100"
Write-Host "  Desktop: http://127.0.0.1:3200"
