# 后端合并说明（M2）

M2 的 backend 是独立开发的，直接复制，只需要改 3 处：
1. 从 `services/clip_reexport_mock.py` 切到真实 M1 调用
2. 从 `services/teaching_generate_mock.py` 切到真实 M6 调用
3. 确认 CORS、静态资源路径

---

## Step 1 · 整个 backend 拷过来

```bash
cp -r ~/modules/backend-m2/. ./
```

确保这些文件都在：

```
backend/
├── main.py
├── requirements.txt
├── models.py
├── routes/
│   ├── lessons.py
│   ├── segments.py
│   ├── teaching.py
│   └── import_video.py
├── services/
│   ├── lesson_store.py
│   ├── patch_ops.py
│   ├── beat_validator.py
│   ├── clip_reexport.py          # mock 版或真实版
│   └── teaching_queue.py
└── data/
    ├── lessons/
    ├── clips/
    ├── thumbs/
    └── videos/
```

---

## Step 2 · 安装依赖

```bash
pip install -r requirements.txt
```

确保 `requirements.txt` 至少含：

```
fastapi>=0.110
uvicorn[standard]>=0.27
pydantic>=2.5
python-multipart>=0.0.9
python-dotenv>=1.0
```

---

## Step 3 · 接入真实的 M1 / M6

默认 M2 开发期用的是 mock 实现。现在需要从同级目录 import M1 / M6 的函数。

### 方案 A · sys.path hack（最快）

编辑 `backend/services/clip_reexport.py`：

```python
import os, sys
from pathlib import Path

# 把 pipeline 目录加到 path
PIPELINE_DIR = Path(__file__).resolve().parent.parent.parent / "pipeline"
sys.path.insert(0, str(PIPELINE_DIR))

from clip_export import re_export_clip as _pipeline_re_export  # M1 暴露的函数

def reexport_clip(lesson_id: str, segment_id: str, start: float, end: float, video_path: str):
    """
    统一的入口，供 routes/segments.py 调用。
    """
    use_mock = os.getenv("USE_MOCK_CLIP_REEXPORT", "false").lower() == "true"
    if use_mock:
        import time
        time.sleep(0.3)
        return (f"/clips/{segment_id}.mp4", f"/thumbs/{segment_id}.jpg")

    clip_path, thumb_path = _pipeline_re_export(video_path, segment_id, start, end)
    # 统一用 / 路径
    return (
        clip_path.replace("\\", "/"),
        thumb_path.replace("\\", "/"),
    )
```

编辑 `backend/services/teaching_queue.py`：

```python
import os, sys
from pathlib import Path

TEACHING_DIR = Path(__file__).resolve().parent.parent.parent / "teaching"
sys.path.insert(0, str(TEACHING_DIR))

from generate_teaching import generate_teaching_for_segment as _real_gen  # M6 暴露的函数

def generate_teaching(clip_path: str, segment: dict, lesson_context: dict):
    use_mock = os.getenv("USE_MOCK_TEACHING", "false").lower() == "true"
    if use_mock:
        return {
            "status": "ready",
            "summary": "（mock）",
            "steps": [{"beats": "1-2", "content": "mock 步骤"}],
            "tips": ["mock tip"],
            "generated_at": "2026-04-17T00:00:00Z"
        }
    return _real_gen(clip_path, segment, lesson_context)
```

### 方案 B · 把 pipeline / teaching 装成可安装包

更干净，但配置多。MVP 期推荐方案 A。

---

## Step 4 · 确认 CORS

`main.py` 里必须有：

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

生产部署时 `allow_origins` 改成前端实际 origin。

---

## Step 5 · 确认静态资源

`main.py` 里必须 mount：

```python
from fastapi.staticfiles import StaticFiles

app.mount("/videos", StaticFiles(directory="data/videos"), name="videos")
app.mount("/clips",  StaticFiles(directory="data/clips"),  name="clips")
app.mount("/thumbs", StaticFiles(directory="data/thumbs"), name="thumbs")
```

启动后 `curl -I http://localhost:8000/clips/seg_003.mp4` 应该返回 200。

---

## Step 6 · 启动

```bash
cd backend
uvicorn main:app --reload --port 8000
```

---

## Step 7 · 测所有端点

```bash
# 列表
curl http://localhost:8000/api/lessons

# 详情
curl http://localhost:8000/api/lessons/antifragile_dp

# PATCH update
curl -X PATCH http://localhost:8000/api/lessons/antifragile_dp/segments \
  -H 'Content-Type: application/json' \
  -d '{"ops":[{"op":"update","id":"seg_003","start":42.50,"end":48.30}]}'

# PATCH 非法（应返回 400）
curl -X PATCH http://localhost:8000/api/lessons/antifragile_dp/segments \
  -H 'Content-Type: application/json' \
  -d '{"ops":[{"op":"update","id":"seg_003","start":42.55,"end":48.35}]}'

# Confirm
curl -X POST http://localhost:8000/api/lessons/antifragile_dp/confirm

# Regenerate
curl -X POST http://localhost:8000/api/lessons/antifragile_dp/regenerate \
  -H 'Content-Type: application/json' \
  -d '{"granularity":8,"still_handling":"mark","section_detection":true}'

# Teaching regenerate
curl -X POST http://localhost:8000/api/segments/seg_003/teaching/regenerate
```

---

## 备忘 · 后端处理 PATCH 时需要保证

1. 收到 ops 先过 `beat_validator.py` 校验所有时间点
2. 按顺序应用 ops，中间状态不写盘
3. 最终状态一次性写盘
4. 调 `clip_reexport.reexport_clip()` 生成新 MP4 和缩略图
5. 异步入队列 `teaching_queue.enqueue_regenerate()` 重生成教学
6. 更新 `segments[i].index`（重排）
7. 保持 id 不变，新切片用 `seg_{next_n:03d}`

---

## 容易出问题的地方

| 问题 | 处理 |
|---|---|
| import M1 时 ModuleNotFoundError | sys.path 加 pipeline 绝对路径，别用相对 |
| 跨平台路径（Win 上的 \） | 写 JSON 前全部 `.replace('\\', '/')` |
| PATCH 后 segment 顺序错乱 | 重新按 start 排序，重新计算 index |
| teaching 队列并发 > 3 触发 VLM 限流 | `teaching_queue.py` 里 Semaphore 限 3 |
| 文件生成但浏览器 404 | 检查 StaticFiles mount 路径是否指向 `data/`（相对 `cwd`，不是绝对路径） |
| CORS 报错但代码里有 CORSMiddleware | CORSMiddleware 必须在其他中间件之前加 |
