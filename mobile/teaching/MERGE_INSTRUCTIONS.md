# Teaching 合并说明（M6）

---

## Step 1 · 整个拷过来

```bash
cp -r ~/modules/teaching-m6/. ./
```

确认文件在位：

```
teaching/
├── generate_teaching.py
├── vlm_client.py
├── prompts.py
├── keyframe_extract.py
└── requirements.txt
```

---

## Step 2 · 安装依赖

```bash
pip install -r requirements.txt
```

至少需要：
```
opencv-python
requests
pydantic
python-dotenv
```

---

## Step 3 · 配置 API Key

从根目录 `.env` 读：

```bash
export $(grep -v '^#' ../.env | xargs)
echo $DASHSCOPE_API_KEY
```

或者让 `generate_teaching.py` 启动时自己 load：

```python
from dotenv import load_dotenv
load_dotenv("../.env")
```

---

## Step 4 · 验证 CLI

```bash
python generate_teaching.py ../backend/data/lessons/test.json
```

应当看到：
```
[1/18] seg_000 ✓
[2/18] seg_001 ✓
[3/18] seg_002 ✗  (VLM timeout)
...
✓ 17 ready / ✗ 1 failed
```

JSON 文件被就地更新，每个 segment 的 `teaching` 字段被填充。

---

## Step 5 · 验证对外函数

M2 会通过 Python import 调用：

```python
# generate_teaching_for_segment(clip_path, segment, lesson_context) -> dict
# generate_teaching_for_lesson(lesson_json_path) -> None
```

```bash
cd teaching
python -c "from generate_teaching import generate_teaching_for_segment, generate_teaching_for_lesson"
```

不报错即可。

---

## Step 6 · Mock 模式（没拿到 API Key 时）

如果还没拿到豆包 API Key，应该在 `teaching/` 下有 `mock_vlm_client.py`。

在 `vlm_client.py` 里做 env 分流：

```python
import os

def call_vlm(prompt, images):
    if os.getenv("USE_MOCK_TEACHING", "false").lower() == "true":
        from .mock_vlm_client import call_mock
        return call_mock(prompt, images)
    # 真实调用
    ...
```

---

## Step 7 · 幂等性保证

重跑 CLI 时只处理 `status != "ready"` 的 segment：

```python
for seg in lesson["segments"]:
    if seg["teaching"].get("status") == "ready":
        continue
    # 生成
```

这样 M2 的异步队列也可以安全地重试失败 segment。

---

## 常见问题

| 问题 | 处理 |
|---|---|
| 豆包返回的 JSON 包在 markdown ```里 | 解析前去掉 ```json 和 ``` |
| 429 限流 | `ThreadPoolExecutor(max_workers=3)` + 指数退避 |
| 返回的 steps 不是数组 | Pydantic 校验失败后 status=failed，保留 ai_description fallback |
| 调用成功但解析失败 | 打印原始响应到日志，方便改 prompt |
| 图片编码太大 | cv2 resize 到 512x512 再 base64 |
