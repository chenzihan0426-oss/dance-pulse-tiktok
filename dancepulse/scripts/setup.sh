#!/usr/bin/env bash
# ============================================================
# DancePulse 一次性安装脚本
# 用法：bash scripts/setup.sh
# 默认在仓库根目录创建 .venv，并把所有 Python 依赖装进去
# ============================================================
set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$ROOT"
VENV_DIR="$ROOT/.venv"
PYTHON_BIN="$VENV_DIR/bin/python"
PIP_BIN="$VENV_DIR/bin/pip"

echo "==> DancePulse 安装开始"
echo "    根目录：$ROOT"
echo ""

# ---------- 前置工具检查 ----------
echo "==> [0/6] 检查前置工具"
command -v python3 >/dev/null 2>&1 || { echo "❌ 未安装 python3"; exit 1; }
command -v node    >/dev/null 2>&1 || { echo "❌ 未安装 node"; exit 1; }
command -v npm     >/dev/null 2>&1 || { echo "❌ 未安装 npm"; exit 1; }
command -v ffmpeg  >/dev/null 2>&1 || { echo "⚠️  未安装 ffmpeg（pipeline 需要），继续..."; }
echo "    ✓ python: $(python3 --version)"
echo "    ✓ node:   $(node --version)"
echo ""

# ---------- venv ----------
if [ ! -x "$PYTHON_BIN" ]; then
  echo "==> [1/6] 创建 Python 虚拟环境 .venv"
  python3 -m venv "$VENV_DIR"
else
  echo "==> [1/6] .venv 已存在，跳过创建"
fi
"$PYTHON_BIN" -m pip install --upgrade pip setuptools wheel >/dev/null
echo ""

# ---------- .env ----------
if [ ! -f "$ROOT/.env" ]; then
  echo "==> [2/6] 生成 .env（从 .env.example）"
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "    ⚠️  请编辑 .env，按需填写 DASHSCOPE_API_KEY / QWEN_MODEL"
else
  echo "==> [2/6] .env 已存在，跳过"
fi
echo ""

# ---------- pipeline ----------
if [ -f "$ROOT/pipeline/requirements.txt" ]; then
  echo "==> [3/6] 安装 pipeline 依赖"
  "$PIP_BIN" install -r "$ROOT/pipeline/requirements.txt"
else
  echo "==> [3/6] pipeline/requirements.txt 不存在，跳过"
fi
echo ""

# ---------- teaching ----------
if [ -f "$ROOT/teaching/requirements.txt" ]; then
  echo "==> [4/6] 安装 teaching 依赖"
  "$PIP_BIN" install -r "$ROOT/teaching/requirements.txt"
else
  echo "==> [4/6] teaching/requirements.txt 不存在，跳过"
fi
echo ""

# ---------- backend ----------
if [ -f "$ROOT/backend/requirements.txt" ]; then
  echo "==> [5/6] 安装 backend 依赖"
  "$PIP_BIN" install -r "$ROOT/backend/requirements.txt"
else
  echo "==> [5/6] backend/requirements.txt 不存在，跳过"
fi
echo ""

# ---------- frontend ----------
if [ -f "$ROOT/frontend/package.json" ]; then
  echo "==> [6/6] 安装 frontend 依赖"
  cd "$ROOT/frontend"
  npm install
  cd "$ROOT"
else
  echo "==> [6/6] frontend/package.json 不存在，跳过"
fi
echo ""

# ---------- 数据目录 ----------
mkdir -p "$ROOT/backend/data/videos"
mkdir -p "$ROOT/backend/data/clips"
mkdir -p "$ROOT/backend/data/thumbs"
mkdir -p "$ROOT/backend/data/lessons"

echo "============================================"
echo "✅ 安装完成"
echo ""
echo "下一步："
echo "  1. 编辑 .env，按需填写 DASHSCOPE_API_KEY"
echo "  2. 把原始视频放到 backend/data/videos/"
echo "  3. 跑 bash scripts/process-video.sh <视频路径> <lesson_id>"
echo "  4. 启动：bash scripts/start-all.sh"
echo "============================================"
