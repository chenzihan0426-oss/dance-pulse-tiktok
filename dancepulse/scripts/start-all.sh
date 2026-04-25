#!/usr/bin/env bash
# ============================================================
# 同时启动 backend + frontend
# 用法：bash scripts/start-all.sh
# 按 Ctrl+C 同时杀两个进程
# ============================================================
set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT"
PYTHON_BIN="${ROOT}/.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  PYTHON_BIN="$(command -v python3)"
fi

# Put user-local bin first so symlinked ffmpeg / ffprobe are discovered
export PATH="$HOME/.local/bin:$PATH"

# 加载 .env
if [ -f "$ROOT/.env" ]; then
  set -o allexport
  source "$ROOT/.env"
  set +o allexport
fi

API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"

check_port_free() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "❌ 端口 $port 已被占用。"
    echo "   先执行: lsof -nP -iTCP:$port -sTCP:LISTEN"
    echo "   再停止旧进程后重新运行脚本。"
    exit 1
  fi
}

check_port_free "$API_PORT"
check_port_free "$FRONTEND_PORT"

echo "==> 启动 backend (port $API_PORT)..."
cd "$ROOT/backend"
"$PYTHON_BIN" -m uvicorn main:app --host 127.0.0.1 --port "$API_PORT" &
BACKEND_PID=$!
cd "$ROOT"

# 等后端起来
sleep 2

echo "==> 启动 frontend (port $FRONTEND_PORT)..."
cd "$ROOT/frontend"
npx next dev --hostname 127.0.0.1 --port "$FRONTEND_PORT" &
FRONTEND_PID=$!
cd "$ROOT"

echo ""
echo "============================================"
echo "🎵 DancePulse 已启动"
echo "  Backend:  http://127.0.0.1:$API_PORT"
echo "  Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo ""
echo "按 Ctrl+C 停止"
echo "============================================"

# 优雅退出
cleanup() {
  echo ""
  echo "==> 停止..."
  kill $BACKEND_PID 2>/dev/null || true
  kill $FRONTEND_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# 等任意进程退出
wait
