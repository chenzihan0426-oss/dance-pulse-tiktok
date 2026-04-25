# 舞拍 DancePulse · PRD v1.1

> K-pop 编舞视频自动拆片 + 卡片化学习。工程文档。

---

## 0. 概述

把 K-pop 编舞视频拆成可独立循环学习的 8 拍卡片教程。处理流程三段式：

```
用户上传/选取视频
      │
      ▼
[1] AI 自动拆片（音频节拍 + 姿态动能融合）
      │
      ▼
[2] 用户确认与手动调整（新增）
      │
      ▼
[3] AI 教学生成（VLM 逐切片生成 summary / steps / tips）
      │
      ▼
[4] 卡片教程页（含教学提示 + 独立播放器）
```

v1.1 相对 v1.0 的增量：
- 新增 **切片确认与手动调整** 环节
- 每个切片附带 **AI 生成的分步教学提示**（不再只有一行描述）

---

## 1. 范围与约束

### 1.1 目标舞种
仅 K-pop 编舞（BPM 90–130、4/4 拍）。节拍稳定性是整个 pipeline 的前提。

### 1.2 视频来源
- **主路径**：本地 MP4 上传
- **预置库**：10 支精选视频，pipeline 离线跑完，用户进入时跳过处理步骤
- **辅路径**：抖音精选分享链接解析（仅入口展示，可降级为不支持）

### 1.3 边界（明确不做）
- 无用户系统，学习状态存 `localStorage`
- 无数据库，数据以 JSON 文件形式存 `backend/data/lessons/`
- 不做原生 App
- 不支持非 K-pop 舞种
- 不做摄像头姿态对比打分（v2）
- 不做内容审核、版权交易、推荐算法

---

## 2. 功能清单

### P0 · 必须完成

| ID | 功能 | 说明 |
|---|---|---|
| F1 | 视频导入 | 本地上传 + 抖音链接解析入口 |
| F2 | 自动拆片 | 节拍 + 动能融合切分，按 8 拍为单元 |
| F3 | **切片确认页** | 时间轴可视化 + 切片列表 + 手动调整（边界/合并/分割/删除/新增） |
| F4 | **AI 教学生成** | 每个切片生成 `summary` + `steps` + `tips`，VLM 驱动 |
| F5 | 卡片教程页 | 切片瀑布流，每卡片显示教学摘要 |
| F6 | 单卡片播放器 | 循环 / 变速（0.5x–1.5x）/ 镜像 / 上下切片 / 节拍计数 |
| F7 | 难度筛选 | 1–5 星，可隐藏已学会 |
| F8 | 学习进度 | localStorage 驱动，进度条 + 徽章 |

### P1 · 有时间就做

| ID | 功能 | 说明 |
|---|---|---|
| F9 | 人体自动跟随变焦 | MediaPipe 人体 bbox + 数字变焦 1.5x |
| F10 | 跟练模式 | 全屏大字节拍计数器 + 教学要点叠加 |
| F11 | 单片分享链接 | URL 携带 segment id |
| F12 | 教学手动编辑 | 用户可覆盖 AI 生成的 teaching 字段 |

### P2 · 路线图（不实现）

摄像头姿态对比打分 · 非 K-pop 舞种 · 连招社区 · 个性化推荐。

---

## 3. 用户主流程

### 3.1 上传 → 学习主路径

```
/ 首页
  │ 点「导入视频」
  ▼
/import 上传进度页
  │ pipeline 跑完（节拍 → 姿态 → 切分 → 教学生成）
  ▼
/lesson/:id/confirm 切片确认页   ← 新增
  │ 用户调整 / 直接确认
  ▼
/lesson/:id 教程页
  │ 点任意卡片
  ▼
/player/:segId 播放器页
```

### 3.2 预置视频路径

预置 10 支视频已完成 pipeline，用户直接跳到 `/lesson/:id` 教程页。切片确认入口仍保留在页面右上角（「调整切片」按钮），随时可进入 `/confirm` 页重新调整，学习状态（已学会标记）保留。

### 3.3 切片确认页详细行为

**目标**：最小化用户操作。AI 已给初版，绝大多数情况只需微调 1–3 个边界。

