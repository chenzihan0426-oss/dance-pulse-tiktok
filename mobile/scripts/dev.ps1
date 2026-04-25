param(
  [ValidateSet("setup", "backend", "frontend", "start", "stop", "status")]
  [string]$Task = "status",
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 3000,
  [string]$ApiBase = "",
  [switch]$UseMock,
  [switch]$Restart
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$VenvPython = Join-Path $RepoRoot ".venv\Scripts\python.exe"
$ThisScript = $MyInvocation.MyCommand.Path
$ShellExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) {
  "pwsh.exe"
} else {
  "powershell.exe"
}

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Get-SetupPython {
  if (Test-Path -LiteralPath $VenvPython) {
    return $VenvPython
  }

  $uv = Get-Command uv -ErrorAction SilentlyContinue
  if ($uv) {
    try {
      $uvPython = (& $uv.Source python find 3.12 2>$null).Trim()
      if ($uvPython -and (Test-Path -LiteralPath $uvPython)) {
        return $uvPython
      }
    } catch {
    }
  }

  $python = Get-Command python -ErrorAction SilentlyContinue
  if ($python) {
    return $python.Source
  }

  throw "Python was not found. Install Python 3.12 or install uv first."
}

function Ensure-Venv {
  if (-not (Test-Path -LiteralPath $VenvPython)) {
    $pythonExe = Get-SetupPython
    Write-Step "Creating .venv with $pythonExe"
    & $pythonExe -m venv (Join-Path $RepoRoot ".venv")
  }

  $env:PYTHONUTF8 = "1"
  $env:PYTHONIOENCODING = "utf-8"
  return $VenvPython
}

function Resolve-FfmpegBin {
  $ffmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
  if ($ffmpeg) {
    return Split-Path -Parent $ffmpeg.Source
  }

  $candidateDirs = @(
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps")
  )

  foreach ($dir in $candidateDirs) {
    if ((Test-Path -LiteralPath $dir) -and (Test-Path -LiteralPath (Join-Path $dir "ffmpeg.exe"))) {
      return $dir
    }
  }

  $packagesRoot = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path -LiteralPath $packagesRoot) {
    $packageFfmpeg = Get-ChildItem -Path $packagesRoot -Filter ffmpeg.exe -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($packageFfmpeg) {
      return Split-Path -Parent $packageFfmpeg.FullName
    }
  }

  return $null
}

function Ensure-FfmpegInPath {
  $ffmpegBin = Resolve-FfmpegBin
  if (-not $ffmpegBin) {
    return $null
  }

  $pathEntries = @($env:PATH -split ";" | Where-Object { $_ })
  if ($pathEntries -notcontains $ffmpegBin) {
    $env:PATH = "$ffmpegBin;$env:PATH"
  }

  return $ffmpegBin
}

