# 模块并行开发指南 v1.1

把工程拆成 7 个可独立跑的模块。每个模块配一份可直接复制到 Claude Code / Cursor 的启动提示词。

---

## 模块总览

```
┌──────────────────────────────┐
│  共享契约（本文档）          │  ← 所有模块先读这里
└──────────────┬───────────────┘
               │
  ┌────────────┼────────────┬──────────┬──────────┬──────────┐
  ▼            ▼            ▼          ▼          ▼          ▼
[M1 切分]  [M6 教学生成]  [M2 后端]  [M3 前端]  [M4 播放器] [M5 游戏化]
 Python     Python (VLM)  FastAPI    Next.js    React      React
  │            │            │          │          │          │
  └────────────┴────────────┘          ├──────────┤          │
         pipeline 跑通                 │  集成    │          │
                                       └─────┬────┴──────────┘
                                             │
                                      [M7 切片确认页]
                                         Next.js
                                             │
                                             ▼
                                        最终集成
```

### 依赖关系

| 模块 | 依赖 | mock 策略 |
|---|---|---|
| M1 算法 Pipeline | 无 | 独立 |
| M6 教学生成 | 切片 MP4（M1 的产物） | 可喂任何 MP4 独立测试 |
| M2 后端 API | M1 / M6 的 Python 函数（集成期） | 用 mock 实现占位，集成期接入 |
| M3 前端页面 | M2 的 JSON 响应（集成期） | 用 `lib/mock.ts` 假数据开发 |
| M4 播放器组件 | Segment 类型定义 | 独立 |
| M5 游戏化 Hooks | Segment 类型定义 | 独立 |
| M7 切片确认页 | M2 的 PATCH 端点（集成期） | mock 假数据 + mock API |

**关键**：7 个模块 Day 1 全部并行开工，全部用本文档里的 mock 数据。Day 2 上午做集成。

---

## 共享契约（所有模块必读）

### Lesson JSON

```json
{
  "id": "string",
  "title": "string",
  "source_url": "string",
  "duration": "number",
  "bpm": "number",
  "video_url": "string, 相对路径如 /videos/xxx.mp4",
  "thumbnail": "string, 相对路径",
  "confirmed": "boolean",
  "beats": "number[], 完整 beat 时间点数组",
  "sections": "Section[]",
  "segments": "Segment[]"
}
```

### Section

```json
{
  "id": "string, e.g. 'chorus_1'",
  "label": "string, e.g. '副歌 1'",
  "start": "number",
  "end": "number"
}
```

### Segment

```json
{
  "id": "string, 格式 seg_XXX",
  "lesson_id": "string",
  "index": "number, 从 0 开始",
  "section": "string",
  "section_label": "string",
  "start": "number, 2 位小数",
  "end": "number, 2 位小数",
  "duration": "number, 2 位小数",
  "beat_count": "number, 通常 8",
  "thumbnail": "string",
  "clip_url": "string",
  "difficulty": "number, 1-5",
  "is_still": "boolean",
  "ai_description": "string",
  "user_edited": "boolean",
  "teaching": {
    "status": "'ready' | 'pending' | 'failed'",
    "summary": "string",
    "steps": "[{ beats: string, content: string }]",
    "tips": "string[]",
    "generated_at": "string, ISO datetime"
  }
}
```

### HTTP API 端点

```
GET    /api/lessons                            # 列表（不含 segments）
GET    /api/lessons/:id                        # 详情（含 segments / beats / sections）
POST   /api/import                             # 上传新视频

PATCH  /api/lessons/:id/segments               # 批量切片操作
POST   /api/lessons/:id/regenerate             # 重新切分
POST   /api/lessons/:id/confirm                # 确认完成

POST   /api/segments/:id/teaching/regenerate   # 重新生成教学

GET    /videos/:file                           # 静态
GET    /clips/:file                            # 静态
GET    /thumbs/:file                           # 静态
```

### PATCH segments 请求体（关键契约）

```json
{
  "ops": [
    { "op": "update", "id": "seg_003", "start": 42.50, "end": 48.30 },
    { "op": "merge",  "ids": ["seg_005", "seg_006"] },
    { "op": "split",  "id": "seg_007", "at": 55.60 },
    { "op": "delete", "id": "seg_009" },
    { "op": "create", "start": 120.0, "end": 125.8, "section": "outro" }
  ]
}
```

响应：更新后的完整 Lesson JSON。非法操作（时间点不对齐 beat、交叉重叠）返回 400。