**三种确认路径**：
1. **全部通过**：点击「确认完成」，直接进入教程页
2. **局部调整**：拖拽时间轴上的切片边界 / 用列表右侧面板操作 / 确认完成
3. **重新切分**：若 AI 切分完全跑偏，选「重新切分」并指定参数（粒度、静止处理、段落检测开关），后端重跑 pipeline

**可执行操作**：

| 操作 | 交互 | 说明 |
|---|---|---|
| 调整边界 | 拖拽时间轴切片块左右手柄 | 自动吸附到最近 beat（容差 ±100ms），按住 Shift 关闭吸附 |
| 手动输入时间 | 侧栏输入框 | 用于精确调整，同样吸附到 beat |
| 合并切片 | 选中切片 → 合并上一片/下一片 | 合并后教学内容异步重生成 |
| 分割切片 | 播放头定位 → 分割 | 分成两段，各自异步重生成教学 |
| 删除切片 | 标记删除，不删文件 | 可恢复 |
| 新增切片 | 时间轴空白处拖拽 | 从 beat 到 beat |
| 预览切片 | 点击切片自动跳转视频播放位置 | 单片循环预览 |

**节拍吸附**：所有时间调整都强制落在 beat 点上，保证切片时长是 beat 间隔的整数倍。Lesson JSON 里存有完整 beat 时间数组供前端吸附。

**确认后处理**：
- Lesson 标记 `confirmed: true`
- 被修改的切片标记 `user_edited: true`
- 后端异步重新切 MP4 + 重新生成教学
- 前端可立即进入教程页，教学内容加载中显示占位

---

## 4. 信息架构

```
/                             首页：精选列表 + 上传入口
/import                       上传进度页（可选，也可全屏 modal）
/lesson/:id/confirm           切片确认页（新增）
/lesson/:id                   教程页（卡片瀑布流）
/player/:segId                播放器页
```

### 4.1 切片确认页布局

**桌面端**（1024px+）：
```
┌──────────────────────────────────────────────────┐
│  原视频预览（16:9）       │  当前切片操作面板     │
│                           │  - 起止时间           │
│                           │  - 合并 / 分割 / 删除 │
│                           │  - 预览 / 重生成教学  │
├───────────────────────────┴───────────────────────┤
│  时间轴（beat 刻度 + 段落色带 + 切片块）         │
│  [■■■][■■■■][■■■][■][■■■■■]...                 │
├──────────────────────────────────────────────────┤
│  切片列表（可滚动，每行显示 id/段落/时长/缩略图） │
│  [已选] ...                                       │
├──────────────────────────────────────────────────┤
│  [重新切分]              [全部通过][确认完成]     │
└──────────────────────────────────────────────────┘
```

**移动端**：时间轴上、列表下，操作面板以底部抽屉弹出。

### 4.2 教程页卡片结构

每张卡片展示：
- 缩略图（16:9）
- 段落标签 pill（如「副歌 1」）
- 时长 + 难度 ★★★
- **AI 教学 `summary`**（一行，ellipsis 截断）
- 「学会」开关
- 点击跳转播放器页

静止片段（`is_still: true`）整体置灰 50%，教学字段为空。

### 4.3 播放器页教学面板

- 视频主区 + 节拍计数叠加
- 教学面板（桌面端侧边，移动端底部抽屉）：
  - `summary`：标题行
  - `steps`：分步列表（每步带 beat 范围标签）
  - `tips`：要点列表
  - 「重新生成」按钮（调 regenerate-teaching 端点）

---

## 5. 技术架构

### 5.1 Pipeline

```
[1] ffmpeg 抽音频 WAV
[2] librosa.beat.beat_track → 节拍时间点数组
[3] librosa.segment.agglomerative → 段落边界（k=5–7）
[4] 按 8 beat 切候选段 + 映射 section 标签
[5] MediaPipe Pose 抽帧 → 动能曲线
[6] 融合：is_still 判定 + difficulty 计算
[7] ffmpeg 切 MP4 + 抽缩略图
[8] 教学生成（新增）：
    for each segment:
      frames = extract_keyframes(segment, n=4)   # 按 beat 均匀抽
      prompt = build_teaching_prompt(frames, context)
      teaching = vlm_call(prompt)
      segment.teaching = validate_and_parse(teaching)
[9] 写 Lesson JSON（confirmed=false, beats=[...], sections=[...]）
```

