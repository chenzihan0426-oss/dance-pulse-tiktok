# DancePulse Named Tunnel 指南

## 目标
把当前临时的 `trycloudflare.com` 地址升级成一个稳定不变的后端域名，避免每次重启电脑都要重新发新的 `?api=` 链接。

推荐形态：
- 前端：`https://frontend-keyzzzoes-projects.vercel.app`
- 后端：`https://api.your-domain.com`

## 准备
- 一个托管在 Cloudflare 的域名
- 本机已安装 `cloudflared`
- 后端本地仍运行在 `http://localhost:8000`

## 一次性配置

1. 登录 Cloudflare
```bash
cloudflared tunnel login
```

2. 创建 named tunnel
```bash
cloudflared tunnel create dancepulse-api
```

3. 记下生成的 tunnel id

4. 为域名创建 DNS 记录
```bash
cloudflared tunnel route dns dancepulse-api api.your-domain.com
```

5. 在本机创建配置文件  
Windows 推荐放到：
`%USERPROFILE%\\.cloudflared\\config.yml`

内容示例：
```yaml
tunnel: <YOUR_TUNNEL_ID>
credentials-file: C:\\Users\\<你的用户名>\\.cloudflared\\<YOUR_TUNNEL_ID>.json

ingress:
  - hostname: api.your-domain.com
    service: http://localhost:8000
  - service: http_status:404
```

6. 启动 tunnel
```bash
cloudflared tunnel run dancepulse-api
```

## 日常使用

终端 A（后端）：
```bash
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

终端 B（named tunnel）：
```bash
cloudflared tunnel run dancepulse-api
```

## 前端对接方式

方式 1：Vercel 环境变量写死
- 把 `NEXT_PUBLIC_API_BASE` 改成：
  `https://api.your-domain.com`
- Redeploy 一次

方式 2：仍保留 `?api=` 覆盖
- 这样你可以切换正式后端和临时后端，不影响已有机制

## 优点
- 域名稳定不变
- 不用每次重启都改分享链接
- 后续手机收藏、PWA 和评委访问都更稳

## 注意
- 电脑关机后，域名仍然存在，但后端不可用
- 后端必须先启动，再启动 tunnel
- 若本机网络变化导致连接中断，重跑 `cloudflared tunnel run dancepulse-api`
