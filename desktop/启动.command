#!/usr/bin/env bash
# ============================================================
# DancePulse 一键启动（双击运行）
# 首次运行会自动创建 .venv 并安装后端依赖，然后同时启动前后端。
# ============================================================
set -euo pipefail

# 切换到脚本所在目录（desktop/）
cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT="$(pwd)"

echo "==> 项目目录: $ROOT"

# 1. .env
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "==> 已从 .env.example 生成 .env"
fi

# 2. Python venv + 后端依赖
PYTHON_BIN="${ROOT}/.venv/bin/python"
if [ ! -x "$PYTHON_BIN" ]; then
  echo "==> 创建虚拟环境 .venv ..."
  python3 -m venv "$ROOT/.venv"
fi

if ! "$PYTHON_BIN" -c "import fastapi, uvicorn, sqlmodel" >/dev/null 2>&1; then
  echo "==> 安装后端依赖（首次较慢，需要联网）..."
  "$PYTHON_BIN" -m pip install --upgrade pip
  "$PYTHON_BIN" -m pip install -r "$ROOT/backend/requirements.txt"
fi

# 3. 前端依赖
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "==> 安装前端依赖（首次较慢，需要联网）..."
  ( cd "$ROOT/frontend" && npm install )
fi

# 4. 释放被占用的端口 8000 / 3200
export PATH="$HOME/.local/bin:$PATH"
for PORT in 8000 3200; do
  PID="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$PID" ]; then
    echo "==> 端口 $PORT 被占用 (PID $PID)，正在结束旧进程..."
    kill "$PID" 2>/dev/null || true
    sleep 1
  fi
done

# 5. 加载 .env
set -o allexport
# shellcheck disable=SC1090
source "$ROOT/.env"
set +o allexport

API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3200}"

# 6. 启动后端
echo "==> 启动后端 (port $API_PORT) ..."
( cd "$ROOT/backend" && "$PYTHON_BIN" -m uvicorn main:app --reload --host 127.0.0.1 --port "$API_PORT" ) &
BACKEND_PID=$!

sleep 2

# 7. 启动前端
echo "==> 启动前端 (port $FRONTEND_PORT) ..."
( cd "$ROOT/frontend" && npm run dev ) &
FRONTEND_PID=$!

echo ""
echo "============================================"
echo "🎵 DancePulse 已启动"
echo "  后端 Backend:  http://127.0.0.1:$API_PORT"
echo "  前端 Frontend: http://127.0.0.1:$FRONTEND_PORT"
echo "  API 文档:      http://127.0.0.1:$API_PORT/docs"
echo ""
echo "  关闭此窗口或按 Ctrl+C 停止全部服务"
echo "============================================"

cleanup() {
  echo ""
  echo "==> 停止服务..."
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# 自动打开浏览器
( sleep 4 && open "http://127.0.0.1:$FRONTEND_PORT" ) >/dev/null 2>&1 &

wait
