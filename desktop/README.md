# 舞拍 DancePulse · 桌面端

> **K-pop 编舞视频 → 自动节拍/姿态分析 → 卡片化跟练**
>
> 一个面向 K-pop 舞蹈学习者的端到端学习平台:导入视频 → AI 自动切片并识别节拍/姿态 → 生成可跟练的"卡片课程"→ 用户在浏览器里跟跳并获得动作评分与个性化教学反馈。

---

## 1. 产品概览

| 能力 | 说明 |
|---|---|
| **导入** | 支持本地视频上传 / 抖音链接导入(yt-dlp) |
| **拆片** | librosa 自动节拍检测 + MediaPipe 全身姿态识别,按节拍切成短卡片 |
| **教学卡片生成** | 调用阿里云千问视觉模型(VLM)为每个动作生成"提示词 + 重点 + 易错点" |
| **跟练评分** | 浏览器端 MediaPipe 实时姿态追踪 → 与教师轨迹比对 → 节拍内动作评分 |
| **个人主页** | 练习记录、徽章、连续打卡、社区动态 |
| **登录** | 手机号 + 短信验证码(开发态返回 mock 验证码) |

---

## 2. 技术栈

**前端**(`frontend/`)
- Next.js 15(App Router)+ React 18 + TypeScript
- Tailwind CSS 3 + Framer Motion(动画)
- Three.js + MediaPipe Tasks Vision(浏览器端姿态识别)

**后端**(`backend/`)
- FastAPI + Uvicorn + Pydantic 2
- OpenCV(视频帧处理)+ yt-dlp(短视频抓取)
- 文件系统持久化(规划中迁移到 SQLite/PostgreSQL — 见"已知限制")

**视频流水线**(`pipeline/`)
- librosa(节拍检测)+ MediaPipe(姿态识别)+ ffmpeg-python(切片)

**AI 教学**
- 阿里云百炼 / 千问视觉 VLM(`qwen-vl-plus`)

---

## 3. 快速运行(开发环境)

### 前置依赖

- Node.js ≥ 18(推荐 LTS)
- Python ≥ 3.11
- ffmpeg(视频切片用)
- 阿里云百炼 API Key(教学生成可选,留空走 mock)

### 一键安装

```bash
bash scripts/setup.sh
```

脚本会创建 `.venv`、安装 `backend/` 和 `pipeline/` 的 Python 依赖、安装 `frontend/` 的 npm 依赖、从 `.env.example` 生成 `.env`。

### 配置环境变量

复制 `.env.example` 为 `.env`,按需填入(没有真实 key 时保留默认即可走 mock):

```bash
cp .env.example .env
```

主要变量:
- `DASHSCOPE_API_KEY` — 阿里云百炼 key,留空走 mock 教学生成
- `USE_MOCK_TEACHING=true` — 强制跳过真 VLM
- `API_BASE=http://localhost:8000`
- `NEXT_PUBLIC_API_BASE=http://localhost:8000`

### 启动

```bash
bash scripts/start-all.sh
```

或分开起两个终端:

```bash
# 终端 1 — 后端(端口 8000)
cd backend && python3 -m uvicorn main:app --reload --port 8000

# 终端 2 — 前端(端口 3200)
cd frontend && npm run dev
```

打开 http://127.0.0.1:3200。

API 文档(FastAPI 自动生成):http://127.0.0.1:8000/docs

---

## 4. 仓库结构

```
desktop/
├── frontend/        Next.js 15 应用(App Router)
│   ├── app/         路由(lesson, player, import, auth, u, tabs)
│   ├── components/  UI 组件(LessonCard, ProgressRing, BottomTabBar...)
│   ├── lib/         API 客户端 / 业务 hooks / 工具
│   └── public/
├── backend/         FastAPI 服务
│   ├── routes/      8 个路由模块(auth, lessons, segments, teaching...)
│   ├── services/    业务逻辑(douyin_fetch, doubao_vlm, tracking_scoring...)
│   ├── models.py    Pydantic 数据模型
│   └── main.py      入口
├── pipeline/        视频处理流水线(librosa + MediaPipe + ffmpeg)
├── scripts/         一键启动 / 安装 / 打包脚本
├── docs/            PRD / 模块契约 / 集成文档
├── .env.example     环境变量模板
├── DEVELOPMENT.md   面向开发者的内部文档(原 README)
└── README.md        本文件
```

---

## 5. 已知限制与下一步路线

| 项 | 状态 | 说明 |
|---|---|---|
| 数据持久化 | 🚧 文件系统 | 当前用 JSON 文件存储用户/课程/进度数据,**MVP 阶段够用**;下一版本迁移到 SQLite,生产部署用 PostgreSQL |
| 短信验证码 | 🚧 Dev mock | 当前 dev 模式直接返回验证码,生产需接入阿里云/腾讯云短信网关 |
| 个性化推荐 | 🚧 规划中 | 计划基于用户身高/舞龄/历史完成度,通过规则匹配 → 内容推荐 → ML 推荐三阶段演进 |
| 多端同步 | 🚧 仅桌面 Web | 移动端独立项目 `mobile/`(本仓库仅含桌面端) |
| VLM 教学质量 | ⚠️ 依赖 | 教学卡片质量依赖千问 VLM 输出,长期需建立人工校对/微调闭环 |

---

## 6. 团队与致谢

本项目由 7 个并行开发的模块(M1-M7)集成而来:

| 模块 | 范畴 |
|---|---|
| M1 | 视频拆片(节拍检测 + 姿态识别) |
| M2 | 后端 API |
| M3-M5 | 前端各功能页 |
| M6 | VLM 教学生成 |
| M7 | 跟练与评分 |

详细模块划分见 [`DEVELOPMENT.md`](./DEVELOPMENT.md) 和 [`docs/`](./docs/)。