function Load-DotEnv {
  $envFile = Join-Path $RepoRoot ".env"
  if (-not (Test-Path -LiteralPath $envFile)) {
    return
  }

  foreach ($rawLine in Get-Content -LiteralPath $envFile) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      continue
    }

    $separator = $line.IndexOf("=")
    if ($separator -lt 1) {
      continue
    }

    $name = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim()
    [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

function Get-Listener {
  param([int]$Port)
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Stop-Listener {
  param([int]$Port)
  $listener = Get-Listener -Port $Port
  if ($listener) {
    try {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
    } catch {
      Write-Warning "PID $($listener.OwningProcess) was already gone while freeing port $Port."
    }
    Start-Sleep -Seconds 1
  }
}

function Assert-PortFree {
  param(
    [int]$Port,
    [string]$Name
  )

  $listener = Get-Listener -Port $Port
  if ($listener) {
    throw "$Name port $Port is already in use by PID $($listener.OwningProcess). Run .\scripts\dev.ps1 stop or pass -Restart."
  }
}

function Install-Dependencies {
  $pythonExe = Ensure-Venv

  Write-Step "Installing Python dependencies"
  & $pythonExe -m pip install --disable-pip-version-check --no-input --progress-bar off `
    -r (Join-Path $BackendDir "requirements.txt") `
    -r (Join-Path $RepoRoot "teaching\requirements.txt") `
    -r (Join-Path $RepoRoot "pipeline\requirements.txt")

  Write-Step "Installing frontend dependencies"
  Push-Location $FrontendDir
  try {
    & npm.cmd install
  } finally {
    Pop-Location
  }

  $ffmpegBin = Ensure-FfmpegInPath
  if (-not $ffmpegBin) {
    Write-Warning "ffmpeg was not found. The site can run, but clip export and video processing will be limited until ffmpeg is installed."
  } else {
    Write-Host "ffmpeg detected at $ffmpegBin"
  }

  Write-Host ""
  Write-Host "Setup complete." -ForegroundColor Green
  Write-Host "Run .\scripts\dev.ps1 start to open frontend and backend windows."
}

function Start-BackendForeground {
  if ($Restart) {
    Stop-Listener -Port $BackendPort
  }
  Assert-PortFree -Port $BackendPort -Name "Backend"

  $pythonExe = Ensure-Venv
  Load-DotEnv
  $ffmpegBin = Ensure-FfmpegInPath
  if ($ffmpegBin) {
    Write-Host "FFmpeg bin     : $ffmpegBin"
  }

  Write-Step "Starting backend on http://127.0.0.1:$BackendPort"
  Push-Location $BackendDir
  try {
    & $pythonExe -m uvicorn main:app --reload --host 127.0.0.1 --port $BackendPort
  } finally {
    Pop-Location
  }
}

function Start-FrontendForeground {
  if ($Restart) {
    Stop-Listener -Port $FrontendPort
  }
  Assert-PortFree -Port $FrontendPort -Name "Frontend"

  Load-DotEnv

  if (-not $ApiBase) {
    if ($env:NEXT_PUBLIC_API_BASE) {
      $ApiBase = $env:NEXT_PUBLIC_API_BASE
    } else {
      $ApiBase = "http://127.0.0.1:$BackendPort"
    }
  }

  $env:NEXT_PUBLIC_API_BASE = $ApiBase
  $env:NEXT_PUBLIC_USE_MOCK = if ($UseMock) { "true" } else { "false" }

  Write-Step "Starting frontend on http://127.0.0.1:$FrontendPort"
  Write-Host "NEXT_PUBLIC_API_BASE=$ApiBase"
  Write-Host "NEXT_PUBLIC_USE_MOCK=$($env:NEXT_PUBLIC_USE_MOCK)"

  Push-Location $FrontendDir
  try {
    & npm.cmd run dev
  } finally {
    Pop-Location
  }
}

function Start-InNewWindow {
  param([string]$ChildTask)

  $arguments = @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", $ThisScript,
    $ChildTask,
    "-BackendPort", $BackendPort,
    "-FrontendPort", $FrontendPort
  )

  if ($ApiBase) {
    $arguments += @("-ApiBase", $ApiBase)
  }
  if ($UseMock) {
    $arguments += "-UseMock"
  }
  if ($Restart) {
    $arguments += "-Restart"
  }

  Start-Process -FilePath $ShellExe -ArgumentList $arguments | Out-Null
}

function Show-Status {
  $backendListener = Get-Listener -Port $BackendPort
  $frontendListener = Get-Listener -Port $FrontendPort

  Write-Step "Port status"
  if ($backendListener) {
    Write-Host "Backend  : listening on 127.0.0.1:$BackendPort (PID $($backendListener.OwningProcess))"
  } else {
    Write-Host "Backend  : not listening"
  }

  if ($frontendListener) {
    Write-Host "Frontend : listening on 127.0.0.1:$FrontendPort (PID $($frontendListener.OwningProcess))"
  } else {
    Write-Host "Frontend : not listening"
  }

  if ($backendListener) {
    try {
      $ffmpegBin = Ensure-FfmpegInPath
      $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$BackendPort/health" -TimeoutSec 5
      Write-Host "Backend health: $($health.StatusCode) $($health.Content)"
      if ($ffmpegBin) {
        Write-Host "ffmpeg       : $ffmpegBin"
      }
    } catch {
      Write-Warning "Backend health check failed: $($_.Exception.Message)"
    }
  }
}

switch ($Task) {
  "setup" {
    Install-Dependencies
  }
  "backend" {
    Start-BackendForeground
  }
  "frontend" {
    Start-FrontendForeground
  }
  "start" {
    if ($Restart) {
      Stop-Listener -Port $BackendPort
      Stop-Listener -Port $FrontendPort
    } else {
      Assert-PortFree -Port $BackendPort -Name "Backend"
      Assert-PortFree -Port $FrontendPort -Name "Frontend"
    }

    Start-InNewWindow -ChildTask "backend"
    Start-Sleep -Seconds 2
    Start-InNewWindow -ChildTask "frontend"

    Write-Host ""
    Write-Host "Two dev windows have been opened." -ForegroundColor Green
    Write-Host "Backend : http://127.0.0.1:$BackendPort"
    Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
    Write-Host "Stop both with .\scripts\dev.ps1 stop"
  }
  "stop" {
    Stop-Listener -Port $BackendPort
    Stop-Listener -Port $FrontendPort
    Write-Host "Stopped listeners on ports $BackendPort and $FrontendPort." -ForegroundColor Green
  }
  "status" {
    Show-Status
  }
}
