#!/usr/bin/env bash
# ============================================================
# DancePulse 服务器初始化(在服务器上以 root 运行,只需一次)
# 适用:Ubuntu 22.04 (阿里云轻量 香港)
# 用法: bash setup-server.sh
# ============================================================
set -euo pipefail

echo "==> [1/6] 基础依赖"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl rsync git ffmpeg libgl1 libglib2.0-0 \
  software-properties-common ca-certificates

echo "==> [2/6] Python 3.11 (backend 用到 3.11+ 语法)"
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev

echo "==> [3/6] Node.js 20"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "==> [4/6] Caddy (自动 HTTPS)"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "==> [5/6] 2G swap 兜底"
if ! swapon --show | grep -q swap; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> [6/6] 应用目录"
mkdir -p /opt/dancepulse

echo ""
echo "✅ 初始化完成。下一步:在你的 Mac 上运行 deploy/sync-to-server.sh <服务器IP>"