### 5.2 教学生成 Prompt 模板

```
你是一位 K-pop 舞蹈教学助手。以下是一个 {beat_count} 拍舞蹈切片：
- 所属段落：{section_label}
- BPM：{bpm}
- 时长：{duration}s
- 难度：{difficulty}/5

图片：按 beat 顺序排列的 4 个关键帧。

请输出 JSON（不要其他文字）：
{
  "summary": "一句话概括这段动作（不超过 20 字）",
  "steps": [
    {"beats": "1-2", "content": "该 beat 范围内的动作描述"},
    {"beats": "3-4", "content": "..."}
  ],
  "tips": ["学习要点或易错提示，每条不超过 30 字"]
}
```

调用失败降级：`teaching = null`，前端显示占位并提供手动触发重新生成的按钮。

### 5.3 切片确认的数据流

```
Pipeline 完成
  ↓
Lesson JSON 写入 data/lessons/{id}.json
  ↓ (confirmed: false)
前端访问 /lesson/:id/confirm
  ↓
用户调整 → PATCH /api/lessons/:id/segments
  ↓
后端处理 PATCH 请求：
  - 更新 segments 数组（边界/合并/分割/删除/新增）
  - 立即重切受影响的 MP4 + 缩略图
  - 异步任务队列：重新生成受影响切片的 teaching
  - 返回更新后的 Lesson JSON
前端重新渲染 → 用户继续调整 或 点确认完成
  ↓
POST /api/lessons/:id/confirm → confirmed: true
  ↓
前端跳转 /lesson/:id 教程页
```

教学异步任务用极简的进程内队列即可（MVP 不引 Celery / Redis），失败则 `teaching.status = "failed"`，前端提供重试入口。

### 5.4 节拍吸附实现

前端拿到 Lesson JSON 时已包含完整 `beats: number[]` 数组。拖拽边界时：

```typescript
function snapToBeat(time: number, beats: number[], tolerance = 0.1): number {
  const nearest = beats.reduce((a, b) =>
    Math.abs(b - time) < Math.abs(a - time) ? b : a
  );
  return Math.abs(nearest - time) < tolerance ? nearest : time;
}
```

按住 Shift 时跳过吸附。所有切片边界最终落在 beat 点上。

---

## 6. 数据模型

### 6.1 Lesson（v1.1 扩展）

```json
{
  "id": "string",
  "title": "string",
  "source_url": "string",
  "duration": "number",
  "bpm": "number",
  "video_url": "string",
  "thumbnail": "string",

  "confirmed": "boolean",
  "beats": [12.34, 12.81, ...],
  "sections": [
    { "id": "chorus_1", "label": "副歌 1", "start": 42.30, "end": 82.10 }
  ],
  "segments": [ /* Segment[] */ ]
}
```

新增字段：
- `confirmed`：用户是否已确认切片
- `beats`：完整 beat 时间点数组，供前端吸附
- `sections`：段落边界数组，供时间轴渲染色带

### 6.2 Segment（v1.1 扩展）

```json
{
  "id": "seg_003",
  "lesson_id": "string",
  "index": 3,
  "section": "chorus_1",
  "section_label": "副歌 1",
  "start": 42.30,
  "end": 48.10,
  "duration": 5.80,
  "beat_count": 8,
  "thumbnail": "/thumbs/seg_003.jpg",
  "clip_url": "/clips/seg_003.mp4",
  "difficulty": 4,
  "is_still": false,
  "ai_description": "右手上举画圆，左脚向前点地",

  "user_edited": false,
  "teaching": {
    "status": "ready",
    "summary": "副歌主打动作，两拍一个 count",
    "steps": [
      { "beats": "1-2", "content": "身体微下沉，重心转到左脚" },
      { "beats": "3-4", "content": "右手从腰部上举至头顶划圆" },
      { "beats": "5-6", "content": "左手下沉配合点胯" },
      { "beats": "7-8", "content": "回到起始位，准备下一个 count" }
    ],
    "tips": [
      "注意手臂弧度，不要完全伸直",
      "重心下压配合音乐 drop"
    ],
    "generated_at": "2026-04-17T03:12:00Z"
  }
}
```

