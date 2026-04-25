# 集成指南

整个 DancePulse 由 7 个独立开发的模块组成。这份文档告诉你：
1. 每个模块的代码应该落到本仓哪个位置
2. 合并时的冲突如何处理
3. 如何把 mock 切到真实调用
4. 集成验证 checklist

---

## 1. 模块 → 目录 映射表

| 模块 | 源 | 目标目录 | 合并难度 |
|---|---|---|---|
| M1 算法 Pipeline | `pipeline/` 独立项目 | `./pipeline/` | 🟢 直接复制 |
| M6 教学生成 | `teaching/` 独立项目 | `./teaching/` | 🟢 直接复制 |
| M2 后端 API | `backend/` 独立项目 | `./backend/` | 🟡 改 import 路径 |
| M3 前端页面 | `frontend/` (M3 版) | `./frontend/` | 🔴 基础骨架 |
| M4 播放器 | `player-component/` 独立项目 | `./frontend/` | 🔴 覆盖 M3 的 Player 占位 |
| M5 游戏化 | `gamification/` 独立项目 | `./frontend/` | 🔴 覆盖 M3 的 hooks 占位 |
| M7 切片确认页 | `confirm-page/` 独立项目 | `./frontend/` | 🔴 新增路由 + 组件 |

**前端最复杂**：M3/M4/M5/M7 四个模块都产出 Next.js 代码，需要合并到同一个 app。详细步骤见 [`frontend/MERGE_INSTRUCTIONS.md`](../frontend/MERGE_INSTRUCTIONS.md)。

---

## 2. 合并顺序（推荐）

按这个顺序走不会踩坑：

```
Step 1: 后端三件套（互不相关）
   ├── pipeline/     （M1）
   ├── teaching/     （M6）
   └── backend/      （M2）

Step 2: 前端骨架
   └── frontend/     （M3 作为底座）

Step 3: 前端组件覆盖 / 追加
   ├── M4 Player 覆盖 M3 占位
   ├── M5 Hooks 覆盖 M3 占位
   └── M7 Confirm 页追加新路由

Step 4: 去 mock
   ├── backend: USE_MOCK_CLIP_REEXPORT=false, 真正 import M1 / M6 函数
   └── frontend: NEXT_PUBLIC_USE_MOCK=false

Step 5: 端到端验证
```

---

## 3. 跨模块接口必须对齐

以下字段/行为任何模块都不能改动。对不上必须改模块侧，不改契约。

### 3.1 Segment ID 格式

`seg_XXX`（蛇形前缀 + 3 位补零）。新建切片续编号。

- ✅ `seg_000`, `seg_017`, `seg_123`
- ❌ `seg_3`, `segment_003`, `s003`

**哪里会出问题**：
- M1 生成时
- M2 处理 split / create op 时（要查当前最大 index，+1）
- M7 本地生成预览 id 时（建议用 `seg_new_tmp_N` 前缀，后端分配真 id）

### 3.2 时间精度

`start` / `end` / `duration` 保留 **2 位小数**。

**哪里会出问题**：
- M1 写 JSON 时 `round(x, 2)`
- M2 PATCH op 接收时不要直接信任前端，再 round 一次
- M7 拖拽 onChange 时前端不用 round，提交时 round

### 3.3 Beat 对齐

所有 `start` / `end` 必须能在 `lesson.beats` 数组中找到（容差 0.01s）。

- M7 拖拽使用 `snapToBeat(time, beats, tolerance=0.1)`，Shift 关闭吸附
- M2 PATCH 收到请求后在 `services/beat_validator.py` 再校验一次，未对齐返回 400

### 3.4 路径分隔符

所有写入 JSON 的路径都用 `/`。Windows 下 M1 生成时必须转换：

```python
path = path.replace("\\", "/")
```

### 3.5 teaching.status 取值

**只能是**：`"ready" | "pending" | "failed"`

- ❌ `"done"`, `"error"`, `"loading"`, `"success"`
- M6 内部可以有别的中间状态但输出到 JSON 时必须归一

### 3.6 PATCH ops 字段名

```ts
type Op =
  | { op: "update", id, start, end }
  | { op: "merge",  ids: string[] }
  | { op: "split",  id, at }
  | { op: "delete", id }
  | { op: "create", start, end, section }
```

