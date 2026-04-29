# Start both DancePulse stacks. Child scripts skip ports that are already running.
param(
    [switch]$NoWait,
    [switch]$NoBrowser,
    [switch]$Lan,
    [switch]$ExposeDevSmsCode
)

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

$childArgs = @()
if ($NoWait) {
    $childArgs += "-NoWait"
}
if ($NoBrowser) {
    $childArgs += "-NoBrowser"
}
if ($Lan) {
    $childArgs += "-Lan"
}
if ($ExposeDevSmsCode) {
    $childArgs += "-ExposeDevSmsCode"
}

& "$ROOT\start-mobile.ps1" @childArgs
& "$ROOT\start-desktop.ps1" @childArgs

Write-Host ""
Write-Host "All stacks requested:" -ForegroundColor Green
Write-Host "  Mobile:  http://127.0.0.1:3100"
Write-Host "  Desktop: http://127.0.0.1:3200"
