#!/usr/bin/env bash
# ============================================================
# DancePulse 一键部署(在服务器网页终端粘贴一条命令即可)
#
#   sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/chenzihan0426-oss/dance-pulse-tiktok/main/desktop/deploy/one-click.sh)"
#
# 做的事(幂等,可重复执行):
#   装依赖 → 拉/更新代码 → venv → 前端构建 → systemd → Caddy HTTPS
# 域名自动用 <公网IP>.sslip.io,无需任何参数。
# 可选:带上千问 key 让服务器上也能真生成教学
#   sudo DASHSCOPE_API_KEY=sk-xxx bash -c "$(curl -fsSL ...)"
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/chenzihan0426-oss/dance-pulse-tiktok.git"
CLONE_DIR=/opt/dancepulse-repo
APP="$CLONE_DIR/desktop"
MOBILE="$CLONE_DIR/mobile/frontend"

echo "==> [1/8] 公网 IP 与域名"
IP="$(curl -fsSL --max-time 8 https://ifconfig.me 2>/dev/null || curl -fsSL --max-time 8 https://api.ipify.org)"
DOMAIN="${DOMAIN:-$(echo "$IP" | tr '.' '-').sslip.io}"
echo "    IP: $IP  →  https://${DOMAIN}"

echo "==> [2/8] 系统依赖(Python3.11 / Node20 / ffmpeg / Caddy / swap)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl rsync git ffmpeg libgl1 libglib2.0-0 \
  software-properties-common ca-certificates
add-apt-repository -y ppa:deadsnakes/ppa >/dev/null
apt-get update -y
apt-get install -y python3.11 python3.11-venv python3.11-dev
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
if ! swapon --show | grep -q swap; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> [3/8] 拉取代码(含课程数据)"
if [ -d "$CLONE_DIR/.git" ]; then
  git -C "$CLONE_DIR" fetch origin main && git -C "$CLONE_DIR" reset --hard origin/main
else
  git clone --depth 1 "$REPO_URL" "$CLONE_DIR"
fi

echo "==> [4/8] Python venv + 后端依赖(不装 torch,matte 已随仓库带上)"
if [ ! -x "$APP/.venv/bin/python" ]; then python3.11 -m venv "$APP/.venv"; fi
"$APP/.venv/bin/pip" install -q --upgrade pip
"$APP/.venv/bin/pip" install -q -r "$APP/backend/requirements.txt"
"$APP/.venv/bin/pip" install -q librosa imageio-ffmpeg soundfile yt-dlp mediapipe \
  opencv-contrib-python python-dotenv requests

echo "==> [5/8] .env"
if [ ! -f "$APP/.env" ]; then cp "$APP/.env.example" "$APP/.env"; fi
if [ -n "${DASHSCOPE_API_KEY:-}" ]; then
  sed -i "s|^DASHSCOPE_API_KEY=.*|DASHSCOPE_API_KEY=${DASHSCOPE_API_KEY}|" "$APP/.env"
  sed -i "s|^DP_VLM_MODE=.*|DP_VLM_MODE=real|" "$APP/.env"
  echo "    已写入千问 key(教学真实生成)"
else
  echo "    未提供 DASHSCOPE_API_KEY,教学生成走 mock(演示课程已生成好,不受影响)"
fi

echo "==> [6/8] MediaPipe 模型自托管(失败不阻塞,前端会回退 CDN)"
bash "$APP/scripts/download-mediapipe.sh" || true

echo "==> [7/8] 前端构建(API 基址 https://${DOMAIN})"
cd "$APP/frontend"
npm install --no-audit --no-fund
NEXT_PUBLIC_API_BASE="https://${DOMAIN}" npm run build

echo "    构建手机版(mobile/frontend,同一后端)"
cd "$MOBILE"
npm install --no-audit --no-fund
NEXT_PUBLIC_API_BASE="https://${DOMAIN}" npm run build

echo "==> [8/8] systemd + Caddy HTTPS"
cat > /etc/systemd/system/dancepulse-backend.service <<EOF
[Unit]
Description=DancePulse FastAPI backend
After=network.target
[Service]
WorkingDirectory=${APP}/backend
ExecStart=${APP}/.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/dancepulse-frontend.service <<EOF
[Unit]
Description=DancePulse Next.js frontend
After=network.target
[Service]
WorkingDirectory=${APP}/frontend
ExecStart=$(command -v npx) next start -H 127.0.0.1 -p 3200
Restart=always
RestartSec=3
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/dancepulse-mobile.service <<EOF
[Unit]
Description=DancePulse Next.js mobile frontend
After=network.target
[Service]
WorkingDirectory=${MOBILE}
ExecStart=$(command -v npx) next start -H 127.0.0.1 -p 3100
Restart=always
RestartSec=3
Environment=NODE_ENV=production
[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
    encode gzip
    @backend path /api/* /videos/* /clips/* /thumbs/* /pose/* /matte/* /pose_full/* /particles/* /tracking-videos/* /docs /openapi.json
    handle @backend {
        reverse_proxy 127.0.0.1:8000
    }
    # 手机 User-Agent → 手机版(3100),其它 → 桌面版(3200)
    @mobile header_regexp ua User-Agent (?i)(android|iphone|ipod|iemobile|blackberry|mobile)
    handle @mobile {
        reverse_proxy 127.0.0.1:3100
    }
    handle {
        reverse_proxy 127.0.0.1:3200
    }
}
EOF

systemctl daemon-reload
systemctl enable --now dancepulse-backend dancepulse-frontend dancepulse-mobile >/dev/null
systemctl restart dancepulse-backend dancepulse-frontend dancepulse-mobile caddy

sleep 3
echo ""
echo "=================================================="
echo "  ✅ 部署完成"
echo "  访问: https://${DOMAIN}"
echo "  电脑打开=桌面版,手机打开=手机版(按 User-Agent 自动分流)"
echo "  (证书首次签发需 30-60 秒,打不开等一下再刷)"
echo "=================================================="
systemctl is-active dancepulse-backend dancepulse-frontend dancepulse-mobile caddy || true
