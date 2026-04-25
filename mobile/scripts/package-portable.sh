#!/usr/bin/env bash
# ============================================================
# 生成可迁移压缩包（默认输出到桌面）
# 用法：
#   bash scripts/package-portable.sh
#   bash scripts/package-portable.sh /自定义/输出目录
# ============================================================
set -euo pipefail

ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_BASE="${1:-$HOME/Desktop}"
PACKAGE_NAME="dancepulse_portable_${STAMP}"
STAGE_DIR="${OUTPUT_BASE}/${PACKAGE_NAME}"
ZIP_PATH="${OUTPUT_BASE}/${PACKAGE_NAME}.zip"

command -v rsync >/dev/null 2>&1 || { echo "❌ 未找到 rsync"; exit 1; }
command -v zip >/dev/null 2>&1 || { echo "❌ 未找到 zip"; exit 1; }

rm -rf "$STAGE_DIR" "$ZIP_PATH"
mkdir -p "$STAGE_DIR"

echo "==> 准备可迁移包"
echo "    源目录: $ROOT"
echo "    临时目录: $STAGE_DIR"
echo "    输出文件: $ZIP_PATH"
echo ""

rsync -a \
  --exclude '.DS_Store' \
  --exclude '.env' \
  --exclude '.venv' \
  --exclude '.pytest_cache' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '*.pyo' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/.next' \
  --exclude 'backend/data/jobs/*.json' \
  --exclude 'backend/data/jobs/.DS_Store' \
  "$ROOT/" "$STAGE_DIR/dancepulse/"

mkdir -p "$STAGE_DIR/dancepulse/backend/data/jobs"
touch "$STAGE_DIR/dancepulse/backend/data/jobs/.gitkeep"

(cd "$STAGE_DIR" && zip -qry "$ZIP_PATH" "dancepulse")
rm -rf "$STAGE_DIR"

echo "============================================"
echo "✅ 可迁移压缩包已生成"
echo "  $ZIP_PATH"
echo "============================================"
