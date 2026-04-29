# Start DancePulse desktop stack (frontend :3200, backend :8200).
param(
    [switch]$NoWait,
    [switch]$NoBrowser,
    [switch]$Lan,
    [switch]$ExposeDevSmsCode
)

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot
$BackendPort = 8200
$FrontendPort = 3200

function ConvertTo-PSLiteral {
    param([Parameter(Mandatory=$true)][string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

function Get-ListeningConnection {
    param([Parameter(Mandatory=$true)][int]$Port)
    return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

function Get-ProcessLabel {
    param([Parameter(Mandatory=$true)][int]$ProcessId)
    $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($process) {
        return $process.ProcessName
    }
    return "unknown"
}

function Get-LanAddress {
    $config = Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.IPv4Address } |
        Select-Object -First 1

    if ($config -and $config.IPv4Address) {
        return $config.IPv4Address.IPAddress
    }

    $address = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
        Select-Object -First 1 -ExpandProperty IPAddress

    if ($address) {
        return $address
    }

    return "127.0.0.1"
}

function Test-HttpReady {
    param([Parameter(Mandatory=$true)][string]$Url)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
    } catch {
        return $false
    }
}

function Wait-ForPort {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][int]$Port,
        [int]$TimeoutSeconds = 90
    )

    if ($NoWait) {
        return $true
    }

    for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
        if (Get-ListeningConnection -Port $Port) {
            Write-Host "$Name is listening on :$Port" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 1
    }

    Write-Warning "$Name did not open :$Port in $TimeoutSeconds seconds. Check the $Name PowerShell window for errors."
    return $false
}

function Wait-ForHttp {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][string]$Url,
        [int]$TimeoutSeconds = 90
    )

    if ($NoWait) {
        return $true
    }

    for ($i = 0; $i -lt $TimeoutSeconds; $i++) {
        if (Test-HttpReady -Url $Url) {
            Write-Host "$Name is ready: $Url" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 1
    }

    Write-Warning "$Name did not answer $Url in $TimeoutSeconds seconds. Check the $Name PowerShell window for errors."
    return $false
}

function Start-DevWindow {
    param(
        [Parameter(Mandatory=$true)][string]$Name,
        [Parameter(Mandatory=$true)][int]$Port,
        [Parameter(Mandatory=$true)][string]$Command
    )

    $existing = Get-ListeningConnection -Port $Port
    if ($existing) {
        $processName = Get-ProcessLabel -ProcessId $existing.OwningProcess
        Write-Host "$Name already uses :$Port (PID $($existing.OwningProcess), $processName). Skipping." -ForegroundColor Yellow
        return $false
    }

    $windowCommand = "`$Host.UI.RawUI.WindowTitle = $(ConvertTo-PSLiteral $Name); `$ErrorActionPreference = 'Stop'; $Command"
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $windowCommand
    ) | Out-Null

    Write-Host "Opened $Name window on :$Port" -ForegroundColor Green
    return $true
}

$BackendDir = Join-Path $ROOT "desktop\backend"
$FrontendDir = Join-Path $ROOT "desktop\frontend"
$PythonExe = Join-Path $ROOT "desktop\.venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Missing Python virtual environment: $PythonExe. Run .\setup.ps1 first."
}

if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
    Write-Warning "Missing frontend dependencies under $FrontendDir. If startup fails, run npm install there."
}

$ListenHost = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }
$AccessHost = if ($Lan) { Get-LanAddress } else { "127.0.0.1" }
$ApiBase = "http://$AccessHost`:$BackendPort"
$LocalApiBase = "http://127.0.0.1:$BackendPort"
$LocalWeb = "http://127.0.0.1:$FrontendPort"
$LanWeb = "http://$AccessHost`:$FrontendPort"
$CorsOrigins = @(
    "http://localhost:$FrontendPort",
    "http://127.0.0.1:$FrontendPort",
    $LanWeb
) | Sort-Object -Unique
$CorsOriginsValue = $CorsOrigins -join ","
$ExposeDevSmsCodeValue = if ($ExposeDevSmsCode) { "true" } else { "false" }

$BackendCommand = "`$env:DANCEPULSE_EXPOSE_DEV_SMS_CODE=$(ConvertTo-PSLiteral $ExposeDevSmsCodeValue); `$env:CORS_ORIGINS=$(ConvertTo-PSLiteral $CorsOriginsValue); Set-Location -LiteralPath $(ConvertTo-PSLiteral $BackendDir); & $(ConvertTo-PSLiteral $PythonExe) -m uvicorn main:app --host $ListenHost --port $BackendPort"
$FrontendCommand = "`$env:NEXT_PUBLIC_API_BASE=$(ConvertTo-PSLiteral $ApiBase); `$env:NEXT_PUBLIC_USE_MOCK='false'; Set-Location -LiteralPath $(ConvertTo-PSLiteral $FrontendDir); & npx.cmd next dev --hostname $ListenHost --port $FrontendPort"

Start-DevWindow -Name "DancePulse Desktop API" -Port $BackendPort -Command $BackendCommand | Out-Null
Wait-ForHttp -Name "DancePulse Desktop API" -Url "$LocalApiBase/health" | Out-Null

Start-DevWindow -Name "DancePulse Desktop Web" -Port $FrontendPort -Command $FrontendCommand | Out-Null
$frontendReady = Wait-ForPort -Name "DancePulse Desktop Web" -Port $FrontendPort

Write-Host ""
Write-Host "Desktop web: $LocalWeb"
Write-Host "Desktop API: $LocalApiBase"
if ($Lan) {
    Write-Host "LAN web:     $LanWeb"
    Write-Host "LAN API:     $ApiBase"
}

if ($frontendReady -and -not $NoBrowser) {
    Start-Process $LocalWeb | Out-Null
}
