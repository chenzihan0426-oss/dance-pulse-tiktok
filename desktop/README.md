# 舞拍 DancePulse

> K-pop 编舞视频 → 自动拆片 → 卡片化学习。

这是**集成后的单仓根目录**。7 个并行开发的模块（M1–M7）已按下列映射合并到此处。

---

## 仓库结构

```
dancepulse/
├── frontend/              # M3 + M4 + M5 + M7（Next.js 14）
├── backend/               # M2（FastAPI）
├── pipeline/              # M1（librosa + MediaPipe）
├── teaching/              # M6（VLM 教学生成）
├── scripts/               # 一键启动 / 整体流水线脚本
├── docs/                  # PRD / 模块契约 / 集成指南
├── .env.example           # 环境变量模板
└── README.md              # 本文件
```

各模块的合并说明分别写在：
- [`frontend/MERGE_INSTRUCTIONS.md`](./frontend/MERGE_INSTRUCTIONS.md) — **最重要**，4 个模块合入 1 个 Next.js app
- [`backend/MERGE_INSTRUCTIONS.md`](./backend/MERGE_INSTRUCTIONS.md)
- [`pipeline/MERGE_INSTRUCTIONS.md`](./pipeline/MERGE_INSTRUCTIONS.md)
- [`teaching/MERGE_INSTRUCTIONS.md`](./teaching/MERGE_INSTRUCTIONS.md)
- [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) — 跨模块集成、冲突处理、checklist

---

## 快速开始（开发环境）

### 0. 前置依赖

- Node.js ≥ 18
- Python ≥ 3.11
- ffmpeg（pipeline 抽帧用）
- 阿里云百炼 / 千问视觉 API Key（教学生成用，没有可跑 mock）

### 1. 一次性安装

```bash
bash scripts/setup.sh
```

该脚本会：
- 在根目录创建 `.venv`
- 安装 `pipeline/`、`teaching/`、`backend/` 的 Python 依赖到 `.venv`
- 安装 `frontend/` 的 npm 依赖
- 从 `.env.example` 生成 `.env`（如不存在）

### 2. 配置环境变量

编辑 `.env`（根目录）：

```bash
DASHSCOPE_API_KEY=你的千问视觉 key       # 没有可留空，走 mock
DASHSCOPE_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
QWEN_MODEL=qwen-vl-plus
DP_VLM_MODE=real
USE_MOCK_TEACHING=false                   # true 时跳过真 VLM
USE_MOCK_CLIP_REEXPORT=false              # true 时后端 PATCH 不真切 MP4
API_BASE=http://localhost:8000
NEXT_PUBLIC_API_BASE=http://localhost:8000
DOUYIN_COOKIES_FILE=
DOUYIN_COOKIES_FROM_BROWSER=
DOUYIN_DISABLE_PROXY=true
DOUYIN_AUTO_BROWSER_VERIFY=true
DOUYIN_BROWSER_VERIFY_TIMEOUT=90
```

补充说明：
- 抖音链接导入会先尝试无 cookies 下载
- 如果抖音返回需要 fresh cookies，后端会自动尝试读取本机浏览器 cookies
- 如果抖音进一步触发验证码，后端会自动在本机 Edge / Chrome 打开该链接，并在后台持续重试一段时间
- 默认会绕过终端代理下载抖音，减少代理 IP 和浏览器 cookies 不一致导致的验证失败
- 为了提高成功率，建议先在 Edge 或 Chrome 登录抖音

### 3. 启动后端 + 前端

```bash
bash scripts/start-all.sh
```

或者分开起：

```bash
# 终端 1
cd backend && python3 -m uvicorn main:app --reload --port 8000

# 终端 2
cd frontend && npm run dev
```

访问 <http://127.0.0.1:3000>。

---

## 迁移到另一台设备

如果你要把当前产品完整迁到另一台机器：

1. 解压可迁移压缩包
2. 进入项目根目录
3. 运行 `bash scripts/setup.sh`
4. 复制 `.env.example` 为 `.env` 并填写密钥
5. 运行 `bash scripts/start-all.sh`

详细迁移说明见 [`DEPLOY_ON_ANOTHER_DEVICE.md`](./DEPLOY_ON_ANOTHER_DEVICE.md)。

---

## 跑一支新视频（完整流水线）

```bash
bash scripts/process-video.sh ./backend/data/videos/antifragile.mp4 antifragile_dp
```

该脚本按顺序做：

1. `pipeline/run.py` — 切分 + 出切片 MP4 + 写 Lesson JSON（`teaching.status = "pending"`）
2. `teaching/generate_teaching.py` — 为每个 segment 调 VLM 填充 teaching 字段
3. 写入到 `backend/data/lessons/antifragile_dp.json`

完成后刷新前端，首页就能看到这支 lesson。

---

## 预置 10 支视频（Demo 用）

PRD 要求现场 demo 不做实时处理。预置流程：

1. 把原视频放到 `backend/data/videos/`
2. 对每支视频跑 `scripts/process-video.sh`
3. 确认 `backend/data/lessons/*.json` 共 10 份
4. Demo 时用户直接点首页卡片进 `/lesson/:id`，跳过上传

---

## 开发期只跑前端（mock 数据）

所有前端模块开发期都支持 mock 模式：

```bash
cd frontend
NEXT_PUBLIC_USE_MOCK=true npm run dev
```

此时后端完全不起作用，所有数据来自 `frontend/lib/mock.ts`。

---

## 数据契约速览

详细 schema 见 [`docs/CONTRACTS.md`](./docs/CONTRACTS.md)。

```
Lesson {
  id, title, bpm, duration, video_url, thumbnail
  confirmed: bool
  beats: number[]        // 所有切片时间点必须落在这里
  sections: Section[]
  segments: Segment[]
}

Segment {
  id: "seg_XXX"          // 蛇形 + 3 位补零
  start, end, duration   // 2 位小数
  section, section_label
  difficulty, is_still
  thumbnail, clip_url
  user_edited: bool
  teaching: {
    status: "ready" | "pending" | "failed"
    summary, steps[], tips[]
  }
}
```

HTTP API：

```
GET    /api/lessons                              列表
GET    /api/lessons/:id                          详情
POST   /api/import                               上传
PATCH  /api/lessons/:id/segments                 批量切片操作
POST   /api/lessons/:id/regenerate               重新切分
POST   /api/lessons/:id/confirm                  确认
POST   /api/segments/:id/teaching/regenerate     重生成教学
```

---

## 集成验证

装完后运行：

```bash
bash scripts/verify-integration.sh
```

会自动跑 [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) 里的 checklist：
各端点连通性、CORS、静态资源、前端路由可达、mock ↔ 真实切换。

---

## 原始文档

- [PRD v1.1](./docs/PRD.md)
- [模块并行开发指南](./docs/AGENT_MODULES.md)
- [集成指南](./docs/INTEGRATION.md)
- [共享数据契约](./docs/CONTRACTS.md)