### 共享 mock 数据

前端所有模块开发期用同一份 mock，存 `frontend/lib/mock.ts`：

```typescript
export const MOCK_LESSON: Lesson = {
  id: "antifragile_dp",
  title: "ANTIFRAGILE - LE SSERAFIM",
  source_url: "https://www.douyin.com/video/demo",
  duration: 203.4,
  bpm: 126,
  video_url: "https://demo.dancepulse.app/videos/antifragile.mp4",
  thumbnail: "https://picsum.photos/seed/lesson/640/360",
  confirmed: false,
  beats: Array.from({ length: 420 }, (_, i) => +(i * 0.476).toFixed(2)),
  sections: [
    { id: "intro",       label: "前奏",     start: 0,     end: 22.4 },
    { id: "verse_1",     label: "Verse 1", start: 22.4,  end: 67.2 },
    { id: "prechorus_1", label: "Pre",     start: 67.2,  end: 89.6 },
    { id: "chorus_1",    label: "副歌 1",  start: 89.6,  end: 156.8 },
    { id: "outro",       label: "尾声",    start: 156.8, end: 203.4 }
  ],
  segments: Array.from({ length: 18 }, (_, i) => ({
    id: `seg_${String(i).padStart(3, "0")}`,
    lesson_id: "antifragile_dp",
    index: i,
    section: i < 2 ? "intro" : i < 6 ? "verse_1" : i < 8 ? "prechorus_1" : i < 14 ? "chorus_1" : "outro",
    section_label: i < 2 ? "前奏" : i < 6 ? "Verse 1" : i < 8 ? "Pre" : i < 14 ? "副歌" : "尾声",
    start: +(i * 11.2).toFixed(2),
    end: +((i + 1) * 11.2).toFixed(2),
    duration: 11.2,
    beat_count: 8,
    thumbnail: `https://picsum.photos/seed/${i}/320/180`,
    clip_url: `https://demo.dancepulse.app/clips/seg_${String(i).padStart(3, "0")}.mp4`,
    difficulty: ((i * 7 + 3) % 5) + 1,
    is_still: i === 0 || i === 17,
    ai_description: `片段 ${i} 的动作描述占位`,
    user_edited: false,
    teaching: {
      status: "ready",
      summary: `第 ${i + 1} 段：副歌主打动作`,
      steps: [
        { beats: "1-2", content: "身体微下沉，重心转到左脚" },
        { beats: "3-4", content: "右手从腰部上举至头顶划圆" },
        { beats: "5-6", content: "左手下沉配合点胯" },
        { beats: "7-8", content: "回到起始位准备下一 count" }
      ],
      tips: ["注意手臂弧度不要完全伸直", "重心下压配合音乐 drop"],
      generated_at: "2026-04-17T03:12:00Z"
    }
  }))
};
```

---

## M1 · 算法 Pipeline

### 职责边界
**输入一个 MP4 → 输出合规的 Lesson JSON + 所有切片 MP4 + 缩略图**。包含节拍检测、姿态动能、切分、难度评分。

**不做**：教学生成（归 M6），HTTP 接口（归 M2）。

### 输入 / 输出
- 输入：`python run.py <video_path> --output <json_path>`
- 输出：
  - Lesson JSON（`teaching.status = "pending"`，等 M6 填充）
  - 切片 MP4 到 `../backend/data/clips/seg_XXX.mp4`
  - 缩略图到 `../backend/data/thumbs/seg_XXX.jpg`

### 对外暴露的 Python 函数

```python
def process_video(video_path: str, output_dir: str) -> dict:
    """完整 pipeline，返回 Lesson dict"""

def re_export_clip(video_path: str, segment_id: str, start: float, end: float) -> tuple[str, str]:
    """重切单个 segment，返回 (clip_path, thumb_path)。M2 的 PATCH 调用此函数"""
```

### 验收标准
- 跑 10 支 K-pop 视频都能出合规 JSON
- 所有 segment 的 start/end 必须在 lesson.beats 数组中
- 切片边界对齐节拍比例 ≥ 85%
- 难度分布合理（不全是 3 星）

### Agent 启动提示词

```
你是一个 Python 算法工程师。实现一个独立的舞蹈视频切分 pipeline 模块 M1。

【技术栈】
Python 3.11, librosa, mediapipe, opencv-python, ffmpeg-python, numpy

【输入】
python run.py <video_path> --output <json_path>
视频是 K-pop 编舞，720p 以上，BPM 90-130。