`op` 字段的值**只能是这 5 个**，不要 `"edit"`、`"add"`、`"remove"`。

---

## 4. 从 Mock 切到真实调用

### 4.1 后端：接入 M1 / M6

编辑 `backend/services/clip_reexport.py`：

```python
# 替换前（mock 版）：
def reexport_clip(lesson_id, segment_id, start, end, video_path):
    time.sleep(0.3)  # 模拟耗时
    return "/clips/" + segment_id + ".mp4", "/thumbs/" + segment_id + ".jpg"

# 替换后（真实）：
import sys
sys.path.insert(0, "../pipeline")
from clip_export import re_export_clip

def reexport_clip(lesson_id, segment_id, start, end, video_path):
    clip_path, thumb_path = re_export_clip(video_path, segment_id, start, end)
    return clip_path.replace("\\", "/"), thumb_path.replace("\\", "/")
```

编辑 `backend/services/teaching_queue.py`：

```python
# 替换 mock 调用：
import sys
sys.path.insert(0, "../teaching")
from generate_teaching import generate_teaching_for_segment

async def enqueue_regenerate(lesson, segment):
    teaching = generate_teaching_for_segment(
        clip_path=f"./data/clips/{segment['id']}.mp4",
        segment=segment,
        lesson_context={"bpm": lesson["bpm"], "section_label": segment["section_label"]}
    )
    segment["teaching"] = teaching
```

或者更稳妥：两边都加 env 开关，生产切 true，开发保留 mock。

### 4.2 前端：切到真后端

`frontend/lib/api.ts` 已经内置 `USE_MOCK` 开关：

```ts
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

export async function getLessons() {
  if (USE_MOCK) return MOCK_LESSONS;
  const res = await fetch(`${API_BASE}/api/lessons`);
  return res.json();
}
```

把 `.env` 里的 `NEXT_PUBLIC_USE_MOCK` 改成 `false` 重启即可。

---

## 5. 集成验证 Checklist

按顺序打勾。任何一项不过立即回查对应模块。

### 5.1 Pipeline（M1）

- [ ] `cd pipeline && python run.py ../backend/data/videos/test.mp4 --output ../backend/data/lessons/test.json`
- [ ] 输出 JSON 结构合法（用 `python -c "import json; json.load(open('test.json'))"`)
- [ ] `lesson.beats` 是完整数组（长度 > 100）
- [ ] 每个 `segment.start` / `segment.end` 都出现在 `beats` 里（容差 0.01）
- [ ] `backend/data/clips/seg_XXX.mp4` 全部生成
- [ ] `backend/data/thumbs/seg_XXX.jpg` 全部生成
- [ ] 每个 segment 的 `teaching.status == "pending"`（未跑 M6 时）

### 5.2 Teaching（M6）

- [ ] `cd teaching && python generate_teaching.py ../backend/data/lessons/test.json`
- [ ] 重跑一次只处理 status != "ready" 的 segment（幂等）
- [ ] 失败的 segment status == "failed"，不中断其他
- [ ] 生成后的 JSON 各字段类型正确（steps 是数组、tips 是数组）

### 5.3 Backend（M2）

- [ ] `cd backend && uvicorn main:app --reload --port 8000` 启动无报错
- [ ] `curl http://localhost:8000/api/lessons` 返回列表
- [ ] `curl http://localhost:8000/api/lessons/test` 返回详情（含 segments/beats/sections）
- [ ] PATCH 5 种 op 全部工作：

```bash
curl -X PATCH http://localhost:8000/api/lessons/test/segments \
  -H 'Content-Type: application/json' \
  -d '{"ops":[{"op":"update","id":"seg_003","start":42.50,"end":48.30}]}'
```

- [ ] 时间点不对齐 beat 时返回 400
- [ ] POST `/api/lessons/test/confirm` 将 confirmed 设为 true
- [ ] POST `/api/segments/seg_003/teaching/regenerate` 返回 202 并最终更新 teaching
- [ ] 静态资源可访问：`curl -I http://localhost:8000/clips/seg_003.mp4` 返回 200
- [ ] CORS：从 `http://localhost:3000` 的 fetch 不被拦截

