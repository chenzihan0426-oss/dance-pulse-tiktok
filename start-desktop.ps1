# 启动 PC 端 (前端 :3200, 后端 :8200)
$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$ROOT\desktop\backend'; ..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8200"
)
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "$env:NEXT_PUBLIC_API_BASE='http://127.0.0.1:8200'; $env:NEXT_PUBLIC_USE_MOCK='false'; cd '$ROOT\desktop\frontend'; npx next dev --hostname 127.0.0.1 --port 3200"
)
Write-Host "Desktop 启动中: http://127.0.0.1:3200"
Write-Host "Desktop API: http://127.0.0.1:8200"