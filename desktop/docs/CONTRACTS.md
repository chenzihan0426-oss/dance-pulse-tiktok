# 共享数据契约

**这份文档是唯一的真相来源**。任何模块的类型定义、API schema 与此处不一致的都要改模块，不改这里。

---

## TypeScript 类型（给前端用）

放在 `frontend/lib/types.ts`，所有前端模块 import 此处。

```typescript
// ============ Lesson ============
export interface Lesson {
  id: string;
  title: string;
  source_url: string;
  duration: number;
  bpm: number;
  video_url: string;         // 相对路径，e.g. /videos/xxx.mp4
  thumbnail: string;
  confirmed: boolean;
  beats: number[];           // 完整 beat 时间点数组
  sections: Section[];
  segments: Segment[];
}

export interface Section {
  id: string;                // e.g. "chorus_1"
  label: string;             // e.g. "副歌 1"
  start: number;
  end: number;
}

export interface Segment {
  id: string;                // 格式 seg_XXX
  lesson_id: string;
  index: number;
  section: string;
  section_label: string;
  start: number;             // 2 位小数
  end: number;
  duration: number;
  beat_count: number;        // 通常 8
  thumbnail: string;
  clip_url: string;
  difficulty: number;        // 1-5
  is_still: boolean;
  ai_description: string;
  user_edited: boolean;
  teaching: Teaching;
  deleted?: boolean;         // 软删除标记
}

export interface Teaching {
  status: "ready" | "pending" | "failed";
  summary: string;
  steps: TeachingStep[];
  tips: string[];
  generated_at: string;      // ISO datetime
}

export interface TeachingStep {
  beats: string;             // e.g. "1-2"
  content: string;
}

// ============ Ops（PATCH 请求体）============
export type Op =
  | { op: "update"; id: string; start: number; end: number }
  | { op: "merge"; ids: string[] }
  | { op: "split"; id: string; at: number }
  | { op: "delete"; id: string }
  | { op: "create"; start: number; end: number; section: string };

export interface PatchSegmentsRequest {
  ops: Op[];
}

export interface RegenerateRequest {
  granularity: 4 | 8 | 16;
  still_handling: "mark" | "merge" | "delete";
  section_detection: boolean;
}

// ============ 游戏化（M5）============
export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked_at?: string;
}

export interface LearningProgress {
  lessonId: string;
  learnedIds: string[];
  total: number;
  progress: number;          // 0-1
}
```

---

## Pydantic 模型（给后端用）

放在 `backend/models.py`。

```python
from typing import Literal, Optional
from pydantic import BaseModel, Field

class TeachingStep(BaseModel):
    beats: str
    content: str

class Teaching(BaseModel):
    status: Literal["ready", "pending", "failed"]
    summary: str = ""
    steps: list[TeachingStep] = []
    tips: list[str] = []
    generated_at: str = ""

class Segment(BaseModel):
    id: str
    lesson_id: str
    index: int
    section: str
    section_label: str
    start: float
    end: float
    duration: float
    beat_count: int = 8
    thumbnail: str
    clip_url: str
    difficulty: int = Field(ge=1, le=5)
    is_still: bool = False
    ai_description: str = ""
    user_edited: bool = False
    teaching: Teaching
    deleted: bool = False

class Section(BaseModel):
    id: str
    label: str
    start: float
    end: float

class Lesson(BaseModel):
    id: str
    title: str
    source_url: str = ""
    duration: float
    bpm: float
    video_url: str
    thumbnail: str
    confirmed: bool = False
    beats: list[float]
    sections: list[Section]
    segments: list[Segment]

# ============ Ops ============
class UpdateOp(BaseModel):
    op: Literal["update"]
    id: str
    start: float
    end: float

class MergeOp(BaseModel):
    op: Literal["merge"]
    ids: list[str]

class SplitOp(BaseModel):
    op: Literal["split"]
    id: str
    at: float

class DeleteOp(BaseModel):
    op: Literal["delete"]
    id: str

class CreateOp(BaseModel):
    op: Literal["create"]
    start: float
    end: float
    section: str

Op = UpdateOp | MergeOp | SplitOp | DeleteOp | CreateOp

class PatchSegmentsRequest(BaseModel):
    ops: list[Op]

class RegenerateRequest(BaseModel):
    granularity: Literal[4, 8, 16] = 8
    still_handling: Literal["mark", "merge", "delete"] = "mark"
    section_detection: bool = True
```

---

## HTTP API

所有端点详细说明。

### `GET /api/lessons`
列表。**不含** segments。

Response:
```json
[
  { "id": "...", "title": "...", "bpm": 126, "duration": 203.4,
    "thumbnail": "/thumbs/xxx.jpg", "confirmed": true }
]
```

### `GET /api/lessons/:id`
详情。**含** segments / beats / sections。

Response: 完整 `Lesson` 对象。404 当 id 不存在。

### `POST /api/import`
上传视频。

Request: `multipart/form-data`，字段 `file`。

Response:
```json
{ "job_id": "job_xxx", "lesson_id": "xxx" }
```

### `PATCH /api/lessons/:id/segments`
批量切片操作。

Request:
```json
{
  "ops": [
    { "op": "update", "id": "seg_003", "start": 42.50, "end": 48.30 },
    { "op": "merge", "ids": ["seg_005", "seg_006"] },
    { "op": "split", "id": "seg_007", "at": 55.60 },
    { "op": "delete", "id": "seg_009" },
    { "op": "create", "start": 120.0, "end": 125.8, "section": "outro" }
  ]
}
```

Response: 更新后的完整 Lesson。

400 条件：
- 时间点不在 `lesson.beats` 中（容差 0.01s）
- update 后 start >= end
- 时间区间与其他 segment 重叠
- merge 的 ids 不连续

### `POST /api/lessons/:id/regenerate`
重新切分整支 lesson。

Request:
```json
{ "granularity": 8, "still_handling": "mark", "section_detection": true }
```

Response: 更新后的完整 Lesson（segments 全部重新生成，confirmed 重置为 false）。

### `POST /api/lessons/:id/confirm`
标记确认完成。

Response:
```json
{ "id": "...", "confirmed": true }
```

### `POST /api/segments/:id/teaching/regenerate`
异步重生成教学。

Response（立即返回）：
```json
{ "segment_id": "seg_003", "status": "pending" }
```

后端异步调 M6，完成后 segment.teaching.status 变为 ready/failed。前端轮询 GET lesson 检查更新。

### 静态资源
- `GET /videos/:file`
- `GET /clips/:file`
- `GET /thumbs/:file`

都从 `backend/data/` 对应子目录直接托管。

---

## Mock 数据

开发期 frontend 的 `lib/mock.ts`：

```typescript
export const MOCK_LESSON: Lesson = {
  id: "antifragile_dp",
  title: "ANTIFRAGILE - LE SSERAFIM",
  source_url: "https://www.douyin.com/video/demo",
  duration: 203.4,
  bpm: 126,
  video_url: "/videos/antifragile.mp4",
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
    clip_url: `/clips/seg_${String(i).padStart(3, "0")}.mp4`,
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

export const MOCK_LESSONS: Lesson[] = [MOCK_LESSON];
```
