# DancePulse 部署文档

## 架构
- 前端：Vercel @ https://frontend-keyzzzoes-projects.vercel.app
- 后端：本地电脑（8000），通过 cloudflared 隧道暴露
- GitHub：https://github.com/keyzzzoe/dancepulse

## 当前可用地址
- 本次后端隧道：
  `https://parents-differences-corpus-provisions.trycloudflare.com`
- 本次对外分享地址：
  `https://frontend-keyzzzoes-projects.vercel.app/?api=https://parents-differences-corpus-provisions.trycloudflare.com`

## 项目架构概述
- 前端技术栈：Next.js 14 + TypeScript + Tailwind
- 后端技术栈：Python FastAPI
- 前端目录：`frontend/`
- 后端目录：`backend/`
- 前端构建命令：`npm run build`
- 前端开发命令：`npm run dev -- --hostname 127.0.0.1 --port 3004`
- 后端启动命令：`python -m uvicorn main:app --host 127.0.0.1 --port 8000`
- 前端本地端口：`3004`
- 后端本地端口：`8000`

## 日常使用流程（每天开始）

终端 A（后端）：
```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

终端 B（隧道）：
```bash
cloudflared tunnel --url http://localhost:8000 --no-autoupdate
```

终端 B 输出里找 `https://xxx-yyy-zzz.trycloudflare.com`，这是本次后端公网地址。

## 分享给用户 / 评委

方式 1（推荐，不用改 Vercel）：
```text
https://frontend-keyzzzoes-projects.vercel.app/?api=https://parents-differences-corpus-provisions.trycloudflare.com
```

方式 2（一次性配置）：
1. Vercel Dashboard → 项目 `frontend` → Settings → Environment Variables
2. 改 `NEXT_PUBLIC_API_BASE` 为当前隧道 URL
3. Deployments → 最新部署 Redeploy

## 代码更新

```bash
git add .
git commit -m "..."
git push
```

Vercel 已连接 GitHub 仓库，push 后会自动部署。

## 后端 CORS 已配置白名单

后端已允许 `*.vercel.app`、`*.trycloudflare.com`、`localhost` 跨域访问。  
如需追加域名，请修改：
- `backend/main.py`

## 常见问题

- **隧道断了**：电脑休眠会断，重跑 `cloudflared tunnel --url http://localhost:8000 --no-autoupdate` 即可拿新 URL
- **Vercel 返回 Authentication Required**：已关闭 SSO 保护；如再次出现，去 Vercel Dashboard → Project → Protection 里确认关闭
- **Vercel 部署失败**：看 Vercel Dashboard 的 Build Log
- **手机添加主屏幕图标是空的**：检查 `frontend/public/icons/` 下三张 PNG 是否齐全
- **本地 build 因 `.next` 报 readlink/EINVAL**：删除 `frontend/.next` 后重跑；开发服务器现在走 `.next-dev`

## 永久后端域名（可选）

免费方案：Cloudflare Named Tunnel + 自有域名。  
详细步骤见 [DEPLOY_NAMED_TUNNEL.md](D:/OneDrive/Desktop/字节龙虾/11111/dancepulse/DEPLOY_NAMED_TUNNEL.md)。
