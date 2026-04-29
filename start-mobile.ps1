# Start DancePulse mobile stack (frontend :3100, backend :8100).
param(
    [switch]$NoWait,
    [switch]$NoBrowser,
    [switch]$Lan,
    [switch]$SecureTunnel,
    [switch]$ExposeDevSmsCode
)

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot
$BackendPort = 8100
$FrontendPort = 3100

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

function Get-CloudflaredPath {
    $command = Get-Command cloudflared -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "cloudflared is not installed or not on PATH. Install Cloudflare cloudflared, or use .\start-mobile.ps1 -Lan without camera support."
    }
    return $command.Source
}

function Get-LatestTunnelUrl {
    param([Parameter(Mandatory=$true)][string]$LogFile)
    if (-not (Test-Path -LiteralPath $LogFile)) {
        return $null
    }

    $content = Get-Content -Raw -LiteralPath $LogFile -ErrorAction SilentlyContinue
    if (-not $content) {
        return $null
    }

    $matches = [regex]::Matches($content, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    if ($matches.Count -eq 0) {
        return $null
    }

    return $matches[$matches.Count - 1].Value
}

function Get-ExistingTunnelProcess {
    param([Parameter(Mandatory=$true)][int]$Port)
    return Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -like "*cloudflared*" -and
            $_.CommandLine -like "*tunnel*" -and
            $_.CommandLine -like "*127.0.0.1:$Port*"
        } |
        Select-Object -First 1
}

function Start-SecurePhoneTunnel {
    param(
        [Parameter(Mandatory=$true)][int]$Port,
        [Parameter(Mandatory=$true)][string]$LogFile
    )

    $existing = Get-ExistingTunnelProcess -Port $Port
    if ($existing) {
        $existingUrl = Get-LatestTunnelUrl -LogFile $LogFile
        if ($existingUrl) {
            Write-Host "Secure phone tunnel already running: $existingUrl" -ForegroundColor Green
            return $existingUrl
        }
        Write-Host "Secure phone tunnel already running (PID $($existing.ProcessId)). Check $LogFile for the URL." -ForegroundColor Yellow
        return $null
    }

    $cloudflared = Get-CloudflaredPath
    $logDir = Split-Path -Parent $LogFile
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    Remove-Item -LiteralPath $LogFile -Force -ErrorAction SilentlyContinue

    $tunnelCommand = "`$Host.UI.RawUI.WindowTitle = 'DancePulse Mobile HTTPS Tunnel'; Set-Location -LiteralPath $(ConvertTo-PSLiteral $ROOT); & $(ConvertTo-PSLiteral $cloudflared) tunnel --url http://127.0.0.1:$Port 2>&1 | Tee-Object -FilePath $(ConvertTo-PSLiteral $LogFile)"
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        $tunnelCommand
    ) | Out-Null

    if ($NoWait) {
        Write-Host "Secure phone tunnel is starting. URL will appear in $LogFile" -ForegroundColor Yellow
        return $null
    }

    for ($i = 0; $i -lt 60; $i++) {
        $url = Get-LatestTunnelUrl -LogFile $LogFile
        if ($url) {
            Write-Host "Secure phone web: $url" -ForegroundColor Green
            return $url
        }
        Start-Sleep -Seconds 1
    }

    Write-Warning "Cloudflare tunnel did not print a URL yet. Check the DancePulse Mobile HTTPS Tunnel window or $LogFile."
    return $null
}

function Stop-MobileSecureModeProcesses {
    $processIds = @()
    $processIds += Get-NetTCPConnection -LocalPort $FrontendPort,$BackendPort -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess

    $processIds += Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $PID -and (
                $_.CommandLine -like "*DancePulse Mobile*" -or
                $_.CommandLine -like "*DancePulse-\mobile\backend*" -or
                $_.CommandLine -like "*DancePulse-\mobile\frontend*" -or
                $_.CommandLine -like "*DancePulse-\mobile\.venv\Scripts\python.exe*" -or
                $_.CommandLine -like "*DancePulse-\mobile\frontend\node_modules*" -or
                (
                    $_.CommandLine -like "*cloudflared*" -and
                    $_.CommandLine -like "*127.0.0.1:$FrontendPort*"
                )
            )
        } |
        Select-Object -ExpandProperty ProcessId

    $processIds |
        Where-Object { $_ -and $_ -ne $PID } |
        Sort-Object -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

    if ($processIds) {
        Start-Sleep -Seconds 2
    }
}

