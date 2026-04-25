# 🧩 如何把你的 7 个模块装进这个骨架

这份文档告诉你**具体拿到这个骨架后要做什么**。

---

## 你现在拿到的是什么

一个**完整的根目录骨架**，包括：

- ✅ 完整目录结构（`frontend/ backend/ pipeline/ teaching/ scripts/ docs/`）
- ✅ 根 README、.env.example、.gitignore
- ✅ 启动脚本（`scripts/*.sh`，都已 `chmod +x`）
- ✅ 4 份合并说明文档（每个模块目录下一份 `MERGE_INSTRUCTIONS.md`）
- ✅ 集成指南（`docs/INTEGRATION.md`）
- ✅ 数据契约（`docs/CONTRACTS.md`）
- ✅ 原始 PRD 和 AGENT_MODULES（`docs/`）

**不包括**：你本地 7 个模块的具体代码（我没法访问你电脑）。

---

## 接下来 3 条路

### 路线 A · 你自己按说明把模块拖进骨架（推荐，最快）

假设你本地有这样一堆文件夹：

```
~/some-where/
├── pipeline-m1/      （M1 产物）
├── teaching-m6/      （M6 产物）
├── backend-m2/       （M2 产物）
├── frontend-m3/      （M3 产物）
├── player-m4/        （M4 产物）
├── gamification-m5/  （M5 产物）
└── confirm-m7/       （M7 产物）
```

把这个骨架 `dancepulse/` 放到某个位置，然后：

```bash
cd dancepulse

# 1. 后端三件套 —— 直接拷贝
cp -r ~/some-where/pipeline-m1/.  pipeline/
cp -r ~/some-where/teaching-m6/.  teaching/
cp -r ~/some-where/backend-m2/.   backend/

# 2. 前端 —— 按顺序合并
# 2.1 M3 作底
cp -r ~/some-where/frontend-m3/.  frontend/

# 2.2 M4 覆盖 Player 占位 + 追加组件
cp ~/some-where/player-m4/components/*.tsx  frontend/components/

# 2.3 M5 覆盖 hooks 占位 + 追加
cp ~/some-where/gamification-m5/hooks/*.ts       frontend/hooks/
cp ~/some-where/gamification-m5/lib/*.ts         frontend/lib/
cp ~/some-where/gamification-m5/components/*.tsx frontend/components/

# 2.4 M7 追加确认页
mkdir -p frontend/app/lesson/\[id\]/confirm
cp ~/some-where/confirm-m7/app/lesson/\[id\]/confirm/page.tsx \
   frontend/app/lesson/\[id\]/confirm/page.tsx
cp ~/some-where/confirm-m7/components/*.tsx frontend/components/
cp ~/some-where/confirm-m7/hooks/*.ts       frontend/hooks/
cp ~/some-where/confirm-m7/lib/*.ts         frontend/lib/

# 3. 处理 lib/types.ts 冲突（见 frontend/MERGE_INSTRUCTIONS.md Step 5）
# 最简单：直接用 docs/CONTRACTS.md 里的 TypeScript 段落覆盖

# 4. 处理 lib/api.ts（见 frontend/MERGE_INSTRUCTIONS.md 附录 A）

# 5. 处理后端 import M1/M6（见 backend/MERGE_INSTRUCTIONS.md Step 3）

# 6. 安装 + 启动
bash scripts/setup.sh
bash scripts/start-all.sh
```

**如果合并中遇到具体冲突**：
- 前端合并具体步骤 → [`frontend/MERGE_INSTRUCTIONS.md`](./frontend/MERGE_INSTRUCTIONS.md)
- 后端接 M1/M6 → [`backend/MERGE_INSTRUCTIONS.md`](./backend/MERGE_INSTRUCTIONS.md)
- 冲突速查表 → [`docs/INTEGRATION.md`](./docs/INTEGRATION.md) 第 6 节

---

### 路线 B · 把 7 个模块打包上传给我，我帮你合并

如果你不想自己合，可以：

1. 把你本地 7 个模块压成一个 zip（文件夹名保留模块名，如 `frontend-m3/`、`player-m4/` 等）
2. 上传给我
3. 我在这里执行合并、解冲突、跑 `npm install` / `pip install` 验证结构，然后把合并好的完整 `dancepulse/` 目录打包返还

> **注意**：我在沙箱里不能真的跑 `uvicorn`、`npm run dev`、`ffmpeg`（环境限制），所以端到端运行验证还是要你本地做。但**代码层面**的合并、冲突处理、结构整理、启动脚本配置，我都能做。

---

### 路线 C · 只给我部分模块

如果你拿不准某两个模块怎么合（典型场景：**M3 ↔ M5 的 hook 字段对不齐**、**M3 ↔ M4 的 Player prop 不一致**），可以只把冲突的两个模块上传，我帮你做定点对齐。

---

## 最终产出的目录长这样

```
dancepulse/
├── README.md                    ← 根说明
├── HOW_TO_ASSEMBLE.md           ← 本文件
├── .env.example
├── .env                         ← 填完 key 后手动创建
├── .gitignore
├── scripts/
│   ├── setup.sh                 ← 一键安装
│   ├── start-all.sh             ← 同时启动 backend + frontend
│   ├── process-video.sh         ← 跑一支视频的完整流水线
│   └── verify-integration.sh    ← 自动验证集成
├── docs/
│   ├── PRD.md                   ← 原始 PRD v1.1
│   ├── AGENT_MODULES.md         ← 原始模块指南
│   ├── INTEGRATION.md           ← 集成指南、冲突处理、checklist
│   └── CONTRACTS.md             ← 数据契约（TS + Pydantic + API）
├── frontend/                    ← M3 + M4 + M5 + M7
│   ├── MERGE_INSTRUCTIONS.md    ← 四合一详细步骤
│   └── ... (你的代码)
├── backend/                     ← M2
│   ├── MERGE_INSTRUCTIONS.md
│   └── ... (你的代码)
├── pipeline/                    ← M1
│   ├── MERGE_INSTRUCTIONS.md
│   └── ... (你的代码)
└── teaching/                    ← M6
    ├── MERGE_INSTRUCTIONS.md
    └── ... (你的代码)
```

---

## 你现在最该做的

**选路线**：
- 想自己动手 → 路线 A，照 `frontend/MERGE_INSTRUCTIONS.md` 一步步做
- 想让我做 → 路线 B，把 7 个模块打包上传给我
- 只有局部冲突 → 路线 C，只上传冲突的模块

**首次启动验证顺序**：
1. `bash scripts/setup.sh` — 安装所有依赖
2. 编辑 `.env` 填 `DOUBAO_API_KEY`（没有就留空，设 `USE_MOCK_TEACHING=true`）
3. 把一支视频放到 `backend/data/videos/test.mp4`
4. `bash scripts/process-video.sh backend/data/videos/test.mp4 test_lesson`
5. `bash scripts/start-all.sh`
6. 打开 http://localhost:3000 检查
7. `bash scripts/verify-integration.sh` 自动验证（backend 需在运行）