【输出】
1. Lesson JSON 写到 --output 路径，schema：
[在此粘贴共享契约中的 Lesson / Section / Segment Schema]

2. 切片 MP4 到 ../backend/data/clips/seg_XXX.mp4
3. 缩略图 JPG 到 ../backend/data/thumbs/seg_XXX.jpg

【此模块不负责】
- teaching 字段：仅填 { "status": "pending" }，由 M6 后续生成
- HTTP 接口：由 M2 负责
只保证 Lesson JSON 的结构字段全部就位、切片文件生成正确。

【核心 pipeline】
Step 1: ffmpeg 抽音频为 WAV
Step 2: librosa.beat.beat_track 检测节拍，保留完整 beats 数组（秒）
Step 3: librosa.segment.agglomerative 检测段落边界（k=5-7），生成 sections 数组
Step 4: 按 8 beat 切候选 segment，section 字段通过时间映射得到
Step 5: 视频每 3 帧抽一次，MediaPipe Pose 提取 33 关键点，计算动能曲线
Step 6: 对每个 segment 计算 avg_energy、variance、is_still、difficulty
Step 7: ffmpeg -ss -t 切 MP4 + 抽首帧作缩略图
Step 8: 组装 Lesson JSON 写入

【关键约束】
- 所有时间值保留 2 位小数
- Segment id 格式 seg_XXX（蛇形 + 3 位补零）
- 路径用 / 不用 \
- lesson.beats 必须是完整数组
- 每个 segment 的 start/end 必须存在于 beats 数组中
- teaching 字段只填 status: "pending"，不填其他字段

【暴露函数】
除 CLI 入口外，导出两个函数供 M2 调用：
- process_video(video_path, output_dir) -> dict
- re_export_clip(video_path, segment_id, start, end) -> (clip_path, thumb_path)

【项目结构】
pipeline/
├── run.py              # CLI 入口
├── config.py           # 阈值权重
├── beat_detection.py
├── pose_energy.py
├── segment_fusion.py
├── difficulty.py
├── clip_export.py
└── requirements.txt

【开始前先确认】
1. ffmpeg 和 mediapipe 是否已安装
2. 测试视频放在哪里

确认后直接写代码。每完成一个文件就让用户运行一次。
```

---

## M6 · 教学生成

### 职责边界
读取 Lesson JSON 中的 segment 列表 + 对应切片 MP4，逐个调用 VLM 生成 `teaching` 字段。

**不做**：切分、难度计算、HTTP 接口。

### 输入 / 输出
- 输入：Lesson JSON 路径 + VLM API key（环境变量）
- 输出：原地更新 Lesson JSON 的 `segments[i].teaching` 字段

### 对外暴露的函数

```python
def generate_teaching_for_segment(
    clip_path: str,
    segment: dict,
    lesson_context: dict
) -> dict:
    """为单个 segment 生成 teaching 字段，返回 teaching dict"""

def generate_teaching_for_lesson(lesson_json_path: str) -> None:
    """批量处理整个 Lesson，就地更新 JSON 文件"""
```

### 验收标准
- 单 segment 生成耗时 < 5 秒
- 失败的 segment 标记 `status: "failed"`，不中断整体流程
- 生成的 JSON 字段类型严格符合 schema（steps 是数组、tips 是数组）
- 并发控制：同时调用不超过 3 个 VLM 请求

### Agent 启动提示词

```
你是一个 Python 工程师。实现一个独立的 VLM 教学生成模块 M6。

【技术栈】
Python 3.11, opencv-python, requests, Pydantic

【目标】
为一组舞蹈切片生成教学提示，使用豆包视觉 API。

【输入】
1. Lesson JSON 文件路径（格式见共享契约）
2. 对应的切片 MP4 文件在 ../backend/data/clips/seg_XXX.mp4
3. 环境变量 DOUBAO_API_KEY

【输出】
就地更新 Lesson JSON，为每个 segment 填充 teaching 字段：
teaching = {
  "status": "ready" | "failed",
  "summary": "一句话概括（≤20 字）",
  "steps": [{"beats": "1-2", "content": "..."}],
  "tips": ["..."],
  "generated_at": "ISO datetime"
}