### 5.4 Frontend（M3 + M4 + M5 + M7）

- [ ] `cd frontend && npm run dev` 启动无报错
- [ ] 首页 `/` 显示 lesson 列表
- [ ] 详情页 `/lesson/test` 显示切片瀑布流，每卡显示 `teaching.summary`
- [ ] 点击卡片跳 `/player/seg_003`，能播放、变速、镜像、上下切片、节拍计数
- [ ] 播放器页 TeachingPanel 显示 summary / steps / tips
- [ ] 详情页点「调整切片」进 `/lesson/test/confirm`
- [ ] 确认页时间轴渲染正常，拖拽边界吸附 beat
- [ ] 拖拽后点「确认完成」，回详情页，切片已变化
- [ ] `confirmed: false` 时详情页「调整切片」按钮用主色高亮

### 5.5 游戏化（M5）

- [ ] 勾选「学会」后刷新页面仍保留
- [ ] 清空所有卡片 localStorage 后，学会第一张弹出 `first_learned` 徽章
- [ ] 学会超过一半弹出 `half_done`
- [ ] 全部学会弹出 `lesson_complete`

### 5.6 端到端（真正的 demo 演示流程）

- [ ] 准备一支未跑过的视频，放到 `backend/data/videos/demo.mp4`
- [ ] `bash scripts/process-video.sh backend/data/videos/demo.mp4 demo_lesson`
- [ ] 刷新前端首页，新 lesson 出现
- [ ] 点进详情页 → 调整切片 → 拖拽 → 确认 → 回详情页 → 点卡片学习
- [ ] 全流程无报错

---

## 6. 冲突高发点索引

### 6.1 前端 `components/Player.tsx`

M3 版本是占位（`<video controls />`），M4 版本是完整实现。

**处理**：直接用 M4 的文件覆盖 M3 的。

### 6.2 前端 `hooks/useLearningProgress.ts`

M3 版本是返回假数据的占位，M5 版本是 localStorage 真实实现。

**处理**：直接用 M5 的文件覆盖 M3 的。

### 6.3 前端 `lib/types.ts`

M3 / M5 / M7 都可能定义了 Segment / Lesson 类型。

**处理**：以 `docs/CONTRACTS.md` 为准，手动合并。M5 的徽章类型追加进去，M7 的 Op / PendingOp 类型追加进去，基础 Lesson/Segment/Section 保持 M3 的（因 M3 是从共享契约抄的）。

### 6.4 前端 `package.json`

4 个前端模块都有自己的 deps。

**处理**：以 M3 的 `package.json` 为底，追加：
- M4 的 `lucide-react`（通常已有）
- M5 的 `vitest`（仅 devDep）
- M7 的 `@use-gesture/react`

详见 `frontend/MERGE_INSTRUCTIONS.md`。

### 6.5 后端 import M1 / M6

M2 开发期用的是 `services/clip_reexport_mock.py`。集成期需改 import 路径：

```python
# backend/services/clip_reexport.py
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../pipeline"))
from clip_export import re_export_clip
```

（或用根目录 `setup.py` / `pyproject.toml` 把 pipeline 装成可安装包，更干净）

---

## 7. 常见报错速查

| 报错 | 原因 | 处理 |
|---|---|---|
| `ModuleNotFoundError: clip_export` | 后端没加 pipeline 到 sys.path | 看 6.5 |
| 前端 `Cannot find module '@/components/Player'` | M4 没合并进来 | 看 `frontend/MERGE_INSTRUCTIONS.md` |
| PATCH 返回 `beat not aligned` | 前端没吸附就提交了 | M7 的 SegmentEditor 提交前过 snapToBeat |
| Segment id 变 `seg_3` | M1 或 M2 的 id 生成没补零 | `f"seg_{i:03d}"` |
| 视频播放 CORS 错误 | backend 静态资源没加 CORS | `main.py` 的 `CORSMiddleware` 要 allow_origins=["http://localhost:3000"] |
| teaching 一直 pending | 队列 worker 挂了 / VLM API 超时 | 查 `backend/logs/`、手动 POST regenerate |
| `NEXT_PUBLIC_USE_MOCK` 改了不生效 | Next.js 环境变量要重启 | `Ctrl+C` 后重跑 `npm run dev` |
