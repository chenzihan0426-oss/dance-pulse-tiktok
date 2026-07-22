#!/usr/bin/env bash
# ============================================================
# 安装 systemd 服务 + Caddy HTTPS(在 Mac 上运行,首次部署一次)
# 用法: bash deploy/install-services.sh <服务器IP> [域名]
#   域名缺省时自动用 <IP 连字符>.sslip.io(免注册免实名,立即可用 HTTPS)
# ============================================================
set -euo pipefail

SERVER_IP="${1:?用法: bash deploy/install-services.sh <服务器IP> [域名]}"
DOMAIN="${2:-$(echo "$SERVER_IP" | tr '.' '-').sslip.io}"
SSH="root@${SERVER_IP}"

echo "==> 部署域名: https://${DOMAIN}"

ssh "$SSH" DOMAIN="$DOMAIN" bash -s <<'REMOTE'
set -euo pipefail

# ---------- 后端 systemd ----------
cat > /etc/systemd/system/dancepulse-backend.service <<EOF
[Unit]
Description=DancePulse FastAPI backend
After=network.target

[Service]
WorkingDirectory=/opt/dancepulse/backend
ExecStart=/opt/dancepulse/.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# ---------- 前端 systemd ----------
cat > /etc/systemd/system/dancepulse-frontend.service <<EOF
[Unit]
Description=DancePulse Next.js frontend
After=network.target

[Service]
WorkingDirectory=/opt/dancepulse/frontend
ExecStart=/usr/bin/npx next start --hostname 127.0.0.1 --port 3200
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# ---------- Caddy:自动 HTTPS,/api 与媒体路由走后端,其余走前端 ----------
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
echo "--- 服务状态 ---"
systemctl is-active dancepulse-backend dancepulse-frontend caddy
REMOTE

echo ""
echo "✅ 部署完成!访问: https://${DOMAIN}"
echo "   (Caddy 首次签发证书需要几十秒,若打不开稍等再刷)"
echo "   日志: ssh root@${SERVER_IP} journalctl -u dancepulse-backend -f"
