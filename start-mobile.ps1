# 启动 PE/手机端 (前端 :3100, 后端 :8100)
$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$ROOT\mobile\backend'; ..\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8100"
)
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "$env:NEXT_PUBLIC_API_BASE='http://127.0.0.1:8100'; $env:NEXT_PUBLIC_USE_MOCK='false'; cd '$ROOT\mobile\frontend'; npx next dev --hostname 127.0.0.1 --port 3100"
)
Write-Host "Mobile 启动中: http://127.0.0.1:3100"
Write-Host "Mobile API: http://127.0.0.1:8100"