$BackendDir = Join-Path $ROOT "mobile\backend"
$FrontendDir = Join-Path $ROOT "mobile\frontend"
$PythonExe = Join-Path $ROOT "mobile\.venv\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Missing Python virtual environment: $PythonExe. Run .\setup.ps1 first."
}

if (-not (Test-Path -LiteralPath (Join-Path $FrontendDir "node_modules"))) {
    Write-Warning "Missing frontend dependencies under $FrontendDir. If startup fails, run npm install there."
}

if ($SecureTunnel) {
    Stop-MobileSecureModeProcesses
}

$ListenHost = if ($Lan -and -not $SecureTunnel) { "0.0.0.0" } else { "127.0.0.1" }
$AccessHost = if ($Lan -and -not $SecureTunnel) { Get-LanAddress } else { "127.0.0.1" }
$ApiBase = if ($SecureTunnel) { "same-origin" } else { "http://$AccessHost`:$BackendPort" }
$LocalApiBase = "http://127.0.0.1:$BackendPort"
$LocalWeb = "http://127.0.0.1:$FrontendPort"
$LanWeb = "http://$AccessHost`:$FrontendPort"
$BackendOrigin = "http://127.0.0.1:$BackendPort"
$TunnelLog = Join-Path $ROOT ".codex-run-logs\mobile-cloudflared.log"
$CorsOrigins = @(
    "http://localhost:$FrontendPort",
    "http://127.0.0.1:$FrontendPort",
    $LanWeb
) | Sort-Object -Unique
$CorsOriginsValue = $CorsOrigins -join ","
$ExposeDevSmsCodeValue = if ($ExposeDevSmsCode) { "true" } else { "false" }

$BackendCommand = "`$env:DANCEPULSE_EXPOSE_DEV_SMS_CODE=$(ConvertTo-PSLiteral $ExposeDevSmsCodeValue); `$env:CORS_ORIGINS=$(ConvertTo-PSLiteral $CorsOriginsValue); Set-Location -LiteralPath $(ConvertTo-PSLiteral $BackendDir); & $(ConvertTo-PSLiteral $PythonExe) -m uvicorn main:app --host $ListenHost --port $BackendPort"
$FrontendCommand = "`$env:NEXT_PUBLIC_API_BASE=$(ConvertTo-PSLiteral $ApiBase); `$env:DANCEPULSE_BACKEND_ORIGIN=$(ConvertTo-PSLiteral $BackendOrigin); `$env:NEXT_PUBLIC_USE_MOCK='false'; Set-Location -LiteralPath $(ConvertTo-PSLiteral $FrontendDir); & npx.cmd next dev --hostname $ListenHost --port $FrontendPort"

Start-DevWindow -Name "DancePulse Mobile API" -Port $BackendPort -Command $BackendCommand | Out-Null
Wait-ForHttp -Name "DancePulse Mobile API" -Url "$LocalApiBase/health" | Out-Null

Start-DevWindow -Name "DancePulse Mobile Web" -Port $FrontendPort -Command $FrontendCommand | Out-Null
$frontendReady = Wait-ForPort -Name "DancePulse Mobile Web" -Port $FrontendPort

Write-Host ""
Write-Host "Mobile web: $LocalWeb"
Write-Host "Mobile API: $LocalApiBase"
if ($Lan) {
    Write-Host "Phone web:  $LanWeb"
    Write-Host "Phone API:  $ApiBase"
}

if ($SecureTunnel -and $frontendReady) {
    Write-Host ""
    Write-Host "Starting HTTPS tunnel for phone camera access..." -ForegroundColor Cyan
    $secureUrl = Start-SecurePhoneTunnel -Port $FrontendPort -LogFile $TunnelLog
    if ($secureUrl) {
        Write-Host "Use this on your phone for camera practice: $secureUrl" -ForegroundColor Green
    }
}

if ($frontendReady -and -not $NoBrowser) {
    Start-Process $LocalWeb | Out-Null
}
