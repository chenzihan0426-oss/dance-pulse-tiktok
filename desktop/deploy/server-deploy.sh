#!/usr/bin/env bash
# ============================================================
# 服务器端一键部署(全程在服务器上运行,不需要 Mac SSH 直连)
# 前提: 已 git clone 仓库到本机,且已运行过 deploy/setup-server.sh
# 用法: bash deploy/server-deploy.sh <域名>
#   例: bash deploy/server-deploy.sh 8-210-34-199.sslip.io
# ============================================================
set -euo pipefail

DOMAIN="${1:?用法: bash deploy/server-deploy.sh <域名>  例: 8-210-34-199.sslip.io}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> 应用目录: $ROOT"
echo "==> 部署域名: https://${DOMAIN}"

echo "==> [1/6] Python venv + 后端依赖(不含 torch,matte 已在本地生成)"
if [ ! -x "$ROOT/.venv/bin/python" ]; then
  python3.11 -m venv "$ROOT/.venv"
fi
"$ROOT/.venv/bin/pip" install -q --upgrade pip
"$ROOT/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
"$ROOT/.venv/bin/pip" install -q librosa imageio-ffmpeg soundfile yt-dlp mediapipe opencv-contrib-python python-dotenv requests

echo "==> [2/6] .env"
if [ ! -f "$ROOT/.env" ]; then
  cp "$ROOT/.env.example" "$ROOT/.env"
  echo "    ⚠️  已从模板生成 .env —— 记得把 DASHSCOPE_API_KEY 填进去(教学生成需要)"
fi

echo "==> [3/6] MediaPipe 模型自托管(跟拍挑战本地加载,评委不依赖 CDN)"
bash "$ROOT/scripts/download-mediapipe.sh" || echo "    (模型下载失败,前端会回退 CDN,不阻塞)"

echo "==> [4/6] 前端依赖 + 生产构建(API 基址: https://${DOMAIN})"
cd "$ROOT/frontend"
npm install --no-audit --no-fund
NEXT_PUBLIC_API_BASE="https://${DOMAIN}" npm run build

echo "==> [5/6] systemd 服务"
cat > /etc/systemd/system/dancepulse-backend.service <<EOF
[Unit]
Description=DancePulse FastAPI backend
After=network.target

[Service]
WorkingDirectory=${ROOT}/backend
ExecStart=${ROOT}/.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
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
WorkingDirectory=${ROOT}/frontend
ExecStart=/usr/bin/npx next start -H 127.0.0.1 -p 3200
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

echo "==> [6/6] Caddy 自动 HTTPS(/api 与媒体走后端,其余走前端)"
cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
    encode gzip

    @backend path /api/* /videos/* /clips/* /thumbs/* /pose/* /matte/* /pose_full/* /particles/* /tracking-videos/* /docs /openapi.json
    handle @backend {
        reverse_proxy 127.0.0.1:8000
    }

    handle {
        reverse_proxy 127.0.0.1:3200
    }
}
EOF

systemctl daemon-reload
systemctl enable --now dancepulse-backend dancepulse-frontend
systemctl restart caddy

sleep 3
echo ""
echo "--- 服务状态 ---"
systemctl is-active dancepulse-backend dancepulse-frontend caddy || true
echo ""
echo "✅ 部署完成!访问: https://${DOMAIN}"
echo "   (首次打开若证书还在签发,等 30-60 秒再刷)"
echo "   后端日志: journalctl -u dancepulse-backend -f"
