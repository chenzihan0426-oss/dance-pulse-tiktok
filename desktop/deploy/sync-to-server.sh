#!/usr/bin/env bash
# ============================================================
# 从 Mac 一键同步到服务器(在 Mac 上运行,可反复执行增量同步)
# 用法: bash deploy/sync-to-server.sh <服务器IP> [域名]
#   域名缺省时用 <IP连字符>.sslip.io(与 install-services.sh 保持一致)
# 做的事:本地构建前端 → rsync 代码+前端产物+全部数据 → 服务器装依赖
# ============================================================
set -euo pipefail

SERVER_IP="${1:?用法: bash deploy/sync-to-server.sh <服务器IP> [域名]}"
DOMAIN="${2:-$(echo "$SERVER_IP" | tr '.' '-').sslip.io}"
SSH="root@${SERVER_IP}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST=/opt/dancepulse

echo "==> [1/4] 本地构建前端(API 基址: https://${DOMAIN},同源经 Caddy 反代)"
cd "$ROOT/frontend"
NEXT_PUBLIC_API_BASE="https://${DOMAIN}" npm run build

echo "==> [2/4] 同步代码 + 前端产物(不含 node_modules/venv)"
rsync -az --delete \
  --exclude '.venv' --exclude 'node_modules' --exclude '.next-dev' \
  --exclude '__pycache__' --exclude '.git' --exclude 'backend/data' \
  "$ROOT/" "$SSH:$DEST/"

echo "==> [3/4] 同步数据(视频/切片/matte/姿态/DB,增量,较耗时)"
rsync -az --info=progress2 "$ROOT/backend/data/" "$SSH:$DEST/backend/data/"

echo "==> [4/4] 服务器端安装依赖(venv + 前端运行时依赖)"
ssh "$SSH" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/dancepulse
# Python venv(不装 torch:服务器不做 matte,已在本地生成好)
if [ ! -x .venv/bin/python ]; then python3.11 -m venv .venv; fi
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r backend/requirements.txt
.venv/bin/pip install -q librosa imageio-ffmpeg soundfile yt-dlp mediapipe opencv-contrib-python python-dotenv requests
# 前端生产依赖
cd frontend && npm ci --omit=dev 2>/dev/null || npm install --omit=dev
REMOTE

echo ""
echo "✅ 同步完成。首次部署继续运行: bash deploy/install-services.sh <服务器IP>"
