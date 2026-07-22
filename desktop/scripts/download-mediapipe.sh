#!/usr/bin/env bash
# 下载 MediaPipe WASM + 模型文件到 frontend/public/mediapipe/
# 运行一次即可；之后随拍页面从本地加载，不再依赖 CDN。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/frontend/public/mediapipe"
mkdir -p "$DEST/wasm"

VERSION="0.10.34"
CDN="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm"
MODEL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"

echo "==> 下载 WASM 文件..."
for f in vision_wasm_internal.js vision_wasm_internal.wasm vision_wasm_nosimd_internal.js vision_wasm_nosimd_internal.wasm; do
  [ -f "$DEST/wasm/$f" ] && echo "  已存在: $f" && continue
  echo "  $f"
  curl -fsSL "$CDN/$f" -o "$DEST/wasm/$f"
done

echo "==> 下载 pose_landmarker_lite 模型..."
[ -f "$DEST/pose_landmarker_lite.task" ] \
  && echo "  已存在: pose_landmarker_lite.task" \
  || curl -fsSL "$MODEL" -o "$DEST/pose_landmarker_lite.task"

echo ""
echo "✅ 完成。文件保存在 frontend/public/mediapipe/"
echo "   请把 frontend/public/mediapipe/ 加入 .gitignore（文件较大）。"