新增字段：
- `user_edited`：切片是否被用户手动调整过
- `teaching.status`：`"ready" | "pending" | "failed"`
- `teaching.summary` / `steps` / `tips`：AI 生成的教学内容
- `teaching.generated_at`：生成时间，手动调整后会更新

`ai_description` 保留，作为 teaching 未生成时的 fallback 展示。

### 6.3 HTTP API

```
GET    /api/lessons                           # 列表（不含 segments）
GET    /api/lessons/:id                       # 详情（含 segments / beats / sections）
POST   /api/import                            # 上传新视频

PATCH  /api/lessons/:id/segments              # 批量更新切片（新增）
POST   /api/lessons/:id/regenerate            # 重新切分（新增）
POST   /api/lessons/:id/confirm               # 标记确认完成（新增）
POST   /api/segments/:id/teaching/regenerate  # 重新生成教学（新增）

GET    /videos/:file                          # 静态
GET    /clips/:file                           # 静态
GET    /thumbs/:file                          # 静态
```

### 6.4 PATCH segments 请求体

支持混合操作，按顺序执行：

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

响应返回更新后的完整 Lesson JSON。后端负责：
- 验证所有时间点对齐 beat
- 同步重切受影响的 MP4 和缩略图
- 入队列异步重生成受影响的 teaching
- 维护 `segments.index` 顺序

### 6.5 regenerate 请求体

```json
{
  "granularity": 8,
  "still_handling": "mark",
  "section_detection": true
}
```

- `granularity`: 4 / 8 / 16，切片粒度（beat 数）
- `still_handling`: `"mark"` / `"merge"` / `"delete"`，静止片段如何处理
- `section_detection`: 是否做段落检测（否则所有切片 section 统一为 `"unknown"`）

---

## 7. 风险与开放问题

| 风险 | 概率 | 缓解 |
|---|---|---|
| 节拍检测对部分视频不准 | 中 | 视频库只选节拍清晰的；预处理时人工调阈值 |
| MediaPipe 长视频慢 | 中 | 抽帧降到 10fps；Lite 模型 |
| **VLM 教学生成质量不稳定** | 高 | 结构化 JSON prompt + 校验失败降级；fallback 到 `ai_description` |
| **VLM API 调用延迟 / 失败** | 中 | 异步队列 + 指数退避；失败标记 status=failed；前端重试入口 |
| **用户手动调整后教学重生成慢** | 中 | 先显示旧 teaching + loading 标记；后台生成完毕替换 |
| **切片边界不对齐 beat** | 低 | 前端强制吸附；后端 PATCH 时校验并拒绝非法请求 |
| **重切 MP4 累积存储** | 低 | 定期清理无引用切片；文件名含 lesson_id 便于批量清理 |
| 浏览器 `playbackRate` 音画不同步 | 低 | 接受音高失真；P2 接入 Web Audio API 做变速不变调 |

### 7.1 开放问题（待决策）

- **重新切分时**是否清空已学会状态？倾向：保留 segment id 不变的保留状态，新 id 则无状态。
- **教学生成并发度**：VLM API 的并发限制未知，需实测调整 worker 数。
- **手动调整后**的切片是否重新跑 difficulty 计算？倾向：重跑，因为 duration 可能变化。
- **时间轴移动端交互**：拖拽手柄在小屏上精度不足，考虑加「微调 ±0.5 beat」按钮。

---

## 8. 关键设计约束汇总

- 现场 Demo 不做实时处理，10 支预置视频 pipeline 离线完成
- 所有时间值保留 2 位小数
- Segment id 格式统一 `seg_XXX`（蛇形 + 3 位补零）
- 所有路径用 `/`（跨平台）
- 切片边界必须对齐 beat
- teaching 生成失败不阻塞主流程
- 切片删除是软删除（标记 `deleted: true`，保留文件）
