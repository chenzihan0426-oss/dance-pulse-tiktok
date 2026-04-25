# DancePulse 迁移说明

这份仓库已经整理成可迁移形态，适合拷到另一台 Mac 或 Linux 开发机后继续运行。

## 包内已包含

- 完整前端源码 `frontend/`
- 完整后端源码 `backend/`
- 切片流水线 `pipeline/`
- AI 教学生成模块 `teaching/`
- 当前已有的课程数据、视频、切片、缩略图 `backend/data/`
- 一键安装脚本 `scripts/setup.sh`
- 一键启动脚本 `scripts/start-all.sh`

## 包内刻意不包含

- 默认建议不把根目录 `.env` 打进共享包
  原因：避免把线上/个人 API 密钥直接打进压缩包
  如果是你自己的个人迁移包，也可以单独携带 `.env`
- `frontend/node_modules`
- `frontend/.next`
- Python 缓存、系统缓存
- `backend/data/jobs/*.json`
  原因：这些是本机运行态任务队列快照，迁移时不需要

## 另一台机器的要求

- Node.js 18+
- Python 3.11+ 推荐
- `ffmpeg`

## 迁移步骤

### 1. 解压

把压缩包解压到任意目录，例如：

```bash
cd ~/Desktop
unzip dancepulse_portable_xxx.zip
cd dancepulse
```

### 2. 安装依赖

```bash
bash scripts/setup.sh
```

这个脚本会：

- 创建仓库内 `.venv`
- 安装 Python 依赖
- 安装前端 npm 依赖
- 如果没有 `.env`，从 `.env.example` 自动生成

### 3. 配置环境变量

编辑根目录 `.env`：

```bash
DASHSCOPE_API_KEY=你的千问 Key
DASHSCOPE_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
QWEN_MODEL=qwen-vl-plus
DP_VLM_MODE=real
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
NEXT_PUBLIC_USE_MOCK=false
```

如果你只想先把当前已有课程跑起来，不急着用真实 AI 重生成，也可以先这样：

```bash
DP_VLM_MODE=mock
```

### 4. 启动

```bash
bash scripts/start-all.sh
```

启动后访问：

- 前端：`http://127.0.0.1:3000`
- 后端：`http://127.0.0.1:8000`

### 5. 验证

```bash
bash scripts/verify-integration.sh
```

## 常见问题

### 页面只显示裸 HTML，没有样式

先停掉前端，再删掉 `frontend/.next` 后重新运行：

```bash
rm -rf frontend/.next
bash scripts/start-all.sh
```

### 抖音链接导入失败

当前代码已经支持从整段分享文案里提取真实 URL。  
如果仍失败，常见原因是 `yt-dlp` 需要 fresh cookies，这时建议：

- 先在本机浏览器登录抖音
- 或改用本地视频上传

### AI 教学无法生成

优先检查：

- `.env` 是否已填写 `DASHSCOPE_API_KEY`
- `DP_VLM_MODE` 是否设成了 `real`
- 外网是否能访问 DashScope

## 当前迁移包适合什么用途

- 在另一台机器继续开发
- 直接演示当前已有课程
- 继续导入本地视频并生成新 lesson

如果你还要进一步做正式交付，下一步建议再补：

- Docker 化
- 生产环境进程管理
- 独立的部署版 `.env.production`