【prompt 模板】
对每个 segment：
1. 用 cv2 按 beat 均匀抽 4 帧关键帧，编码为 base64
2. 构造 prompt：
   "你是一位 K-pop 舞蹈教学助手。以下是一个 {beat_count} 拍舞蹈切片：
   - 所属段落：{section_label}
   - BPM：{bpm}
   - 时长：{duration}s
   - 难度：{difficulty}/5
   图片按 beat 顺序排列。
   输出 JSON（不要其他文字）：
   {\"summary\":\"\",\"steps\":[{\"beats\":\"1-2\",\"content\":\"\"}],\"tips\":[\"\"]}"
3. 调用豆包 API，解析响应
4. 校验返回 JSON 结构合法（summary 是字符串、steps 是数组、tips 是数组）
5. 写回 segment.teaching

【错误处理】
- API 调用失败（超时、429、5xx）：指数退避重试 3 次
- 返回 JSON 解析失败：记为 status: "failed"，保留 ai_description 作 fallback
- 任何单 segment 失败不中断整体流程

【并发】
用 concurrent.futures.ThreadPoolExecutor，max_workers=3
每个 segment 处理前后打印进度：[3/18] seg_003 ✓ / ✗

【对外函数】
- generate_teaching_for_segment(clip_path, segment, lesson_context) -> dict
  返回 teaching dict（单个）
- generate_teaching_for_lesson(lesson_json_path: str) -> None
  批量处理，就地更新 JSON

【CLI 入口】
python generate_teaching.py <lesson_json_path>
可重复运行：只处理 teaching.status != "ready" 的 segment

【项目结构】
teaching/
├── generate_teaching.py    # CLI 入口 + 批量函数
├── vlm_client.py           # 豆包 API 封装
├── prompts.py              # prompt 模板
├── keyframe_extract.py     # 用 cv2 抽关键帧
└── requirements.txt

【开发期测试】
如果还没拿到豆包 API key，先实现 mock_vlm_client.py 返回固定假数据，保证流程跑通。
集成期再切换真 API。

【开始前先确认】
1. 豆包 API key 是否已拿到
2. 测试用的 Lesson JSON + 切片文件是否就位
```

---

## M2 · 后端 API

### 职责边界
FastAPI 服务。暴露所有 HTTP 端点，处理静态资源，协调 M1/M6 的函数调用。

### 依赖
- 开发期：mock 所有 M1/M6 的调用（返回固定数据）
- 集成期：import M1 的 `re_export_clip`、M6 的 `generate_teaching_for_segment`

### 验收标准
- 所有端点返回格式符合契约
- `curl` 测试 6 个端点（3 GET + 3 POST/PATCH）
- PATCH 时间点校验拒绝非 beat 对齐值
- CORS 对 `localhost:3000` 开放

### Agent 启动提示词

```
你是一个 Python 后端工程师。实现 FastAPI 服务 M2。

【技术栈】
Python 3.11, FastAPI, Uvicorn, Pydantic v2

【端点清单】
GET    /api/lessons                           # 列表（不含 segments）
GET    /api/lessons/:id                       # 详情（含 segments / beats / sections）
POST   /api/import                            # 占位，返回假 job_id
PATCH  /api/lessons/:id/segments              # 批量切片操作
POST   /api/lessons/:id/regenerate            # 重新切分
POST   /api/lessons/:id/confirm               # 标记 confirmed=true
POST   /api/segments/:id/teaching/regenerate  # 重新生成教学

静态托管：
/videos/*  →  data/videos/
/clips/*   →  data/clips/
/thumbs/*  →  data/thumbs/

CORS：对 http://localhost:3000 开放所有方法

【Schema】
[在此粘贴共享契约中的 Lesson / Section / Segment]

【PATCH /api/lessons/:id/segments 请求体】
{
  "ops": [
    { "op": "update", "id": "seg_003", "start": 42.50, "end": 48.30 },
    { "op": "merge",  "ids": ["seg_005", "seg_006"] },
    { "op": "split",  "id": "seg_007", "at": 55.60 },
    { "op": "delete", "id": "seg_009" },
    { "op": "create", "start": 120.0, "end": 125.8, "section": "outro" }
  ]
}

处理逻辑：
1. 加载 lesson JSON
2. 按顺序应用每个 op
3. 每个 op 的时间点必须出现在 lesson.beats 数组中（容差 0.01s），否则 400
4. 每个受影响的 segment：调用 services.clip_reexport（集成期接 M1.re_export_clip）
5. 标记受影响的 segment.user_edited = true
6. 入队列重生成 teaching（集成期接 M6）。同时把 teaching.status 改为 "pending"
7. 重新排序 segments.index，id 保持不变（新切片用 seg_{next_num}）
8. 保存 JSON
9. 返回更新后的 Lesson

【POST /api/lessons/:id/regenerate 请求体】
{
  "granularity": 8,
  "still_handling": "mark",
  "section_detection": true
}
调用 M1.process_video 重新处理。开发期 mock 为直接返回原 Lesson。

【POST /api/segments/:id/teaching/regenerate】
- 立即返回 202 + 更新 teaching.status = "pending"
- 异步调 M6 生成
- 用内存中的简易队列（asyncio.Queue）即可，不引 Celery

【开发期 mock】
在 services/ 下实现两个占位：
- clip_reexport_mock.py：不真切视频，直接 copy 原切片 + sleep 0.3s 模拟
- teaching_generate_mock.py：返回固定假 teaching（直接复用 mock 数据）

集成期用环境变量或 feature flag 切换到真实实现。

【项目结构】
backend/
├── main.py                    # FastAPI app + CORS + static mount
├── routes/
│   ├── lessons.py             # GET 列表 + 详情 + POST regenerate/confirm
│   ├── segments.py            # PATCH + 各种 op 处理
│   ├── teaching.py            # POST teaching/regenerate
│   └── import_video.py        # POST import（占位）
├── services/
│   ├── lesson_store.py        # JSON 文件读写
│   ├── patch_ops.py           # 5 种 op 的具体处理
│   ├── beat_validator.py      # 时间点 beat 对齐校验
│   ├── clip_reexport.py       # mock 或真实重切
│   └── teaching_queue.py      # 异步队列
├── models.py                  # Pydantic
├── data/
│   ├── lessons/
│   ├── videos/
│   ├── clips/
│   └── thumbs/
└── requirements.txt

【启动】
uvicorn main:app --reload --port 8000

【mock 数据】
生成 data/lessons/antifragile_dp.json 作为测试数据，结构完全符合契约。

写完后 curl 测试 6 个端点（GET 列表、GET 详情、PATCH 每种 op、POST confirm）。
```

---

## M3 · 前端页面（首页 + 详情页）

### 职责边界
三个页面 + 共享 layout：
1. 首页 `/`：精选列表
2. 详情页 `/lesson/[id]`：切片卡片瀑布流 + 筛选 + 进度
3. 播放器页 `/player/[segId]`：包含 M4 的 `<Player>` + M5 的教学面板

**不做**：切片确认页（归 M7）、播放器内部（归 M4）、游戏化逻辑（归 M5）。

### 验收标准
- 首页显示 Lesson 卡片网格
- 详情页显示切片卡片瀑布流，每卡片显示教学 summary 截断
- 点击卡片跳播放器页
- 筛选/进度功能工作
- 占位调用 M4 组件和 M5 hook

### Agent 启动提示词

```
你是一个前端工程师。用 Next.js 14 App Router 做 M3 模块。

【技术栈】
Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, lucide-react

【要做的页面】
1. / 首页：Lesson 卡片网格 + 「导入视频」按钮
2. /lesson/[id] 详情页：切片瀑布流 + 筛选栏 + 底部进度条
3. /player/[segId] 播放器页：内嵌 <Player />（M4）+ 教学面板（M5）

【不做】
- /lesson/[id]/confirm 切片确认页 → 归 M7
- <Player /> 内部 → 归 M4，用占位 <video controls>
- useLearningProgress() → 归 M5，用占位返回假数据
- <TeachingPanel /> → 简单展示 summary + steps + tips 即可

【数据契约】
[粘贴 Lesson / Segment Schema]

【Mock 数据】
在 lib/mock.ts 定义 MOCK_LESSONS: Lesson[]。其中至少一个含 18 segments。
代码如下：
[在此粘贴共享契约中的 MOCK_LESSON 代码]
API 调用封装在 lib/api.ts，加 USE_MOCK 开关。

【详情页细节】
顶部：
- 原视频预览（<video controls>）
- 标题 + BPM + 段落统计
- 按钮「调整切片」跳 /lesson/[id]/confirm（若 confirmed=false 则用主色强提示）

筛选栏：
- Tab：全部 / 未学会
- 难度滑块：≥ N 星

切片瀑布流：
- 每卡片：
  - 缩略图（16:9）
  - 段落 pill + 时长 + 难度 ★
  - AI 教学 summary（1 行 ellipsis）
  - 「学会」Checkbox
  - is_still=true 置灰 50%
- 响应式：移动端 1 列，平板 2 列，桌面 3 列

底部悬浮栏：进度条 + 「已学会 X / N」

【播放器页细节】
布局：
- 主区：<Player segment={seg} lesson={lesson} allSegments={segments} /> (M4 占位)
- 侧栏（移动端：底部抽屉）：
  - TeachingPanel：
    - summary 作为标题
    - steps 列表（每条前缀 beats 标签）
    - tips 无序列表
    - 「重新生成」按钮（占位 console.log）
    - 如果 teaching.status = "pending" 显示骨架屏
    - 如果 teaching.status = "failed" 显示错误 + 重试

【项目结构】
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── lesson/[id]/page.tsx
│   └── player/[segId]/page.tsx
├── components/
│   ├── LessonCard.tsx
│   ├── SegmentCard.tsx
│   ├── TeachingPanel.tsx        # summary + steps + tips
│   ├── FilterBar.tsx
│   ├── ProgressFooter.tsx
│   └── Player.tsx                # 占位：原生 video
├── lib/
│   ├── api.ts
│   ├── mock.ts
│   └── types.ts
├── hooks/
│   └── useLearningProgress.ts    # 占位
└── public/

【设计】
- 配色：暖橘 #E85D24 主色 + 深灰
- 圆角 lg
- shadcn 默认字体，中文用系统字体
- 支持暗色模式

先写 types.ts + mock.ts，跑通首页，再铺详情页和播放器页。
```

---

## M4 · 播放器组件

### 职责边界
纯 React 组件 `<Player>`：变速 / 循环 / 镜像 / 上下切片 / 节拍计数。

**不做**：教学面板（归 M3 的 TeachingPanel）。

### Agent 启动提示词

```
你是一个 React 组件工程师。实现独立播放器组件 M4。

【技术栈】
React 18, TypeScript, Tailwind, lucide-react

【组件签名】
<Player
  segment={segment}
  lesson={lesson}
  allSegments={segments}
  onNavigate={(segId) => void}
  onMarkLearned={(segId) => void}
/>

【功能】
1. <video> src=segment.clip_url，默认 autoplay + loop
2. 控制栏：
   - 变速按钮组：0.5x / 0.75x / 1x / 1.25x / 1.5x
   - 循环 Toggle（默认开）
   - 镜像 Toggle（默认关）→ CSS transform: scaleX(-1)
   - 上一片 / 下一片
   - 「学会」按钮
3. 节拍计数器叠加：
   - 大字 "1,2,3,4,5,6,7,8" 循环闪烁
   - 切换频率：60 / lesson.bpm 秒
   - 视频暂停时隐藏
4. 键盘快捷键：空格 暂停/播放、← → 上下片、M 镜像、L 循环

【Segment 类型】
[粘贴 Segment Schema]

【项目结构】
components/
├── Player.tsx
├── BeatCounter.tsx
├── SpeedControl.tsx
└── PlayerControls.tsx

【独立测试】
写 demo/player/page.tsx，硬编码一个 Segment 跑所有功能。

不引第三方播放器库，用原生 video。playbackRate = n。
```

---

## M5 · 游戏化 Hooks

### 职责边界
一组 hooks 和 utils，管理学习进度和徽章。localStorage 驱动。

### Agent 启动提示词

```
你是一个前端工程师。实现游戏化 hooks 模块 M5。

【技术栈】
React 18, TypeScript, Vitest

【要实现的 hook】

1. useLearningProgress(lessonId: string)
返回：{
  learnedIds, total, setTotal, progress, markLearned, unmark, isLearned, resetLesson
}
存储：localStorage key `dp:learned:{lessonId}` = JSON 数组

2. useBadges()
返回：{ unlocked, checkAndUnlock }
内置徽章：
- first_learned, half_done, lesson_complete
- chorus_master（某 lesson 所有 chorus segment 全学会）
- three_day_streak, kpop_expert（累计 50）

3. useLearningStreak()
返回：{ currentStreak, lastActiveDate, recordActivity }

【约束】
- SSR 友好：初始 state 为空，useEffect 里读 localStorage
- 读写 try/catch，失败 fallback 到内存
- 提供 resetAll() 调试工具

【组件】
- <BadgeToast />：新徽章解锁时 toast 提示

【项目结构】
hooks/
├── useLearningProgress.ts
├── useBadges.ts
└── useLearningStreak.ts
lib/
├── storage.ts
├── badges.ts
└── types.ts
__tests__/
└── *.test.ts

【独立测试】
demo/gamification/page.tsx：
- 模拟学会按钮
- 实时显示进度 + 已解锁徽章
- reset 按钮

先写 types + storage + 徽章定义，再写 hooks。
```

---

## M7 · 切片确认页

### 职责边界
**最核心的新增模块**。`/lesson/[id]/confirm` 页面。时间轴可视化 + 切片列表 + 手动调整。

### 输入 / 输出
- 输入：M2 的 `GET /api/lessons/:id` 响应
- 输出：调 `PATCH /api/lessons/:id/segments`（mock 期写本地 state）

### 核心交互
- 时间轴拖拽切片边界（强制 beat 吸附）
- 合并 / 分割 / 删除 / 新增切片
- 预览单片
- 「确认完成」调 POST `/api/lessons/:id/confirm` 跳 `/lesson/[id]`
- 「重新切分」调 POST `/api/lessons/:id/regenerate`

### Agent 启动提示词

```
你是一个前端工程师。实现切片确认页模块 M7。这是产品最核心的交互。

【技术栈】
Next.js 14 App Router, TypeScript, Tailwind, shadcn/ui, lucide-react
可选：@use-gesture/react（拖拽手势）

【页面】
/lesson/[id]/confirm

【目标】
让用户以最少操作确认 AI 给出的切片是否准确，必要时手动调整边界。
AI 已给初版切片，绝大多数 case 只需微调 1-3 个边界。

【数据契约】
[粘贴 Lesson / Section / Segment Schema]

【页面布局（桌面）】
顶部（固定）：
- 原视频 <video>（16:9，controls）
- 视频下方：时间轴（关键交互组件）

中部（左 60% / 右 40%）：
- 左：切片列表（可滚动，当前选中高亮）
- 右：当前选中切片的操作面板

底部（固定）：
- 左：「重新切分」按钮（次要）
- 右：「确认完成」按钮（主色）

移动端：时间轴→列表→操作抽屉

【时间轴组件 <Timeline />】
props: { lesson, selectedSegId, onSelectSeg, onUpdateSegBounds }
渲染：
- 背景：按 lesson.duration 等比例展开
- 每秒一刻度，每 beat 一小刻度（从 lesson.beats 读）
- sections 层：每段一个背景色带（按 lesson.sections）
- segments 层：每个 segment 一个半透明色块
  - 左右两个手柄（可拖拽）
  - 点击色块 → onSelectSeg
  - 选中的色块高亮边框
- 播放头：跟随视频 currentTime
拖拽边界行为：
- 拖拽时显示当前时间 + 当前 beat 编号
- 调用 snap.ts 的 snapToBeat 吸附
- 按住 Shift 关闭吸附
- 释放后触发 onUpdateSegBounds
- 不允许交叉重叠：超出相邻切片边界则停在相邻边界

【切片操作面板 <SegmentEditor />】
props: { segment, segments, beats, onOp }
字段：
- 起始时间（输入框，失焦吸附 beat）
- 结束时间（同上）
- 时长（只读）
- Beat count（只读）
- Section（下拉选择，选项来自 lesson.sections）
按钮：
- 合并上一片（禁用条件：index === 0）
- 合并下一片（禁用条件：index === last）
- 在播放头位置分割（禁用条件：播放头不在 segment 内）
- 删除切片
- 预览（跳视频 currentTime 到 segment.start 并循环）
每次操作产生一个 op 对象，加入本地 pending ops 队列。

【pending ops 队列】
用户做的所有修改先存到 pendingOps: Op[]。
右上角显示 "已修改 N 处" badge。
点击「确认完成」时：
1. 将 pendingOps 发给 PATCH /api/lessons/:id/segments
2. 成功后调 POST /api/lessons/:id/confirm
3. router.push(`/lesson/${id}`)
「放弃修改」按钮清空队列。

【hook <useSegmentEditor />】
管理：
- 本地工作态的 segments（应用了 pendingOps 后的结果）
- pendingOps 数组
- selectedSegId
- 对外提供：update/merge/split/delete/create/undo/commit

undo：弹出最后一个 op，重新计算工作态 segments。

【beat 吸附工具 lib/snap.ts】
function snapToBeat(time: number, beats: number[], tolerance = 0.1): number {
  const nearest = beats.reduce((a, b) =>
    Math.abs(b - time) < Math.abs(a - time) ? b : a
  );
  return Math.abs(nearest - time) < tolerance ? nearest : time;
}

【API 调用 mock】
开发期 lib/api.ts 的 patchSegments 和 confirmLesson 都返回 Promise.resolve(mockLesson)。
集成期切换到真请求。

【重新切分弹窗 <RegenerateDialog />】
用 shadcn Dialog。表单：
- 切片粒度 Radio：4 / 8 / 16 拍
- 静止片段处理 Radio：标记 / 合并 / 删除
- 段落检测 Toggle
- 「重新切分」按钮 → POST /api/lessons/:id/regenerate
重新切分后页面刷新，pending ops 清空。

【项目结构】
app/lesson/[id]/confirm/page.tsx
components/
├── Timeline.tsx
├── TimelineSegmentBlock.tsx
├── TimelineBeatRuler.tsx
├── SegmentList.tsx
├── SegmentEditor.tsx
└── RegenerateDialog.tsx
hooks/
└── useSegmentEditor.ts
lib/
├── snap.ts
└── ops.ts                # 将 ops 应用到 segments 的纯函数
__tests__/
└── ops.test.ts           # 测试每种 op 的正确性

【独立测试】
写 demo/confirm/page.tsx：
- 用 mock Lesson（18 个 segment）
- 完整交互能跑通
- 「确认完成」按钮只 console.log 所有 pending ops 不真调 API

【关键约束】
- 所有时间吸附 beat，不支持半拍
- op 必须是 immutable（产出新数组，不修改原对象）
- 操作面板在窗口缩小到移动端时变成底部抽屉

先写 ops.ts 纯函数 + 单测，再写 Timeline 组件。
Timeline 实现最复杂，先做不可交互版本能正确显示，再加拖拽。
```

---

## 集成阶段

### 顺序
```
Day 1 夜间：M1 完成 → 开始 M6 教学生成（并行于其他模块继续开发）
Day 2 早上：
  - M2 从 mock 切换到真 M1/M6 函数
  - M3 / M7 从 USE_MOCK=true 切换到真后端
  - M4 / M5 通过 M3 / 播放器页集成测试
  - 所有 localhost 跨域确认
```

### 集成检查清单

```
[ ] M1 跑完 10 支视频，teaching.status = "pending"
[ ] M6 批量跑完所有 segment 的 teaching
[ ] backend/data/lessons/*.json 全部就位
[ ] M2 GET /api/lessons 返回 10 条
[ ] M2 GET /api/lessons/:id 返回完整 lesson（含 teaching）
[ ] M2 PATCH 处理 5 种 op 都正确
[ ] M2 POST regenerate / confirm / teaching/regenerate 响应正确
[ ] M3 首页能加载真 API
[ ] M3 详情页卡片显示 teaching.summary
[ ] M3 播放器页 TeachingPanel 正确展示 summary / steps / tips
[ ] M4 Player 组件接入 M3 详情页
[ ] M5 学习进度接入 M3，进度条真实联动
[ ] M7 确认页能加载真 API
[ ] M7 拖拽 → PATCH → 成功收到新 lesson
[ ] M7 「确认完成」→ confirmed=true → 跳详情页
[ ] CORS 通过浏览器实测
[ ] 视频静态资源能播放
```

### 集成冲突高发区（必须提前对齐）

| 点 | 规范 |
|---|---|
| Segment ID | `seg_XXX`（蛇形 + 3 位补零）。**新创建的切片** 续编号，e.g. 原有到 seg_017，split 产物为 seg_018 + seg_019 |
| 路径分隔符 | 全部 `/`。Windows 下 M1 生成时必须转换 |
| 时间精度 | `start` / `end` / `duration` 保留 2 位小数 |
| Beat 对齐 | 所有 segment 时间点必须在 `lesson.beats` 数组中（容差 0.01s） |
| 空态 | 前端必须处理 `segments: []`、`sections: []`、`teaching: null` 三种空态 |
| URL 拼接 | M1 只写相对路径 `/videos/xxx.mp4`，前端用 `${API_BASE}` 拼 |
| Op 字段名 | `op` 必须是 `"update" \| "merge" \| "split" \| "delete" \| "create"`，不要 `"edit"`、`"add"` 等变体 |
| teaching.status | 必须是 `"ready" \| "pending" \| "failed"`，不要 `"done"`、`"error"` 等变体 |

---

## 启动方式

开 7 个独立的 Claude Code / Cursor 会话。每个会话只给：
- 本模块的启动提示词（整块复制）
- 共享契约部分（Schema / API / Mock 数据）

**不要把整份 PRD 或这份文档全部丢给 agent**，会引发越权修改。

每 2 小时做一次产出验收。任何修改共享契约的行为必须先同步到本文档。
